/* =====================================================================
   Milo Jump — course infinie (inspirée du Dino de Chrome), univers Milo
   Touche pour sauter, maintiens pour sauter plus haut. Cactus, rochers,
   buissons, barrières et trous ; étoiles et bulle-pansement en bonus.
   Canvas 2D 60 FPS : décor et obstacles pré-rendus, rien n’est alloué
   dans le DOM pendant la course (seul le score change).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames; if (!MG) return;

  /* ---------- Visuels de Milo (remplaçables) ----------
     run : planche de 12 images de course (deux foulées, visuel officiel détouré).
     ax / ay : point de contact au sol dans une image (fraction). */
  const SHEET = { src: 'jump/run.webp', n: 12, fw: 242, fh: 264, ax: 0.55, ay: 0.977 };
  const FACES = { focus: 'pl3_determine', joie: 'pl3_joie', wow: 'pl3_alerte', ko: 'pl3_sommeil', fete: 'pl3_fete' };

  /* ---------- Réglages (unités logiques ; largeur visible = 520) ---------- */
  const VIEW_W = 520, MX = 70, MILO_H = 98;
  const PHYS = { g: 2600, v0: 720, holdG: 0.5, holdT: 0.18, minH: 55, cut: 430 };
  const INK = '#4b3f93';
  const PAL = {
    day: { sky: ['#3f9dff', '#86cbff', '#e2f5ff'], mount: '#9fb4ee', mountHi: '#c9d5fb', snow: '#ffffff', cloud: '#ffffff', cloudMid: '#eef3ff', cloudSh: '#c6d6f6', hill: ['#8fdc63', '#55b445'], hillRim: '#c2f394', tree: ['#86da5e', '#3d9a3a'], trunk: '#9a6a44', grass: ['#9be865', '#56b83c'], grassHi: '#d2fba6', soil: ['#d9975d', '#a7643a'], brick: '#c98450', brickHi: '#eab07c', brickSh: '#9a5a32', pebble: 'rgba(110,60,30,.35)', gem: ['#d6c4ff', '#8f6bff'], pit: '#3d2219', dust: 'rgba(246,236,214,0.95)' },
    night: { sky: ['#0b1238', '#221f63', '#4a3b8e'], mount: '#2a2d6a', mountHi: '#3d4290', snow: '#9aa0e0', cloud: '#4a4a96', cloudMid: '#3d3d84', cloudSh: '#2b2b66', hill: ['#2f6d5a', '#1d4842'], hillRim: '#4f9a78', tree: ['#3a8a66', '#1d4f42'], trunk: '#4a3a3a', grass: ['#46a070', '#2a6e50'], grassHi: '#7fd6a6', soil: ['#6d4a4c', '#3f2a32'], brick: '#5f4246', brickHi: '#80605f', brickSh: '#3c2a30', pebble: 'rgba(0,0,0,.3)', gem: ['#8fe3ff', '#5b4bd6'], pit: '#120a18', dust: 'rgba(150,140,205,0.9)' }
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (x) => { x = clamp(x, 0, 1); return x * (2 - x); };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`; };

  /* ---------- État ---------- */
  let api = null, root = null, cv = null, ctx = null, ro = null, raf = 0, last = 0, rTimer = 0, rng = Math.random;
  const IMG = {}, V = { cw: 0, ch: 0, dpr: 1, s: 1, K: 1, ww: VIEW_W, gy: 0 };
  let L = {}, st = null, UI = {};
  const parts = [], floats = [];

  function loadImgs() {
    if (!IMG.run) { const im = new Image(); im.decoding = 'async'; im.onload = () => (im.ok = true); im.src = MG.asset(SHEET.src); IMG.run = im; }
    Object.keys(FACES).forEach((k) => { if (IMG[k]) return; const im = new Image(); im.onload = () => (im.ok = true); im.src = `assets/${FACES[k]}.webp`; IMG[k] = im; });
  }

  /* ---------- Partie ---------- */
  const score = () => Math.floor(st.dist / 22) + (st.bonusPts || 0);
  const speed = () => 330 + Math.min(430, st.dist * 0.0055);
  function newRun() {
    st = { state: st && st.state === 'menu' ? 'menu' : 'menu', t: 0, dist: 0, obs: [], bonus: [], nextAt: 520, nextBonus: 900 + Math.random() * 600, nextShield: 0,
      y: 0, vy: 0, ground: true, hold: false, holdT: 0, jumped: false, buffer: -9, coyote: 0, cutDone: false, runPh: 0, sx: 1, sy: 1, sv: 0, syv: 0, rot: 0,
      shield: false, inv: 0, stars: 0, bonusPts: 0, lastFrame: -1, isNight: false, jumps: 0, prevBest: api.data.best || 0, recShown: false, lastHund: 0, night: 0, nightTo: 0, shake: 0, flash: 0,
      emote: null, emoteT: 0, msgAt: -9, nearAt: -9, dead: null, deadT: 0, finished: false, started: false, dirty: false, saveAt: 0, idle: 0, stepAt: 0 };
    parts.length = 0; floats.length = 0;
    rng = MG.rng((Date.now() ^ Math.floor(Math.random() * 4294967295)) >>> 0);
    st.nextShield = 300 * 22 + rng() * 9000;
    updHud();
  }
  function setState(s) { st.state = s; if (root) root.dataset.state = s; }

  function press() {
    if (!st) return;
    if (st.state === 'paused') { resume(); return; }
    if (st.state !== 'play' || st.dead) return;
    st.hold = true;
    if (st.ground || st.coyote > 0) jump(); else st.buffer = st.t;
  }
  function release() { if (st) st.hold = false; }
  function jump() {
    st.vy = PHYS.v0; st.ground = false; st.coyote = 0; st.holdT = 0; st.cutDone = false; st.jumps++;
    st.sx = 0.86; st.sy = 1.16; st.sv = 0; st.syv = 0;
    if (!st.jumped) { st.jumped = true; root.classList.add('moved'); }
    MG.sfx.play('hop');
    for (let i = 0; i < 4; i++) addP('dust', MX - 8 + rng() * 16, 0, -60 - rng() * 80, 20 + rng() * 40, 0.4, 7 + rng() * 5);
  }
  function emote(k, dur) { st.emote = k; st.emoteT = st.t; st.emoteDur = dur || 1; }
  function msg(text, kind) {
    if (!UI.msg) return;
    if (st.t - st.msgAt < 1.1 && st.msgKind === 'gold' && kind !== 'gold') return;
    st.msgAt = st.t; st.msgKind = kind || '';
    UI.msg.textContent = text; UI.msg.className = 'jp-msg ' + (kind || ''); void UI.msg.offsetWidth; UI.msg.classList.add('show');
  }

  /* ---------- Obstacles et bonus ---------- */
  function spawn() {
    const sc = score(), sp = speed(), d = clamp(sc / 900, 0, 1);
    const pool = [['rock', 3], ['bush', 3], ['cactus', 4]];
    if (sc > 110) pool.push(['hole', 2.2]); if (sc > 160) pool.push(['spikes', 2.4]); if (sc > 200) pool.push(['fence', 2.2]); if (sc > 320) pool.push(['cluster', 2.6]);
    let tot = 0; pool.forEach((p) => (tot += p[1])); let x = rng() * tot, type = 'rock';
    for (const p of pool) { x -= p[1]; if (x <= 0) { type = p[0]; break; } }
    const wx = st.dist + (V.ww - MX) + 40;
    let o;
    if (type === 'rock') { const w = 34 + rng() * 14; o = { type, w, h: 24 + rng() * 10, v: Math.floor(rng() * 3) }; }
    else if (type === 'bush') { const w = 46 + rng() * 16; o = { type, w, h: 34 + rng() * 10, v: Math.floor(rng() * 3) }; }
    else if (type === 'cactus') { const tall = rng() < 0.45 + 0.3 * d; o = { type, w: tall ? 30 : 24, h: tall ? 66 + rng() * 6 : 46 + rng() * 6, v: Math.floor(rng() * 3), n: 1 }; }
    else if (type === 'cluster') { const n = 2 + (rng() < 0.35 + 0.3 * d ? 1 : 0); o = { type: 'cactus', w: n * 24 + (n - 1) * 3, h: 48 + rng() * 10, v: Math.floor(rng() * 3), n }; }
    else if (type === 'spikes') { const n = rng() < 0.55 + 0.25 * d ? 3 : 2; o = { type, w: n * 18, h: 26 + rng() * 6, n }; }
    else if (type === 'fence') { const n = rng() < 0.5 ? 2 : 3; o = { type, w: n === 2 ? 40 : 66, h: 58 + rng() * 14, n }; }
    else { o = { type: 'hole', w: Math.min(124, 62 + rng() * 34 + d * 28), h: 0 }; }
    o.x = wx; o.key = o.type + Math.round(o.w) + Math.round(o.h) + (o.v || 0) + (o.n || 0); o.passed = false;
    st.obs.push(o);
    const air = 0.56, gap = sp * (air + 0.3 + rng() * (1.05 - 0.45 * d)) + o.w;
    st.nextAt = o.x + gap - (V.ww - MX) - 40;
    // bonus
    if (st.dist > st.nextBonus) { st.nextBonus = st.dist + 2600 + rng() * 2600; const bx = o.x + o.w / 2 + (o.type === 'hole' ? 0 : (rng() < 0.5 ? 0 : gap * 0.45)); st.bonus.push({ type: 'star', x: bx, h: o.type === 'hole' || bx === o.x + o.w / 2 ? 92 + rng() * 26 : 26 + rng() * 40 }); }
    if (st.dist > st.nextShield && !st.shield && !st.bonus.some((b) => b.type === 'shield')) { st.nextShield = st.dist + 9000 + rng() * 7000; st.bonus.push({ type: 'shield', x: o.x + gap * 0.5, h: 44 + rng() * 40 }); }
  }
  // boîtes de collision (unités, relatives à l’obstacle)
  function boxes(o) {
    if (o.type === 'rock') return [[o.w * 0.12, o.w * 0.88, o.h * 0.88]];
    if (o.type === 'bush') return [[o.w * 0.14, o.w * 0.86, o.h * 0.82]];
    if (o.type === 'fence') return [[2, o.w - 2, o.h * 0.94]];
    if (o.type === 'spikes') { const out = []; for (let i = 0; i < o.n; i++) out.push([i * 18 + 5, i * 18 + 13, o.h * 0.8]); return out; }
    if (o.type === 'cactus') { const out = []; for (let i = 0; i < o.n; i++) { const x0 = i * 27; out.push([x0 + 5, x0 + 19, o.h * (i === 1 ? 1.02 : 0.95) - 2]); } return out; }
    return [];
  }
  function overHole(wx0, wx1) { for (const o of st.obs) if (o.type === 'hole' && wx0 > o.x + 4 && wx1 < o.x + o.w - 4) return o; return null; }

  /* ---------- Particules ---------- */
  function addP(type, x, y, vx, vy, life, size, g) {
    if (parts.length > 200) return;
    if (MG.reduced() && Math.random() < 0.6) return;
    parts.push({ type, x, y, vx, vy, life, max: life, size, g: g || 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
  }

  /* ---------- Boucle ---------- */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = last ? (now - last) / 1000 : 0; last = now; if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
    if (!st || !L.ready || st.state === 'paused') return;
    if (st.state === 'over' && !parts.length && st.shake <= 0 && st.flash <= 0) { if (++st.idle > 3) return; } else st.idle = 0;
    update(dt); draw();
  }
  function update(dt) {
    st.t += dt;
    const S = st.state, playing = S === 'play' && !st.dead;
    const sp = S === 'menu' ? 150 : playing ? speed() : 0;
    if (playing) {
      st.dist += sp * dt;
      // saut : gravité réduite tant que le doigt reste posé (hauteur modulée)
      if (!st.ground) {
        let g = PHYS.g;
        if (st.hold && st.vy > 0 && st.holdT < PHYS.holdT) { g *= PHYS.holdG; st.holdT += dt; }
        if (!st.hold && !st.cutDone && st.y >= PHYS.minH && st.vy > PHYS.cut) { st.vy = PHYS.cut; st.cutDone = true; }
        st.vy -= g * dt; st.y += st.vy * dt;
        if (st.y <= 0 && st.vy < 0) {
          const hole = overHole(st.dist - 12, st.dist + 12);
          if (!hole) {
            st.y = 0; st.vy = 0; st.ground = true; st.sx = 1.18; st.sy = 0.84; st.sv = 0; st.syv = 0;
            for (let i = 0; i < 6; i++) addP('dust', MX + (rng() - 0.5) * 30, 0, (rng() - 0.5) * 160 - sp * 0.3, 30 + rng() * 60, 0.45, 8 + rng() * 6);
            if (st.t - st.buffer < 0.13) { st.buffer = -9; jump(); }
          } else if (st.y < -46) die('hole');
        }
      } else {
        const hole = overHole(st.dist - 12, st.dist + 12);
        if (hole) { st.ground = false; st.coyote = 0.08; st.vy = 0; }
        st.runPh += dt * (12 + sp * 0.022); // cadence calée sur la vitesse
        const fr = Math.floor(st.runPh) % SHEET.n; if (fr !== st.lastFrame) { st.lastFrame = fr; if (fr === 4 || fr === 10) { addP('dust', MX - 2, 0, -sp * 0.35 - 30, 18 + rng() * 22, 0.4, 7 + rng() * 4); addP('dust', MX + 6, 0, -sp * 0.25, 10 + rng() * 14, 0.3, 5 + rng() * 3); } else if (fr === 2 || fr === 8) addP('dust', MX - 16, 0, -sp * 0.4 - 40, 26 + rng() * 20, 0.32, 5 + rng() * 3); }
      }
      if (st.coyote > 0) st.coyote -= dt;
      // apparition
      if (st.dist >= st.nextAt) spawn();
      while (st.obs.length && st.obs[0].x + st.obs[0].w < st.dist - MX - 40) st.obs.shift();
      while (st.bonus.length && st.bonus[0].x < st.dist - MX - 40) st.bonus.shift();
      // collisions
      if (st.inv > 0) st.inv -= dt;
      const bx = 0, by = st.y + 43, br = 27;
      for (const o of st.obs) {
        const ox = o.x - st.dist; if (ox > 70 || ox + o.w < -70) continue;
        if (o.type === 'hole') continue;
        for (const [x0, x1, h] of boxes(o)) {
          const nx = clamp(bx, ox + x0, ox + x1), ny = clamp(by, 0, h), dx = bx - nx, dy = by - ny;
          const footHit = st.y < h - 2 && ox + x1 > -13 && ox + x0 < 13;
          if (dx * dx + dy * dy < br * br || footHit) {
            if (st.inv > 0) break;
            if (st.shield) { st.shield = false; st.inv = 1; o.gone = true; MG.sfx.play('bonk'); burstAt(ox + o.w / 2, h / 2, ['#7cc8ff', '#ffffff', '#c8b6ff'], 14); msg('Bulle protectrice !'); break; }
            die('hit', ox + o.w / 2, h); break;
          }
        }
        if (!o.passed && ox + o.w < -14) {
          o.passed = true;
          const top = o.h; if (st.y - top < 12 && st.y > top - 4 && st.t - st.nearAt > 5) { st.nearAt = st.t; emote('wow', 0.8); }
        }
      }
      st.obs = st.obs.filter((o) => !o.gone);
      for (const b of st.bonus) {
        if (b.got) continue; const ox = b.x - st.dist; if (Math.abs(ox) > 40) continue;
        const dy = (st.y + 43) - b.h; if (ox * ox + dy * dy < 42 * 42) {
          b.got = true;
          if (b.type === 'star') { st.stars++; st.bonusPts += 50; MG.sfx.play('star'); burstAt(ox, b.h, ['#ffd84d', '#fff3b3', '#ffffff'], 12); floats.push({ x: ox, y: b.h + 20, t: 0, text: '+50' }); if (rng() < 0.5) emote('joie', 0.8); }
          else { st.shield = true; MG.sfx.play('unlock'); burstAt(ox, b.h, ['#7cc8ff', '#ffffff'], 14); msg('Bulle-pansement : un choc protégé'); emote('joie', 0.9); }
        }
      }
      st.bonus = st.bonus.filter((b) => !b.got);
      // score, paliers, record, nuit
      const sc = score();
      if (sc !== st.lastScore) { st.lastScore = sc; UI.score.textContent = String(sc).padStart(5, '0'); }
      const hund = Math.floor(sc / 100);
      if (hund > st.lastHund) {
        st.lastHund = hund; UI.score.classList.remove('blink'); void UI.score.offsetWidth; UI.score.classList.add('blink'); MG.sfx.play('tap');
        if (hund % 5 === 0) { emote('focus', 1); msg(hund % 20 === 0 ? 'Incroyable !' : hund % 10 === 0 ? 'Continue comme ça !' : 'Ça accélère !'); }
      }
      const nightOn = Math.floor(sc / 700) % 2 === 1; st.nightTo = nightOn ? 1 : 0;
      if (st.prevBest > 0 && sc > st.prevBest && !st.recShown) { st.recShown = true; msg('Nouveau record !', 'gold'); emote('fete', 1.4); MG.sfx.play('record'); try { api.fx.confetti(70); } catch (e) {} burstAt(0, 50, ['#ffd84d', '#ffffff', '#ffb3d1'], 18); }
      if (sc > (api.data.best || 0)) { api.data.best = sc; UI.best.textContent = String(sc).padStart(5, '0'); st.dirty = true; }
      if (st.dirty && st.t - st.saveAt > 3) { st.saveAt = st.t; api.save(); st.dirty = false; }
    } else if (S === 'menu') {
      st.dist += sp * dt; st.runPh += dt * 15;
    }
    if (st.dead) {
      st.deadT += dt;
      if (st.dead === 'hit') { if (!st.ground) { st.vy -= PHYS.g * 0.8 * dt; st.y += st.vy * dt; st.rot -= dt * 9; if (st.y <= 0) { st.y = 0; st.ground = true; st.rot = 0; st.sx = 1.25; st.sy = 0.78; MG.sfx.play('bonk'); for (let i = 0; i < 6; i++) addP('dust', MX + (rng() - 0.5) * 30, 0, (rng() - 0.5) * 140, 30 + rng() * 50, 0.45, 8 + rng() * 6); } } }
      else if (st.dead === 'hole') { st.vy -= PHYS.g * dt; st.y += st.vy * dt; st.rot += dt * 3; }
    }
    st.night += (st.nightTo - st.night) * Math.min(1, dt * 1.4);
    const isN = st.night > 0.5; if (isN !== st.isNight) { st.isNight = isN; root.classList.toggle('night', isN); }
    // ressorts
    st.sv += ((1 - st.sx) * 320 - st.sv * 18) * dt; st.sx += st.sv * dt;
    st.syv += ((1 - st.sy) * 320 - st.syv * 18) * dt; st.sy += st.syv * dt;
    if (!st.dead || st.dead === 'hit' && st.ground) { const tr = st.ground ? 0 : clamp(-st.vy / 2400, -0.22, 0.2); if (!st.dead) st.rot += (tr - st.rot) * Math.min(1, dt * 10); }
    if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 2.8);
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 3.5);
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; } p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y += 50 * dt; if (f.t > 0.9) floats.splice(i, 1); }
  }
  function burstAt(x, y, cols, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 120 + Math.random() * 220; addP(i % 3 ? 'spark' : 'gold', MX + x, y, Math.cos(a) * v, Math.sin(a) * v + 80, 0.7, 9 + Math.random() * 7, 520); } }
  function die(kind, ox, oy) {
    if (st.dead) return;
    st.dead = kind; st.deadT = 0; st.hold = false;
    if (kind === 'hit') { st.vy = 560; st.ground = false; st.shake = MG.reduced() ? 0 : 1; st.flash = 1; MG.sfx.play('crash'); burstAt(ox - 10, oy, ['#ffd84d', '#ffffff', '#b48cff'], 16); msg(pick(['Boing !', 'Aïe, un obstacle !', 'Oups !']), 'warn'); }
    else { MG.sfx.play('whoosh'); setTimeout(() => MG.sfx.play('over'), 300); msg('Oups, un trou !', 'warn'); }
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
    finishRun();
    setTimeout(() => { if (root && st && st.dead) showOver(); }, kind === 'hit' ? 1150 : 800);
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function finishRun() {
    if (st.finished || !st.started) return;
    st.finished = true;
    const d = api.data, s = d.stats || (d.stats = {}), sc = score(), now = new Date().toISOString();
    s.games = (s.games || 0) + 1; s.dist = (s.dist || 0) + Math.round(st.dist); s.stars = (s.stars || 0) + st.stars; s.jumps = (s.jumps || 0) + st.jumps;
    if (sc > (d.best || 0)) d.best = sc;
    if (sc > st.prevBest) d.bestAt = now;
    d.top = (d.top || []).concat([{ s: sc, at: now }]).sort((a, b) => b.s - a.s).slice(0, 10);
    d.last = sc; d.lastPlayed = now;
    api.save(); st.dirty = false; st.runAt = now;
  }

  /* ---------- Rendu ---------- */
  const GYU = () => V.gy; // ligne de sol (px css)
  // course de Milo : rebond du corps (unités) et étirement vertical, image par image
  const LIFT = [0, 0.6, 2.6, 3.4, 1.2, 0, 0, 0.6, 2.6, 3.4, 1.8, 0];
  const SQ = [1, 1, 1.015, 1.025, 0.965, 0.99, 1, 1, 1.015, 1.025, 0.97, 0.99];
  const SPP = { side: 8, top: 10, bot: 7 }; // marges des sprites d’obstacles (unités)
  function draw() {
    const c = ctx, K = V.K, k = st.night;
    let ox = 0, oy = 0; if (st.shake > 0) { const a = st.shake * st.shake * 6 * K; ox = (Math.random() * 2 - 1) * a; oy = (Math.random() * 2 - 1) * a; }
    const gyD = V.gy * V.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    // ciel
    const kk = Math.round(k * 40);
    if (!L.sky || L.skyK !== kk) {
      const g = c.createLinearGradient(0, 0, 0, gyD), a = PAL.day.sky, b = PAL.night.sky;
      g.addColorStop(0, mix(a[0], b[0], k)); g.addColorStop(0.55, mix(a[1], b[1], k)); g.addColorStop(1, mix(a[2], b[2], k));
      L.sky = g; L.skyK = kk; L.gfill = mix(PAL.day.soil[1], PAL.night.soil[1], k);
    }
    c.fillStyle = L.sky; c.fillRect(0, 0, cv.width, gyD + 2);
    c.fillStyle = L.gfill; c.fillRect(0, gyD, cv.width, cv.height - gyD);
    // étoiles et astres
    const orbX = cv.width - 76 * K, orbY = gyD * 0.2;
    if (k > 0.01) { c.globalAlpha = k; c.drawImage(L.stars, 0, 0); c.drawImage(L.moon, orbX - L.moon.width / 2, orbY - L.moon.height / 2); }
    if (k < 0.99) { c.globalAlpha = 1 - k; c.drawImage(L.sun, orbX - L.sun.width / 2, orbY - L.sun.height / 2); }
    c.globalAlpha = 1;
    // montagnes, nuages, collines (parallaxe)
    layer2(L.mount, st.dist * 0.05, gyD - L.mount[0].height + 6 * K, k, ox * 0.2, 0);
    const span = V.ww + 300;
    for (const cl of L.clouds) {
      const x = ((cl.x - st.dist * cl.p - st.t * cl.drift) % span + span) % span - 150, y = Math.round(gyD - cl.h * K - cl.img[0].height);
      if (k < 0.99) { c.globalAlpha = 1 - k; c.drawImage(cl.img[0], Math.round(x * K + ox * 0.4), y); }
      if (k > 0.01) { c.globalAlpha = k; c.drawImage(cl.img[1], Math.round(x * K + ox * 0.4), y); }
    }
    c.globalAlpha = 1;
    layer2(L.hills, st.dist * 0.24, gyD - L.hills[0].height + 3 * K, k, ox * 0.5, 0);
    // sol : herbe + briques de terre (les brins dépassent un peu au-dessus de la ligne)
    layer2(L.ground, st.dist, gyD - L.gTop * K, k, ox, oy);
    c.setTransform(K, 0, 0, K, ox, gyD + oy);
    for (const h of st.obs) if (h.type === 'hole') drawHole(c, h, k);
    // obstacles
    for (const o of st.obs) {
      if (o.type === 'hole') continue;
      const x = MX + o.x - st.dist; if (x > V.ww + 20 || x + o.w < -20) continue;
      const dx = x - SPP.side, dy = -o.h - SPP.top, dw = o.w + SPP.side * 2, dh = o.h + SPP.top + SPP.bot;
      if (k < 0.99) { c.globalAlpha = 1; c.drawImage(sprite(o, false), dx, dy, dw, dh); }
      if (k > 0.01) { c.globalAlpha = k; c.drawImage(sprite(o, true), dx, dy, dw, dh); }
      c.globalAlpha = 1;
    }
    // bonus
    for (const b of st.bonus) {
      const x = MX + b.x - st.dist; if (x > V.ww + 30 || x < -30) continue;
      const bob = Math.sin(st.t * 4 + b.x) * 4, img = b.type === 'star' ? L.star : L.shield, sz = b.type === 'star' ? 34 : 40;
      c.save(); c.translate(x, -b.h + bob); if (b.type === 'star') c.rotate(Math.sin(st.t * 3 + b.x) * 0.25); c.drawImage(img, -sz / 2, -sz / 2, sz, sz); c.restore();
    }
    // Milo
    drawMilo(ox, oy);
    // particules
    c.setTransform(K, 0, 0, K, ox, gyD + oy);
    for (const p of parts) {
      const kk2 = p.life / p.max;
      if (p.type === 'dust') { c.globalAlpha = kk2 * 0.85; const s = p.size * (1 + (1 - kk2)); c.drawImage(k > 0.5 ? L.puffN : L.puff, p.x - s / 2, -p.y - s / 2, s, s); continue; }
      const img = p.type === 'gold' ? L.goldP : L.spark, s = p.size * (0.4 + 0.6 * kk2);
      c.globalAlpha = Math.min(1, kk2 * 1.6); c.save(); c.translate(p.x, -p.y); c.rotate(p.rot); c.drawImage(img, -s / 2, -s / 2, s, s); c.restore();
    }
    c.globalAlpha = 1;
    // textes flottants
    c.font = V.font; c.textAlign = 'center';
    for (const f of floats) { c.globalAlpha = 1 - f.t / 0.9; c.lineWidth = 4; c.strokeStyle = '#ffffff'; c.strokeText(f.text, MX + f.x, -f.y); c.fillStyle = '#e09c0c'; c.fillText(f.text, MX + f.x, -f.y); }
    c.globalAlpha = 1;
    if (st.flash > 0) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = `rgba(255,255,255,${(st.flash * 0.6).toFixed(3)})`; c.fillRect(0, 0, cv.width, cv.height); }
  }
  function tile(img, off, yD, a, ox, oy) {
    if (a <= 0.005) return; const w = img.width; let x = Math.round(-((off * V.K) % w) + (ox || 0)); const y = Math.round(yD + (oy || 0));
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; for (; x < cv.width; x += w) ctx.drawImage(img, x, y); ctx.globalAlpha = 1;
  }
  function layer2(imgs, off, yD, k, ox, oy) { if (k < 0.99) tile(imgs[0], off, yD, 1, ox, oy); if (k > 0.01) tile(imgs[1], off, yD, k, ox, oy); }
  // trou : fosse sombre, parois de terre, lèvres d’herbe arrondies
  function drawHole(c, h, k) {
    const x = MX + h.x - st.dist, w = h.w; if (x > V.ww + 10 || x + w < -10) return;
    const deep = (V.ch - V.gy) / V.s + 6, P = (n, i) => mix(PAL.day[n][i] || PAL.day[n], PAL.night[n][i] || PAL.night[n], k);
    const g = c.createLinearGradient(0, -6, 0, Math.min(deep, 160));
    g.addColorStop(0, P('soil', 1)); g.addColorStop(0.25, mix(PAL.day.pit, PAL.night.pit, k)); g.addColorStop(1, '#0c0612');
    c.fillStyle = g; c.fillRect(x + 1, -6, w - 2, deep);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x + 1, -6, 7, deep); c.fillRect(x + w - 8, -6, 7, deep);
    c.fillStyle = P('grass', 1);
    c.beginPath(); c.ellipse(x + 2, 1, 6, 5.5, 0, 0, 6.283); c.ellipse(x + w - 2, 1, 6, 5.5, 0, 0, 6.283); c.fill();
    c.fillStyle = P('grass', 0);
    c.beginPath(); c.ellipse(x + 1, -0.5, 5, 4, 0, 0, 6.283); c.ellipse(x + w - 1, -0.5, 5, 4, 0, 0, 6.283); c.fill();
  }
  function drawMilo(ox, oy) {
    const c = ctx, K = V.K, gyD = V.gy * V.dpr;
    const ko = st.dead === 'hit' && st.ground && st.deadT > 0.15;
    c.setTransform(K, 0, 0, K, ox + MX * K, gyD + oy);
    // ombre
    const sh = clamp(1 - st.y / 160, 0.3, 1); if (st.y > -4 && !(st.dead === 'hole') && !overHole(st.dist - 12, st.dist + 12)) { c.globalAlpha = (st.night > 0.5 ? 0.3 : 0.24) * sh; c.fillStyle = st.night > 0.5 ? '#000' : '#1f4a1c'; c.beginPath(); c.ellipse(2, 1, 30 * sh, 5 * sh, 0, 0, 6.283); c.fill(); c.globalAlpha = 1; }
    c.translate(0, -Math.max(st.y, -400));
    if (st.y < 0) c.globalAlpha = clamp(1 + st.y / 110, 0, 1);
    if (st.inv > 0 && Math.floor(st.t * 16) % 2) c.globalAlpha = 0.5;
    if (ko && IMG.ko && IMG.ko.ok) {
      // Milo étourdi, des étoiles tournent autour de sa tête
      c.scale(st.sx, st.sy); c.drawImage(IMG.ko, -36, -70, 72, 72);
      for (let i = 0; i < 3; i++) { const a = st.t * 4 + i * 2.094, x = Math.cos(a) * 30, y = -74 + Math.sin(a) * 7; c.drawImage(L.goldP, x - 7, y - 7, 14, 14); }
      c.globalAlpha = 1; return;
    }
    const im = IMG.run; if (!im || !im.ok) { c.globalAlpha = 1; return; }
    let bob = 0, f, sq = 1;
    if (st.ground && !st.dead) {
      // rebond interpolé entre deux images pour une course fluide
      const ph = st.runPh % SHEET.n, fr = ph - Math.floor(ph); f = Math.floor(ph);
      const nx = (f + 1) % SHEET.n; bob = LIFT[f] + (LIFT[nx] - LIFT[f]) * fr; sq = SQ[f] + (SQ[nx] - SQ[f]) * fr;
    } else f = st.vy > 0 ? 3 : 10;
    const H = MILO_H, W = H * SHEET.fw / SHEET.fh;
    c.translate(0, -bob); c.rotate(st.rot); c.scale(st.sx * (2 - sq), st.sy * sq);
    c.drawImage(im, f * SHEET.fw, 0, SHEET.fw, SHEET.fh, -SHEET.ax * W, -SHEET.ay * H, W, H);
    c.globalAlpha = 1;
    if (st.shield) { const r = 50 + Math.sin(st.t * 5) * 1.5; c.drawImage(L.bubble, -r + 2, -45 - r, r * 2, r * 2); }
    // bulle d’expression
    if (st.emote && st.t - st.emoteT < st.emoteDur && IMG[st.emote] && IMG[st.emote].ok) {
      const e = (st.t - st.emoteT) / st.emoteDur, pop = e < 0.15 ? ease(e / 0.15) * 1.12 : e > 0.85 ? (1 - e) / 0.15 : 1;
      c.setTransform(K, 0, 0, K, ox + (MX + 32) * K, gyD + oy - (st.y + 124) * K); c.scale(pop, pop);
      c.drawImage(L.emote, -26, -26, 52, 58); c.save(); c.beginPath(); c.arc(0, 0, 21, 0, 6.283); c.clip(); c.drawImage(IMG[st.emote], -22, -21, 44, 44); c.restore();
    }
  }

  /* ---------- Pré-rendu ---------- */
  function mk(wu, hu) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(wu * V.K)); c.height = Math.max(1, Math.round(hu * V.K)); const x = c.getContext('2d'); x.scale(c.width / wu, c.height / hu); return [c, x]; }
  function rr(x, a, b, w, h, r) { r = Math.min(r, w / 2, h / 2); x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function star5(x, cx, cy, R, r) { x.beginPath(); for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.5708, b = a + 0.6283; x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r); } x.closePath(); }
  function lin(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(Array.isArray(s) ? s[0] : i / (stops.length - 1), Array.isArray(s) ? s[1] : s)); return g; }
  const SPR = {};
  // obstacles : volumes doux (dégradés, reflets, ombre de contact), même univers que le logo
  function sprite(o, night) {
    const key = o.key + (night ? '|n' : '');
    if (SPR[key]) return SPR[key];
    if (night) {
      const base = sprite(o, false), c2 = document.createElement('canvas'); c2.width = base.width; c2.height = base.height;
      const x2 = c2.getContext('2d'); x2.drawImage(base, 0, 0); x2.globalCompositeOperation = 'source-atop'; x2.fillStyle = 'rgba(22,20,78,.42)'; x2.fillRect(0, 0, c2.width, c2.height);
      return (SPR[key] = c2);
    }
    const [c, x] = mk(o.w + SPP.side * 2, o.h + SPP.top + SPP.bot); x.translate(SPP.side, o.h + SPP.top);
    x.lineJoin = 'round'; x.lineCap = 'round';
    const R = MG.rng(Math.round(o.w * 31 + o.h * 7 + (o.v || 0) * 13 + (o.n || 0)));
    const shadow = (cx, w) => { x.save(); x.translate(cx, 1.5); x.scale(1, 0.24); const g = x.createRadialGradient(0, 0, 0, 0, 0, w / 2); g.addColorStop(0, 'rgba(28,52,22,.38)'); g.addColorStop(1, 'rgba(28,52,22,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, w / 2, 0, 6.283); x.fill(); x.restore(); };
    const w = o.w, h = o.h;
    if (o.type === 'rock') {
      shadow(w / 2, w * 1.25);
      const path = () => { x.beginPath(); x.moveTo(w * 0.02, 0.5); x.bezierCurveTo(-w * 0.04, -h * 0.42, w * 0.06, -h * 0.84, w * 0.3, -h * 0.9); x.bezierCurveTo(w * 0.42, -h * 1.06, w * 0.62, -h * 1.03, w * 0.72, -h * 0.86); x.bezierCurveTo(w * 0.92, -h * 0.8, w * 1.05, -h * 0.42, w * 0.98, 0.5); x.closePath(); };
      if (o.v !== 1) { x.save(); x.translate(w * 1.02, 0); const pg = x.createRadialGradient(-1, -4, 0.5, 0, -2, 6); pg.addColorStop(0, '#ece8fb'); pg.addColorStop(1, '#8f87bb'); x.fillStyle = pg; x.beginPath(); x.ellipse(0, -2.6, 5.5, 3.6, 0, 0, 6.283); x.fill(); x.restore(); }
      path(); x.fillStyle = (() => { const g = x.createRadialGradient(w * 0.34, -h * 0.78, 1, w * 0.5, -h * 0.35, w * 0.85); g.addColorStop(0, '#f6f3ff'); g.addColorStop(0.45, '#c6bfe4'); g.addColorStop(1, '#8a82b8'); return g; })(); x.fill();
      x.save(); path(); x.clip();
      x.fillStyle = 'rgba(80,68,150,.2)'; x.beginPath(); x.moveTo(w * 0.6, 1); x.quadraticCurveTo(w * 0.68, -h * 0.5, w, -h * 0.62); x.lineTo(w + 2, 1); x.closePath(); x.fill();
      if (o.v === 1) { // mousse sur le dessus
        x.fillStyle = lin(x, 0, -h * 1.05, 0, -h * 0.6, ['#a8ec7a', '#5cbf47']); x.beginPath(); x.moveTo(-2, -h * 0.52);
        for (let i = 0; i <= 8; i++) { const px = (i / 8) * (w + 4) - 2; x.lineTo(px, -h * (0.62 + (i % 2 ? 0.08 : 0)) + Math.sin(i * 2.1) * 1.5); }
        x.lineTo(w + 4, -h * 1.2); x.lineTo(-2, -h * 1.2); x.closePath(); x.fill();
        x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(w * 0.38, -h * 0.88, w * 0.12, h * 0.05, -0.3, 0, 6.283); x.fill();
      } else if (o.v === 2) { // fissure
        x.strokeStyle = 'rgba(70,58,130,.45)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(w * 0.55, -h * 0.95); x.lineTo(w * 0.6, -h * 0.66); x.lineTo(w * 0.52, -h * 0.48); x.lineTo(w * 0.58, -h * 0.26); x.stroke();
      }
      x.restore();
      path(); x.lineWidth = 1.5; x.strokeStyle = 'rgba(66,54,128,.45)'; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.ellipse(w * 0.32, -h * 0.74, w * 0.1, h * 0.065, -0.5, 0, 6.283); x.fill();
    } else if (o.type === 'bush') {
      shadow(w / 2, w * 1.15);
      const balls = [[0.5, 0.2, 0.46, 0.22], [0.2, 0.36, 0.22, 0.36], [0.8, 0.38, 0.21, 0.36], [0.36, 0.56, 0.25, 0.42], [0.64, 0.58, 0.25, 0.42], [0.5, 0.7, 0.24, 0.32]];
      const ball = (b, grow, fill) => { const [a, yy, rw, rh] = b, cx = w * a, cy = -h * yy, rx = w * rw + grow, ry = Math.min(h * rh, w * rw * 1.1) + grow; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.283); x.fillStyle = fill || (() => { const g = x.createRadialGradient(cx - rx * 0.35, cy - ry * 0.5, 0.5, cx, cy, Math.max(rx, ry)); g.addColorStop(0, '#d2f8a8'); g.addColorStop(0.45, '#82d65c'); g.addColorStop(1, '#3f9b3e'); return g; })(); x.fill(); };
      balls.forEach((b) => ball(b, 1.4, '#2f7d33'));
      balls.forEach((b) => ball(b, 0));
      x.fillStyle = 'rgba(255,255,255,.45)'; balls.slice(3).forEach(([a, yy, rw]) => { x.beginPath(); x.ellipse(w * a - w * rw * 0.35, -h * yy - h * 0.12, w * rw * 0.22, h * 0.05, -0.4, 0, 6.283); x.fill(); });
      const deco = o.v === 1 ? ['#ff4d6d', '#d6213f'] : o.v === 2 ? ['#ffffff', '#ffd23f'] : ['#ff9fd0', '#ffd23f'];
      for (let i = 0; i < 4; i++) {
        const px = w * (0.22 + i * 0.19 + (R() - 0.5) * 0.06), py = -h * (0.32 + (i % 2) * 0.24 + R() * 0.1);
        if (o.v === 1) { x.fillStyle = deco[1]; x.beginPath(); x.arc(px + 0.6, py + 0.6, 2.6, 0, 6.283); x.fill(); x.fillStyle = deco[0]; x.beginPath(); x.arc(px, py, 2.3, 0, 6.283); x.fill(); x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.arc(px - 0.8, py - 0.8, 0.7, 0, 6.283); x.fill(); }
        else { x.fillStyle = deco[0]; for (let p = 0; p < 5; p++) { const a = p * 1.2566; x.beginPath(); x.arc(px + Math.cos(a) * 2.1, py + Math.sin(a) * 2.1, 1.7, 0, 6.283); x.fill(); } x.fillStyle = deco[1]; x.beginPath(); x.arc(px, py, 1.3, 0, 6.283); x.fill(); }
      }
    } else if (o.type === 'cactus') {
      for (let i = 0; i < o.n; i++) {
        const x0 = i * 27, cw = 16, hh = o.h * (i === 1 ? 1.02 : 0.95) - (i === 2 ? 8 : 0), cx = x0 + 12;
        shadow(cx, 30);
        const body = lin(x, cx - cw / 2, 0, cx + cw / 2, 0, ['#b9f5be', '#62cd7c', '#2f9354']);
        const arm = (side, yb, len) => {
          const ax = cx + side * (cw / 2 - 1), ay = -yb;
          x.beginPath(); x.moveTo(ax, ay); x.lineTo(ax + side * 6, ay); x.quadraticCurveTo(ax + side * 11, ay, ax + side * 11, ay - 5); x.lineTo(ax + side * 11, ay - len);
          x.lineWidth = 10.5; x.strokeStyle = 'rgba(28,104,58,.55)'; x.stroke(); x.lineWidth = 8; x.strokeStyle = '#5ac977'; x.stroke(); x.lineWidth = 2.5; x.strokeStyle = 'rgba(255,255,255,.35)';
          x.beginPath(); x.moveTo(ax + side * 9.5, ay - 4); x.lineTo(ax + side * 9.5, ay - len + 2); x.stroke();
        };
        if (hh > 40) { arm(1, hh * 0.42, hh * 0.3); if (R() < 0.75) arm(-1, hh * 0.58, hh * 0.24); }
        rr(x, cx - cw / 2, -hh, cw, hh + 1, cw / 2); x.fillStyle = body; x.fill(); x.lineWidth = 1.4; x.strokeStyle = 'rgba(28,104,58,.55)'; x.stroke();
        x.save(); rr(x, cx - cw / 2, -hh, cw, hh + 1, cw / 2); x.clip();
        x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(cx - 3.5, -hh + 5); x.lineTo(cx - 3.5, 0); x.stroke();
        x.strokeStyle = 'rgba(20,90,50,.28)'; x.beginPath(); x.moveTo(cx + 2.5, -hh + 5); x.lineTo(cx + 2.5, 0); x.stroke();
        x.restore();
        x.strokeStyle = '#ffffff'; x.lineWidth = 0.9;
        for (let j = 0; j < 4; j++) { const yy = -hh + 10 + j * ((hh - 16) / 3); x.beginPath(); x.moveTo(cx - cw / 2 + 1, yy); x.lineTo(cx - cw / 2 - 1.6, yy - 1.4); x.moveTo(cx + cw / 2 - 1, yy + 4); x.lineTo(cx + cw / 2 + 1.6, yy + 2.6); x.stroke(); }
        if ((o.v + i) % 2 === 0) { const fy = -hh - 0.5; x.fillStyle = '#ff8cc1'; for (let p = 0; p < 5; p++) { const a = p * 1.2566 - 1.57; x.beginPath(); x.ellipse(cx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 2.4, 1.8, a, 0, 6.283); x.fill(); } x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(cx, fy, 1.6, 0, 6.283); x.fill(); }
      }
    } else if (o.type === 'fence') {
      shadow(w / 2, w * 1.1);
      const wood = (x0, x1) => lin(x, x0, 0, x1, 0, ['#ffe2b4', '#e2a865', '#b97a40']);
      const rail = (yy) => { rr(x, -1, -yy - 4, w + 2, 8, 3); x.fillStyle = lin(x, 0, -yy - 4, 0, -yy + 4, ['#eab778', '#b97a40']); x.fill(); x.lineWidth = 1.2; x.strokeStyle = 'rgba(110,60,25,.5)'; x.stroke(); };
      rail(h * 0.36); rail(h * 0.7);
      const np = o.n === 2 ? 3 : 5, pw = 9, gap = (w - np * pw) / (np - 1);
      for (let i = 0; i < np; i++) {
        const px = i * (pw + gap), ph = h - (i % 2 ? 5 : 0);
        x.beginPath(); x.moveTo(px, 0.5); x.lineTo(px, -ph + 6); x.quadraticCurveTo(px + pw / 2, -ph - 3, px + pw, -ph + 6); x.lineTo(px + pw, 0.5); x.closePath();
        x.fillStyle = wood(px, px + pw); x.fill(); x.lineWidth = 1.3; x.strokeStyle = 'rgba(110,60,25,.55)'; x.stroke();
        x.strokeStyle = 'rgba(120,70,30,.25)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(px + pw * 0.62, -ph + 9); x.quadraticCurveTo(px + pw * 0.5, -ph * 0.5, px + pw * 0.66, -4); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(px + 1.6, -ph + 7, 1.6, ph - 10);
        x.fillStyle = '#8a5a30'; [h * 0.36, h * 0.7].forEach((yy) => { x.beginPath(); x.arc(px + pw / 2, -yy, 1.1, 0, 6.283); x.fill(); });
      }
    } else if (o.type === 'spikes') {
      shadow(w / 2, w * 1.1);
      rr(x, -1, -6, w + 2, 7, 3); x.fillStyle = lin(x, 0, -6, 0, 1, ['#c8c1ea', '#8e86bf']); x.fill(); x.lineWidth = 1.2; x.strokeStyle = 'rgba(70,58,130,.5)'; x.stroke();
      for (let i = 0; i < o.n; i++) {
        const bx = i * 18;
        x.beginPath(); x.moveTo(bx + 1, -5); x.lineTo(bx + 7.4, -h + 3); x.quadraticCurveTo(bx + 9, -h - 1.5, bx + 10.6, -h + 3); x.lineTo(bx + 17, -5); x.closePath();
        x.fillStyle = lin(x, bx, 0, bx + 18, 0, ['#ffffff', '#e4defb', '#a69dd3']); x.fill(); x.lineWidth = 1.3; x.strokeStyle = 'rgba(70,58,130,.5)'; x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(bx + 7.6, -h + 7); x.lineTo(bx + 4.4, -9); x.stroke();
      }
    }
    return (SPR[key] = c);
  }
  function buildLayers() {
    L = { ready: false }; for (const k in SPR) delete SPR[k];
    const R = MG.rng(11), K = V.K;
    const wrap = (T, px, r, fn) => { fn(px); if (px - r < 0) fn(px + T); if (px + r > T) fn(px - T); };
    // montagnes lointaines (douces, sommets enneigés)
    const mount = (pal) => {
      const T = 1300, Hh = 190, [c, x] = mk(T, Hh), r2 = MG.rng(4);
      const peaks = []; for (let i = 0; i < 7; i++) peaks.push([(i + r2() * 0.5) / 7 * T, 70 + r2() * 110, 120 + r2() * 90]);
      peaks.sort((a, b) => a[1] - b[1]);
      peaks.forEach(([px, ph, pw], j) => wrap(T, px, pw, (cx) => {
        x.beginPath(); x.moveTo(cx - pw, Hh); x.quadraticCurveTo(cx - pw * 0.35, Hh - ph * 0.55, cx - 10, Hh - ph + 4); x.quadraticCurveTo(cx, Hh - ph - 4, cx + 10, Hh - ph + 4); x.quadraticCurveTo(cx + pw * 0.35, Hh - ph * 0.55, cx + pw, Hh); x.closePath();
        x.fillStyle = lin(x, 0, Hh - ph, 0, Hh, [pal.mountHi, pal.mount]); x.fill();
        x.save(); x.clip(); x.fillStyle = 'rgba(40,40,110,.12)'; x.beginPath(); x.moveTo(cx + 4, Hh - ph); x.lineTo(cx + pw, Hh); x.lineTo(cx + pw * 0.2, Hh); x.closePath(); x.fill();
        if (ph > 120) { x.fillStyle = pal.snow; x.beginPath(); x.moveTo(cx - 34, Hh - ph + 36); x.quadraticCurveTo(cx - 12, Hh - ph - 2, cx, Hh - ph - 4); x.quadraticCurveTo(cx + 12, Hh - ph - 2, cx + 34, Hh - ph + 36); x.lineTo(cx + 18, Hh - ph + 30); x.lineTo(cx + 6, Hh - ph + 40); x.lineTo(cx - 8, Hh - ph + 30); x.lineTo(cx - 20, Hh - ph + 40); x.closePath(); x.fill(); }
        x.restore();
      }));
      return c;
    };
    L.mount = [mount(PAL.day), mount(PAL.night)];
    // collines arborées
    const hills = (pal) => {
      const T = 1040, Hh = 130, [c, x] = mk(T, Hh), r2 = MG.rng(6);
      const yAt = (i) => Hh - 52 - 20 * Math.sin(i / T * 6.2832 * 2) - 12 * Math.sin(i / T * 6.2832 * 5 + 1);
      x.beginPath(); x.moveTo(0, Hh); for (let i = 0; i <= T; i += 5) x.lineTo(i, yAt(i)); x.lineTo(T, Hh); x.closePath();
      x.fillStyle = lin(x, 0, Hh - 90, 0, Hh, [pal.hill[0], pal.hill[1]]); x.fill();
      x.beginPath(); for (let i = 0; i <= T; i += 5) i ? x.lineTo(i, yAt(i) + 1.5) : x.moveTo(i, yAt(i) + 1.5); x.lineWidth = 3; x.strokeStyle = pal.hillRim; x.stroke();
      for (let k2 = 0; k2 < 12; k2++) {
        const tx = (k2 + r2() * 0.7) / 12 * T, big = 9 + r2() * 7;
        wrap(T, tx, big + 2, (cx) => {
          const ty = yAt(tx) + 3;
          x.fillStyle = pal.trunk; rr(x, cx - 2, ty - big * 0.9, 4, big, 2); x.fill();
          const cy = ty - big * 1.25, g = x.createRadialGradient(cx - big * 0.35, cy - big * 0.4, 1, cx, cy, big); g.addColorStop(0, pal.tree[0]); g.addColorStop(1, pal.tree[1]);
          x.fillStyle = g; x.beginPath(); x.arc(cx, cy, big, 0, 6.283); x.fill();
          x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.ellipse(cx - big * 0.35, cy - big * 0.45, big * 0.3, big * 0.18, -0.5, 0, 6.283); x.fill();
        });
      }
      return c;
    };
    L.hills = [hills(PAL.day), hills(PAL.night)];
    // sol : herbe (brins + festons) et briques de terre arrondies, raccord tous les 520
    L.gTop = 5;
    const ground = (pal) => {
      const T = VIEW_W, Hh = Math.ceil((V.ch - V.gy) / V.s) + 8, top = L.gTop, [c, x] = mk(T, Hh + top), r2 = MG.rng(5); x.translate(0, top);
      x.fillStyle = lin(x, 0, 0, 0, Hh, [pal.soil[0], pal.soil[1]]); x.fillRect(0, 0, T, Hh);
      const bw = 52, bh = 22, rows = 3;
      for (let row = 0; row < rows && 20 + row * (bh + 5) < Hh; row++) {
        const yy = 20 + row * (bh + 5), off = row % 2 ? bw / 2 : 0;
        for (let bx = -bw; bx < T + bw; bx += bw) {
          const X0 = bx + off + 2.5;
          rr(x, X0, yy, bw - 5, bh, 8); x.fillStyle = pal.brick; x.fill();
          rr(x, X0 + 4, yy + 2.5, bw - 13, 4, 2); x.fillStyle = pal.brickHi; x.fill();
          rr(x, X0 + 3, yy + bh - 4.5, bw - 11, 3, 1.5); x.fillStyle = pal.brickSh; x.fill();
        }
      }
      // sous-sol : pierres arrondies et petits cristaux (raccord horizontal)
      const deepY = 20 + rows * (bh + 5);
      const stone = (px, py, r) => { x.fillStyle = pal.brickSh; x.beginPath(); x.ellipse(px + 0.8, py + 1.2, r * 1.25, r, 0, 0, 6.283); x.fill(); x.fillStyle = pal.brick; x.beginPath(); x.ellipse(px, py, r * 1.2, r * 0.92, 0, 0, 6.283); x.fill(); x.fillStyle = pal.brickHi; x.beginPath(); x.ellipse(px - r * 0.35, py - r * 0.35, r * 0.45, r * 0.25, -0.3, 0, 6.283); x.fill(); };
      const crystal = (px, py) => { x.save(); x.translate(px, py); x.scale(1.9, 1.9); [[-4, 0, 7], [0, -2, 11], [4.5, 0, 8]].forEach(([dx, dy, hh]) => { x.beginPath(); x.moveTo(dx - 2.6, dy); x.lineTo(dx, dy - hh); x.lineTo(dx + 2.6, dy); x.closePath(); x.fillStyle = lin(x, dx - 2.6, 0, dx + 2.6, 0, [pal.gem[0], pal.gem[1]]); x.fill(); }); x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(-0.6, -10, 1, 6); x.restore(); };
      for (let i = 0; i < 34; i++) { const px = r2() * T, py = deepY + 6 + r2() * Math.max(10, Hh - deepY - 12), r = 3 + r2() * 7; [0, -T, T].forEach((o) => { if (px + o > -20 && px + o < T + 20) stone(px + o, py, r); }); }
      for (let i = 0; i < 4; i++) { const px = (i + 0.2 + r2() * 0.6) / 4 * T, py = deepY + 30 + r2() * Math.max(10, Hh - deepY - 50); crystal(px, py); }
      x.fillStyle = pal.pebble; for (let i = 0; i < 26; i++) { const px = r2() * T, py = deepY + r2() * (Hh - deepY); x.beginPath(); x.ellipse(px, py, 1.4 + r2() * 1.4, 0.9 + r2() * 0.8, 0, 0, 6.283); x.fill(); }
      x.fillStyle = lin(x, 0, 0, 0, Hh, [[0, 'rgba(0,0,0,0)'], [0.22, 'rgba(0,0,0,.04)'], [0.45, 'rgba(0,0,0,.16)'], [1, 'rgba(0,0,0,.46)']]); x.fillRect(0, 0, T, Hh);
      // herbe
      x.beginPath(); x.moveTo(0, -0.5);
      for (let i = 0; i < T; i += 6.5) { x.lineTo(i + 1.4, -0.5); x.lineTo(i + 3.1, -top + ((i / 6.5) % 3 === 1 ? 1.8 : 0)); x.lineTo(i + 4.9, -0.5); }
      x.lineTo(T, -0.5); x.lineTo(T, 12);
      for (let i = T; i > 0; i -= 13) x.arc(i - 6.5, 12, 6.5, 0, Math.PI);
      x.closePath();
      x.fillStyle = lin(x, 0, -top, 0, 19, [pal.grass[0], pal.grass[1]]); x.fill();
      x.lineWidth = 2.2; x.strokeStyle = pal.grassHi; x.beginPath(); x.moveTo(0, 1.4); x.lineTo(T, 1.4); x.stroke();
      x.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < T; i += 13) { x.beginPath(); x.arc(i + 6.5, 13, 5, 0, Math.PI); x.fill(); }
      return c;
    };
    L.ground = [ground(PAL.day), ground(PAL.night)];
    // nuages moelleux
    const cloud = (pal, w) => {
      const h = w * 0.52, [c, x] = mk(w + 14, h + 14); x.translate(7, 7);
      const blobs = [[0.22, 0.66, 0.19], [0.42, 0.44, 0.27], [0.64, 0.48, 0.24], [0.82, 0.68, 0.16], [0.52, 0.7, 0.22], [0.32, 0.7, 0.18]];
      blobs.forEach(([a, b, r]) => { x.fillStyle = pal.cloudSh; x.beginPath(); x.arc(w * a, h * b + 2.5, w * r, 0, 6.283); x.fill(); });
      blobs.forEach(([a, b, r]) => { const g = x.createRadialGradient(w * a - w * r * 0.3, h * b - w * r * 0.45, 1, w * a, h * b, w * r); g.addColorStop(0, pal.cloud); g.addColorStop(0.7, pal.cloud); g.addColorStop(1, pal.cloudMid); x.fillStyle = g; x.beginPath(); x.arc(w * a, h * b, w * r, 0, 6.283); x.fill(); });
      return c;
    };
    L.clouds = [0, 1, 2, 3, 4].map((i) => { const w = 70 + R() * 70; return { x: i * 160 + R() * 70, h: 120 + R() * 190, p: 0.1 + R() * 0.12, drift: 4 + R() * 6, img: [cloud(PAL.day, w), cloud(PAL.night, w)] }; });
    // astres
    const sun = (() => { const [c, x] = mk(90, 90); const g = x.createRadialGradient(45, 45, 8, 45, 45, 44); g.addColorStop(0, 'rgba(255,236,150,.75)'); g.addColorStop(0.45, 'rgba(255,220,110,.28)'); g.addColorStop(1, 'rgba(255,220,110,0)'); x.fillStyle = g; x.fillRect(0, 0, 90, 90);
      x.fillStyle = lin(x, 30, 30, 60, 60, ['#fff6c4', '#ffd23f']); x.beginPath(); x.arc(45, 45, 17, 0, 6.283); x.fill(); return c; })();
    const moon = (() => { const [c, x] = mk(80, 80); const g = x.createRadialGradient(40, 40, 6, 40, 40, 38); g.addColorStop(0, 'rgba(240,236,255,.4)'); g.addColorStop(1, 'rgba(240,236,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 80, 80);
      x.fillStyle = '#f4efff'; x.beginPath(); x.arc(40, 40, 15, 0, 6.283); x.fill(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(47, 35, 13, 0, 6.283); x.fill(); return c; })();
    L.sun = sun; L.moon = moon;
    const st2 = document.createElement('canvas'); st2.width = cv.width; st2.height = Math.round(V.gy * V.dpr); const sx = st2.getContext('2d'); const r3 = MG.rng(9);
    for (let i = 0; i < 70; i++) { sx.fillStyle = `rgba(255,255,255,${0.35 + r3() * 0.6})`; sx.beginPath(); sx.arc(r3() * st2.width, r3() * st2.height * 0.75, (0.6 + r3() * 1.2) * V.dpr, 0, 7); sx.fill(); }
    L.stars = st2;
    // particules et bonus
    const soft = (col) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; };
    L.puff = soft(PAL.day.dust); L.puffN = soft(PAL.night.dust);
    const sp = document.createElement('canvas'); sp.width = sp.height = 64; { const x = sp.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 6); x.quadraticCurveTo(35, 29, 58, 32); x.quadraticCurveTo(35, 35, 32, 58); x.quadraticCurveTo(29, 35, 6, 32); x.quadraticCurveTo(29, 29, 32, 6); x.fill(); } L.spark = sp;
    const gp = document.createElement('canvas'); gp.width = gp.height = 64; { const x = gp.getContext('2d'); star5(x, 32, 33, 26, 11); x.fillStyle = '#ffd23f'; x.fill(); x.lineWidth = 3.5; x.strokeStyle = '#e59a00'; x.stroke(); x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.arc(26, 25, 4.5, 0, 7); x.fill(); } L.goldP = gp;
    const big = (fn) => { const c = document.createElement('canvas'); c.width = c.height = 128; fn(c.getContext('2d')); return c; };
    L.star = big((x) => { const g = x.createRadialGradient(64, 64, 10, 64, 64, 62); g.addColorStop(0, 'rgba(255,220,90,.55)'); g.addColorStop(1, 'rgba(255,220,90,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); star5(x, 64, 66, 42, 18); x.fillStyle = '#ffd23f'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#e59a00'; x.lineJoin = 'round'; x.stroke(); x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.arc(54, 50, 7, 0, 7); x.fill(); });
    const bubble = (x, withCross) => { const g = x.createRadialGradient(48, 44, 8, 64, 64, 60); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.7, 'rgba(160,210,255,.22)'); g.addColorStop(1, 'rgba(120,180,255,.5)'); x.fillStyle = g; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.9)'; x.stroke(); x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.ellipse(42, 36, 14, 7, -0.6, 0, 7); x.fill();
      if (withCross) { x.fillStyle = '#ffffff'; rr(x, 82, 10, 30, 30, 9); x.fill(); x.fillStyle = '#2f7bff'; rr(x, 93, 15, 8, 20, 2.5); x.fill(); rr(x, 87, 21, 20, 8, 2.5); x.fill(); } };
    L.shield = big((x) => { bubble(x, false); x.fillStyle = '#ffffff'; rr(x, 40, 40, 48, 48, 14); x.fill(); x.fillStyle = '#2f7bff'; rr(x, 58, 48, 12, 32, 4); x.fill(); rr(x, 48, 58, 32, 12, 4); x.fill(); });
    L.bubble = big((x) => bubble(x, true));
    L.emote = (() => { const c = document.createElement('canvas'); c.width = 104; c.height = 116; const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.strokeStyle = INK; x.lineWidth = 4; x.beginPath(); x.arc(52, 52, 46, 0, 7); x.fill(); x.stroke(); x.beginPath(); x.moveTo(40, 94); x.lineTo(52, 112); x.lineTo(62, 93); x.fill(); x.stroke(); x.fillStyle = '#ffffff'; x.fillRect(42, 86, 18, 8); return c; })();
    L.ready = true;
  }
  function layout() {
    if (!root) return;
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === V.cw && h === V.ch && dpr === V.dpr && L.ready) return;
    V.cw = w; V.ch = h; V.dpr = dpr; V.s = w / VIEW_W; V.K = V.s * dpr; V.ww = VIEW_W; V.gy = Math.round(h * 0.6);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    buildLayers(); ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    root.style.setProperty('--gy', V.gy + 'px'); V.font = `900 18px ${getComputedStyle(root).fontFamily}`;
    if (st) { st.idle = 0; draw(); }
  }

  /* ---------- Interface ---------- */
  const pad = (n) => String(n || 0).padStart(5, '0');
  function updHud() { if (!UI.score || !st) return; UI.score.textContent = pad(score()); UI.best.textContent = pad(api.data.best || 0); UI.score.style.color = ''; }
  function topList(cur, n) {
    const top = (api.data.top || []).slice(0, n || 5);
    if (!top.length) return '<p class="jp-empty">Aucun score pour l\'instant. À toi de jouer !</p>';
    const fmtD = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } };
    return `<ol class="jp-top">${top.map((r, i) => `<li class="${cur && r.at === cur ? 'me' : ''}"><span class="rk">${i + 1}</span><b>${pad(r.s)}</b><small>${fmtD(r.at)}</small></li>`).join('')}</ol>`;
  }
  function menuHTML() {
    const d = api.data, s = d.stats || {};
    return `<img class="jp-logo" src="${MG.asset('logo_jump.webp')}" alt="Milo Jump" draggable="false">
      <div class="jp-sheet gscroll">
        <div class="jp-stats"><div><span>${MG.icon('crown')}Record</span><b>${pad(d.best)}</b></div><div><span>Parties</span><b>${MG.fmt(s.games || 0)}</b></div><div><span>${MG.icon('star')}Étoiles</span><b>${MG.fmt(s.stars || 0)}</b></div></div>
        <div class="jp-h">${MG.icon('trophy')}Meilleurs scores</div>${topList(null, 3)}
        <button class="gbtn jp-go" data-jp="play">${MG.icon('play')}Jouer</button>
      </div>`;
  }
  function showMenu() { setState('menu'); UI.menu.innerHTML = menuHTML(); UI.menu.classList.add('show'); root.classList.remove('moved'); }
  function startRun() {
    UI.menu.classList.remove('show');
    const m = root.querySelector('.jp-over'); if (m) m.remove();
    newRun(); st.started = true; setState('play'); last = 0;
    msg('C\'est parti !');
  }
  function showOver() {
    const d = api.data, sc = score(), rec = sc > st.prevBest && sc > 0, rank = (d.top || []).findIndex((r) => r.at === st.runAt) + 1;
    const m = document.createElement('div'); m.className = 'gmodal jp-over';
    m.innerHTML = `<div class="gpanel"><img class="mas" src="assets/${FACES[rec ? 'fete' : 'ko']}.webp" alt="">
      <h3>${rec ? (st.prevBest ? 'Nouveau record !' : 'Premier record !') : 'Partie terminée'}</h3>
      <p>${st.dead === 'hole' ? 'Milo est tombé dans un trou.' : 'Milo a percuté un obstacle.'}${rank > 0 && rank <= 10 ? ` ${rank === 1 ? 'Meilleur score' : rank + 'e meilleur score'} de ton classement.` : ''}</p>
      <div class="jp-sc"><div><span>Score</span><b>${pad(sc)}</b></div><div class="${rec ? 'hot' : ''}"><span>${MG.icon('crown')}Record</span><b>${pad(d.best)}</b></div></div>
      <details class="jp-board"><summary>${MG.icon('trophy')}Classement</summary><div class="gscroll jp-scroll">${topList(st.runAt, 10)}</div></details>
      <div class="acts wait"><button class="gbtn" data-jp="again">${MG.icon('redo')}Rejouer</button><button class="gbtn light" data-jp="quit">Retour aux jeux</button></div></div>`;
    root.appendChild(m); setState('over'); st.overAt = performance.now();
    setTimeout(() => { const a = m.querySelector('.acts'); a && a.classList.remove('wait'); }, 450);
    if (rec) { try { api.fx.confetti(110); } catch (e) {} MG.sfx.play('record'); } else MG.sfx.play('over');
  }
  function pause() { if (st && st.state === 'play' && !st.dead) { setState('paused'); st.hold = false; if (st.dirty) { api.save(); st.dirty = false; } } }
  function resume() { if (st && st.state === 'paused') { setState('play'); last = 0; } }

  function onDown(e) {
    if (e.button > 0 || e.target.closest('button, .jp-menu, .gmodal')) return;
    if (e.cancelable) e.preventDefault();
    press();
  }
  function onTouch(e) { if (e.cancelable && !e.target.closest('button, .jp-menu, .gmodal')) e.preventDefault(); }
  function onUp() { release(); }
  function onClick(e) {
    const b = e.target.closest('[data-jp]'); if (!b) return;
    const a = b.dataset.jp;
    if (a === 'play' || a === 'again') { MG.sfx.play('tap'); startRun(); }
    else if (a === 'pause') pause();
    else if (a === 'resume') resume();
    else if (a === 'quit') api.close();
  }
  function onKey(e) {
    if (!root || e.metaKey || e.ctrlKey) return;
    const jumpKey = e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    if (e.type === 'keyup') { if (jumpKey) release(); return; }
    if (e.repeat) { if (jumpKey) e.preventDefault(); return; }
    if (jumpKey || e.code === 'Enter') {
      e.preventDefault();
      if (st.state === 'menu' && L.ready) startRun();
      else if (st.state === 'over') { if (performance.now() - (st.overAt || 0) > 450) startRun(); }
      else if (jumpKey) press();
    } else if (e.code === 'KeyP') st.state === 'play' ? pause() : resume();
  }
  function onVis() { if (document.hidden) pause(); }

  /* ---------- Module ---------- */
  MG.register({
    id: 'jump', name: 'Milo Jump', logo: 'logo_jump.webp', theme: 'jump',
    mount(frame, a) {
      api = a; api.data.stats = api.data.stats || {};
      root = document.createElement('div'); root.className = 'jp-root'; root.dataset.state = 'menu';
      root.innerHTML = `<canvas class="jp-cv" role="img" aria-label="Milo Jump"></canvas>
        <div class="jp-hud"><div class="jp-chip" title="Record">${MG.icon('crown')}<b id="jpBest">00000</b></div><div class="grow"></div>${MG.soundBtn()}<button class="gclose jp-pause" data-jp="pause" aria-label="Pause">${MG.icon('pause')}</button><button class="gclose" data-jp="quit" aria-label="Quitter">${MG.icon('x')}</button></div>
        <div class="jp-score" aria-live="off">00000</div><div class="jp-msg"></div>
        <div class="jp-hint"><b>Touche</b> pour sauter · <b>maintiens</b> pour aller plus haut</div>
        <div class="jp-menu"></div>
        <div class="jp-pauseov"><h3>Pause</h3><p>Touche l’écran pour reprendre.</p><div class="jp-pacts"><button class="gbtn" data-jp="resume">${MG.icon('play')}Reprendre</button><button class="gbtn light" data-jp="quit">Quitter la partie</button></div></div>`;
      frame.insertBefore(root, frame.firstChild);
      cv = root.querySelector('.jp-cv'); ctx = cv.getContext('2d', { alpha: false });
      UI = { score: root.querySelector('.jp-score'), best: root.querySelector('#jpBest'), msg: root.querySelector('.jp-msg'), menu: root.querySelector('.jp-menu') };
      loadImgs(); V.cw = V.ch = 0; L = {}; st = null;
      newRun(); showMenu(); layout(); updHud();
      try { ro = new ResizeObserver(() => { clearTimeout(rTimer); rTimer = setTimeout(layout, 80); }); ro.observe(root); } catch (e) { window.addEventListener('resize', layout); }
      root.addEventListener('pointerdown', onDown); root.addEventListener('touchstart', onTouch, { passive: false }); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp); root.addEventListener('pointerleave', onUp);
      root.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey); document.addEventListener('visibilitychange', onVis);
      last = 0; raf = requestAnimationFrame(loop);
    },
    unmount() {
      cancelAnimationFrame(raf); clearTimeout(rTimer);
      try { ro && ro.disconnect(); } catch (e) {} ro = null; window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); document.removeEventListener('visibilitychange', onVis);
      if (st && (st.state === 'play' || st.state === 'paused') && !st.finished) finishRun(); else if (st && st.dirty) api.save();
      root = null; cv = null; ctx = null; L = {}; parts.length = 0; UI = {}; st = null;
    },
    card(d) {
      const s = d.stats || {};
      return { desc: 'Milo court sans s\'arrêter : touche pour sauter par-dessus cactus, rochers et trous. Maintiens pour sauter plus haut.',
        stats: [['Record', MG.fmt(d.best || 0), 'crown'], ['Parties', MG.fmt(s.games || 0), 'pad'], ['Étoiles', MG.fmt(s.stars || 0), 'star']],
        progress: null, cta: d.best ? 'Battre mon record' : 'Courir avec Milo' };
    },
    homeLine(d) { return `Milo Jump record ${MG.fmt(d.best || 0)}`; },
    _debug: { state: () => st, press: () => press(), release: () => release(), spawn: () => spawn(), score: () => score(), L: () => L }
  });

  /* ---------- Styles ---------- */
  const css = `
  .gscreen.jump{background:linear-gradient(180deg,#3f9dff,#86cbff 35%,#e2f5ff 60%,#d9975d 60%,#a7643a)}
  .jp-root{position:absolute;inset:0;overflow:hidden;z-index:1;touch-action:none;cursor:pointer;-webkit-tap-highlight-color:transparent;--ink:#4b3f93}
  .jp-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
  .jp-hud{position:absolute;left:0;right:0;top:0;z-index:6;display:flex;align-items:center;gap:8px;padding:12px 14px 6px;pointer-events:none}
  .jp-hud button{pointer-events:auto}
  .jp-root .gclose{background:rgba(255,255,255,.82);color:#5a33d6;box-shadow:0 4px 12px rgba(60,40,150,.14)}
  .jp-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px 6px 9px;border-radius:22px;background:rgba(255,255,255,.85);color:#4b3f93;font-weight:900;font-size:15px;letter-spacing:1.5px;box-shadow:0 4px 12px rgba(60,40,150,.14);font-variant-numeric:tabular-nums}
  .jp-chip .gi{width:19px;height:19px;fill:#ffcf3a;stroke:#e19c00;stroke-width:1.6}
  .jp-root:not([data-state=play]) .jp-pause{display:none}
  .jp-score{position:absolute;left:0;right:0;top:62px;z-index:4;text-align:center;font-size:40px;font-weight:900;letter-spacing:4px;color:#4b3f93;font-variant-numeric:tabular-nums;pointer-events:none;text-shadow:0 2px 0 rgba(255,255,255,.8);transition:color .8s,opacity .25s}
  .jp-root.night .jp-score{color:#efeaff;text-shadow:0 2px 0 rgba(0,0,0,.3)}
  .jp-root[data-state=menu] .jp-score,.jp-root[data-state=menu] .jp-chip{opacity:0}
  .jp-score.blink{animation:jpblink .9s steps(1)}
  @keyframes jpblink{0%,50%{opacity:1}25%,75%{opacity:.15}}
  .jp-msg{position:absolute;left:50%;top:21%;z-index:4;transform:translateX(-50%);white-space:nowrap;font-size:26px;font-weight:900;color:#fff;-webkit-text-stroke:2.5px #6a2fd8;paint-order:stroke fill;text-shadow:0 4px 0 #4a1fa8,0 8px 16px rgba(40,10,110,.3);opacity:0;pointer-events:none}
  .jp-msg.show{animation:jpmsg 1.5s cubic-bezier(.3,1.4,.5,1) forwards}
  .jp-msg.gold{color:#ffe066;-webkit-text-stroke-color:#b25f00;text-shadow:0 4px 0 #8a4600,0 8px 18px rgba(120,60,0,.35);font-size:30px}
  .jp-msg.warn{color:#fff3c4;-webkit-text-stroke-color:#e0560f;text-shadow:0 4px 0 #a93c0b}
  @keyframes jpmsg{0%{opacity:0;transform:translate(-50%,12px) scale(.55)}14%{opacity:1;transform:translate(-50%,0) scale(1.08)}24%{transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-14px)}}
  .jp-hint{position:absolute;left:50%;top:calc(var(--gy,60%) + 46px);transform:translateX(-50%);z-index:4;display:none;padding:9px 15px;border-radius:22px;background:rgba(255,255,255,.92);color:#4b3f93;font-weight:800;font-size:14px;white-space:nowrap;box-shadow:0 6px 16px rgba(60,40,150,.16);pointer-events:none;animation:jphint 1.4s ease-in-out infinite}
  .jp-hint b{color:#7347ee}
  .jp-root[data-state=play]:not(.moved) .jp-hint{display:block}
  @keyframes jphint{50%{transform:translateX(-50%) translateY(-4px)}}
  .jp-menu{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:52px 14px max(12px,env(safe-area-inset-bottom,0px));pointer-events:none;opacity:0;transition:opacity .3s}
  .jp-menu.show{opacity:1}.jp-menu.show>*{pointer-events:auto}
  .jp-logo{width:auto;height:min(calc(var(--gy,60%) - 200px),210px);max-width:62%;height:auto;filter:drop-shadow(0 12px 18px rgba(40,20,120,.25));animation:jplogo 3.2s ease-in-out infinite}
  @keyframes jplogo{50%{transform:translateY(-6px) rotate(-1deg)}}
  .jp-sheet{position:absolute;left:50%;transform:translateX(-50%);top:calc(var(--gy,60%) + 14px);bottom:max(12px,env(safe-area-inset-bottom,0px));overflow:auto;width:min(calc(100% - 28px),400px);border-radius:26px;background:rgba(255,255,255,.96);padding:12px;box-shadow:0 20px 50px rgba(50,30,140,.22);animation:fade .4s both}
  .jp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}
  .jp-stats div{background:#f6f2ff;border-radius:14px;padding:6px 6px;text-align:center}
  .jp-stats span,.jp-sc span{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:800;color:var(--muted)}
  .jp-stats span .gi,.jp-sc span .gi{width:12px;height:12px;fill:#ffcf3a;stroke:#e19c00}
  .jp-stats b{display:block;font-size:19px;font-weight:900;color:#4b2ab8;letter-spacing:1px;font-variant-numeric:tabular-nums}
  .jp-h{display:flex;align-items:center;gap:6px;font-weight:900;font-size:14px;color:#2a1f6b;margin:0 4px 6px}
  .jp-h .gi{width:16px;height:16px;color:#e19c00}
  .jp-top{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:4px}
  .jp-top li{display:flex;align-items:center;gap:10px;padding:4px 10px;border-radius:12px;background:#faf8ff;font-variant-numeric:tabular-nums}
  .jp-top li.me{background:linear-gradient(160deg,#fff6cf,#ffe7a0)}
  .jp-top .rk{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#ece6ff;color:#5530d4;font-weight:900;font-size:12px;flex:none}
  .jp-top li:nth-child(1) .rk{background:#ffd84d;color:#7a4b00}.jp-top li:nth-child(2) .rk{background:#e4e8f5;color:#4b5570}.jp-top li:nth-child(3) .rk{background:#f6c9a4;color:#7a3f12}
  .jp-top b{font-weight:900;letter-spacing:1.5px;color:#2a1f6b}.jp-top small{margin-left:auto;color:var(--muted);font-weight:700;font-size:12px}
  .jp-empty{margin:0 0 10px;font-size:13px;color:var(--muted);font-weight:700;text-align:center}
  .jp-how{margin:0 0 8px;text-align:center;font-size:13px;font-weight:800;color:#5c5486}.jp-how span{color:#7347ee}
  .jp-go{width:100%;position:sticky;bottom:0;margin-top:2px}
  .jp-pauseov{position:absolute;inset:0;z-index:7;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;background:rgba(30,16,90,.38);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);color:#fff;text-align:center}
  .jp-root[data-state=paused] .jp-pauseov{display:flex}
  .jp-pauseov h3{font-size:40px;font-weight:900;margin:0;-webkit-text-stroke:2.5px #5a2fd0;paint-order:stroke fill;text-shadow:0 4px 0 #4420a8}
  .jp-pauseov p{margin:0 0 14px;font-weight:800}
  .jp-pacts{display:flex;flex-direction:column;gap:10px;width:min(100%,280px)}
  .jp-over .mas{width:118px;height:118px}
  .jp-sc{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 8px}
  .jp-sc div{background:#f4efff;border-radius:16px;padding:8px 4px}.jp-sc div.hot{background:linear-gradient(160deg,#fff6cf,#ffe7a0)}
  .jp-sc b{display:block;font-size:28px;font-weight:900;color:#5530d4;letter-spacing:2px;font-variant-numeric:tabular-nums}
  .jp-board{text-align:left;margin:4px 0 0}
  .jp-board summary{display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font-weight:900;color:#5530d4;font-size:14px;padding:6px;list-style:none}
  .jp-board summary::-webkit-details-marker{display:none}
  .jp-board summary .gi{width:16px;height:16px;color:#e19c00}
  .jp-scroll{max-height:180px;overflow:auto;-webkit-overflow-scrolling:touch}.jp-board .jp-top{margin-top:6px}
  .jp-over .acts{transition:opacity .2s}.jp-over .acts.wait{pointer-events:none;opacity:.55}
  .gcard.jump .gcard-art{background:radial-gradient(circle at 22% 18%,rgba(255,255,255,.75),transparent 46%),radial-gradient(circle at 82% 88%,#b6f29a,transparent 52%),linear-gradient(160deg,#9fdcff,#c9e9ff 45%,#e7f9d6)}
  @media (prefers-reduced-motion:reduce){.jp-logo,.jp-hint{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
