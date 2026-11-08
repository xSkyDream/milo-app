/* =====================================================================
   Milo Jump — course infinie (inspirée du Dino de Chrome), univers Milo
   Touche pour sauter, maintiens pour sauter plus haut. Cactus, rochers,
   buissons, barrières et trous ; étoiles et bulle-pansement en bonus.
   Canvas 2D 60 FPS : décor et obstacles pré-rendus, rien n'est alloué
   dans le DOM pendant la course (seul le score change).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames; if (!MG) return;

  /* ---------- Visuels de Milo (remplaçables) ----------
     run : planche de 8 images de course (générée depuis le visuel officiel).
     ax / ay : point de contact au sol dans une image (fraction). */
  const SHEET = { src: 'jump/run.webp', n: 8, fw: 364, fh: 300, ax: 0.585, ay: 0.95 };
  const FACES = { focus: 'pl3_determine', joie: 'pl3_joie', wow: 'pl3_alerte', ko: 'pl3_sommeil', fete: 'pl3_fete' };

  /* ---------- Réglages (unités logiques ; largeur visible = 520) ---------- */
  const VIEW_W = 520, MX = 70, MILO_H = 98;
  const PHYS = { g: 2600, v0: 720, holdG: 0.5, holdT: 0.18, minH: 55, cut: 430 };
  const INK = '#4b3f93';
  const PAL = {
    day: { top: '#f1ecff', bot: '#fdfcff', ground: '#ece6ff', line: '#4b3f93', speck: '#a59bd0', hill: '#e5ddfc', hillLine: '#cdc1f5', cloud: '#ffffff', cloudLine: '#d2c7f5', orb: '#ffd88a', ink: '#4b3f93' },
    night: { top: '#15112d', bot: '#2a2358', ground: '#1c1740', line: '#d6ccff', speck: '#6d63a8', hill: '#231d49', hillLine: '#3a3274', cloud: '#2b2557', cloudLine: '#4a4290', orb: '#f4efff', ink: '#efeaff' }
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
    if (sc > 110) pool.push(['hole', 2.2]); if (sc > 200) pool.push(['fence', 2.2]); if (sc > 320) pool.push(['cluster', 2.6]);
    let tot = 0; pool.forEach((p) => (tot += p[1])); let x = rng() * tot, type = 'rock';
    for (const p of pool) { x -= p[1]; if (x <= 0) { type = p[0]; break; } }
    const wx = st.dist + (V.ww - MX) + 40;
    let o;
    if (type === 'rock') { const w = 34 + rng() * 14; o = { type, w, h: 24 + rng() * 10, v: Math.floor(rng() * 3) }; }
    else if (type === 'bush') { const w = 46 + rng() * 16; o = { type, w, h: 34 + rng() * 10, v: Math.floor(rng() * 3) }; }
    else if (type === 'cactus') { const tall = rng() < 0.45 + 0.3 * d; o = { type, w: tall ? 30 : 24, h: tall ? 66 + rng() * 6 : 46 + rng() * 6, v: Math.floor(rng() * 3), n: 1 }; }
    else if (type === 'cluster') { const n = 2 + (rng() < 0.35 + 0.3 * d ? 1 : 0); o = { type: 'cactus', w: n * 24 + (n - 1) * 3, h: 48 + rng() * 10, v: Math.floor(rng() * 3), n }; }
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
  // boîtes de collision (unités, relatives à l'obstacle)
  function boxes(o) {
    if (o.type === 'rock') return [[o.w * 0.12, o.w * 0.88, o.h * 0.88]];
    if (o.type === 'bush') return [[o.w * 0.14, o.w * 0.86, o.h * 0.82]];
    if (o.type === 'fence') return [[2, o.w - 2, o.h * 0.94]];
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
        st.runPh += dt * (10 + sp * 0.03);
        const fr = Math.floor(st.runPh) % 8; if (fr !== st.lastFrame) { st.lastFrame = fr; if (fr % 4 === 0) addP('dust', MX - 10, 0, -sp * 0.35 - 30, 20 + rng() * 25, 0.35, 5 + rng() * 4); }
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
      st.dist += sp * dt; st.runPh += dt * 14;
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
  function draw() {
    const c = ctx, K = V.K, k = st.night;
    let ox = 0, oy = 0; if (st.shake > 0) { const a = st.shake * st.shake * 6 * K; ox = (Math.random() * 2 - 1) * a; oy = (Math.random() * 2 - 1) * a; }
    const P = (n) => (k < 0.01 ? PAL.day[n] : k > 0.99 ? PAL.night[n] : mix(PAL.day[n], PAL.night[n], k));
    const gyD = V.gy * V.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    // ciel
    if (!L.sky || L.skyK !== Math.round(k * 50)) { const g = c.createLinearGradient(0, 0, 0, gyD); g.addColorStop(0, P('top')); g.addColorStop(1, P('bot')); L.sky = g; L.skyK = Math.round(k * 50); L.gfill = P('ground'); }
    c.fillStyle = L.sky; c.fillRect(0, 0, cv.width, gyD + 1);
    c.fillStyle = L.gfill; c.fillRect(0, gyD, cv.width, cv.height - gyD);
    // astre + étoiles
    const orbX = cv.width - 70 * K, orbY = gyD * 0.24;
    if (k > 0.01) { c.globalAlpha = k; c.drawImage(L.stars, 0, 0); c.drawImage(L.moon, orbX - L.moon.width / 2, orbY - L.moon.height / 2); }
    if (k < 0.99) { c.globalAlpha = 1 - k; c.drawImage(L.sun, orbX - L.sun.width / 2, orbY - L.sun.height / 2); }
    c.globalAlpha = 1;
    // collines (parallaxe)
    tile(L.hills[0], st.dist * 0.1, gyD - L.hills[0].height + 2 * K, 1 - k, ox * 0.3);
    if (k > 0.01) tile(L.hills[1], st.dist * 0.1, gyD - L.hills[1].height + 2 * K, k, ox * 0.3);
    // nuages
    for (const cl of L.clouds) {
      const x = ((cl.x - st.dist * cl.p - st.t * 6) % (V.ww + 200) + (V.ww + 200)) % (V.ww + 200) - 100;
      const img = cl.img[k > 0.5 ? 1 : 0]; c.globalAlpha = k > 0.5 ? Math.min(1, (k - 0.5) * 4) : Math.min(1, (0.5 - k) * 4);
      c.drawImage(img, Math.round(x * K + ox * 0.5), Math.round(gyD - cl.h * K - img.height));
    }
    c.globalAlpha = 1;
    // sol : texture + ligne (avec trous)
    tile(L.ground[0], st.dist, gyD, 1 - k, ox, oy); if (k > 0.01) tile(L.ground[1], st.dist, gyD, k, ox, oy);
    c.setTransform(K, 0, 0, K, ox, gyD + oy);
    const holes = st.obs.filter((o) => o.type === 'hole');
    for (const h of holes) {
      const x = MX + h.x - st.dist; if (x > V.ww + 10 || x + h.w < -10) continue;
      const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, k > 0.5 ? '#0d0a20' : '#3b2f7a'); g.addColorStop(1, k > 0.5 ? 'rgba(13,10,32,0)' : 'rgba(59,47,122,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x, -1); c.lineTo(x + h.w, -1); c.lineTo(x + h.w - 6, 90); c.lineTo(x + 6, 90); c.closePath(); c.fill();
    }
    c.strokeStyle = P('line'); c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath();
    let sx = -10;
    holes.sort((a, b) => a.x - b.x).forEach((h) => { const x = MX + h.x - st.dist; c.moveTo(sx, 0); c.lineTo(x, 0); sx = x + h.w; });
    c.moveTo(sx, 0); c.lineTo(V.ww + 10, 0); c.stroke();
    // obstacles
    for (const o of st.obs) {
      if (o.type === 'hole') continue;
      const x = MX + o.x - st.dist; if (x > V.ww + 10 || x + o.w < -10) continue;
      const img = sprite(o); c.drawImage(img, x - 6, -o.h - 6, o.w + 12, o.h + 8);
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
      const kk = p.life / p.max;
      if (p.type === 'dust') { c.globalAlpha = kk * 0.8; const s = p.size * (1 + (1 - kk)); c.drawImage(k > 0.5 ? L.puffN : L.puff, p.x - s / 2, -p.y - s / 2, s, s); continue; }
      const img = p.type === 'gold' ? L.goldP : L.spark, s = p.size * (0.4 + 0.6 * kk);
      c.globalAlpha = Math.min(1, kk * 1.6); c.save(); c.translate(p.x, -p.y); c.rotate(p.rot); c.drawImage(img, -s / 2, -s / 2, s, s); c.restore();
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
  function drawMilo(ox, oy) {
    const c = ctx, K = V.K, gyD = V.gy * V.dpr;
    const ko = st.dead === 'hit' && st.ground && st.deadT > 0.15;
    c.setTransform(K, 0, 0, K, ox + MX * K, gyD + oy);
    // ombre
    const sh = clamp(1 - st.y / 160, 0.3, 1); if (st.y > -4 && !(st.dead === 'hole') && !overHole(st.dist - 12, st.dist + 12)) { c.globalAlpha = 0.22 * sh; c.fillStyle = st.night > 0.5 ? '#000' : '#4b3f93'; c.beginPath(); c.ellipse(2, 1, 30 * sh, 5 * sh, 0, 0, 6.283); c.fill(); c.globalAlpha = 1; }
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
    let bob = 0, f;
    if (st.ground && !st.dead) { f = Math.floor(st.runPh) % SHEET.n; const ph = (st.runPh % SHEET.n) / SHEET.n; bob = Math.abs(Math.sin(ph * Math.PI * 2)) * 3; }
    else f = st.vy > 0 ? 2 : 6;
    const H = MILO_H, W = H * SHEET.fw / SHEET.fh;
    const run = st.ground && !st.dead ? 1 + 0.03 * Math.cos((st.runPh / SHEET.n) * Math.PI * 4) : 1;
    c.translate(0, -bob); c.rotate(st.rot); c.scale(st.sx * (2 - run), st.sy * run);
    c.drawImage(im, f * SHEET.fw, 0, SHEET.fw, SHEET.fh, -SHEET.ax * W, -SHEET.ay * H, W, H);
    c.globalAlpha = 1;
    if (st.shield) { const r = 50 + Math.sin(st.t * 5) * 1.5; c.drawImage(L.bubble, -r + 2, -45 - r, r * 2, r * 2); }
    // bulle d'expression
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
  const SPR = {};
  function sprite(o) {
    if (SPR[o.key]) return SPR[o.key];
    const [c, x] = mk(o.w + 12, o.h + 8); x.translate(6, o.h + 6); // origine : bas-gauche
    x.lineJoin = 'round'; x.lineCap = 'round'; x.lineWidth = 2.4; x.strokeStyle = INK;
    const R = MG.rng(Math.round(o.w * 31 + o.h * 7 + (o.v || 0)));
    if (o.type === 'cactus') {
      for (let i = 0; i < o.n; i++) {
        const x0 = i * 27, w = 14, h = o.h * (i === 1 ? 1.02 : 0.95) - (i === 2 ? 8 : 0), cx = x0 + 12;
        const g = x.createLinearGradient(cx - 8, 0, cx + 8, 0); g.addColorStop(0, '#9be9c2'); g.addColorStop(1, '#42b582');
        x.fillStyle = g;
        rr(x, cx - w / 2, -h, w, h + 2, 7); x.fill(); x.stroke();
        const arm = (side, yb, len) => { const ax = cx + side * (w / 2), ay = -yb; x.beginPath(); x.moveTo(ax, ay); x.lineTo(ax + side * 7, ay); x.quadraticCurveTo(ax + side * 11, ay, ax + side * 11, ay - 4); x.lineTo(ax + side * 11, ay - len); x.lineWidth = 9; x.strokeStyle = INK; x.stroke(); x.lineWidth = 5.4; x.strokeStyle = '#6fd3a2'; x.stroke(); x.lineWidth = 2.4; x.strokeStyle = INK; };
        if (h > 40) { arm(1, h * 0.45, h * 0.28); if (R() < 0.7) arm(-1, h * 0.6, h * 0.22); }
        x.fillStyle = 'rgba(255,255,255,.55)'; for (let j = 0; j < 3; j++) { x.beginPath(); x.arc(cx - 2 + (j % 2) * 4, -h + 12 + j * 11, 1.3, 0, 7); x.fill(); }
        if (R() < 0.4) { x.fillStyle = '#ff9fc6'; x.beginPath(); x.arc(cx, -h - 1, 3.4, 0, 7); x.fill(); x.stroke(); }
      }
    } else if (o.type === 'rock') {
      const g = x.createLinearGradient(0, -o.h, 0, 0); g.addColorStop(0, '#d6d0f2'); g.addColorStop(1, '#948cc8'); x.fillStyle = g;
      x.beginPath(); x.moveTo(1, 0); x.quadraticCurveTo(-1, -o.h * 0.6, o.w * 0.3, -o.h * 0.9); x.quadraticCurveTo(o.w * 0.55, -o.h * 1.08, o.w * 0.8, -o.h * 0.8); x.quadraticCurveTo(o.w + 1, -o.h * 0.5, o.w - 1, 0); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.ellipse(o.w * 0.36, -o.h * 0.68, o.w * 0.12, o.h * 0.08, -0.5, 0, 7); x.fill();
    } else if (o.type === 'bush') {
      const g = x.createLinearGradient(0, -o.h, 0, 0); g.addColorStop(0, '#b4f0c8'); g.addColorStop(1, '#4fb879'); x.fillStyle = g;
      x.beginPath(); const cs = [[0.24, 0.42, 0.26], [0.5, 0.62, 0.34], [0.77, 0.44, 0.25]];
      cs.forEach(([a, b, r]) => { x.moveTo(o.w * a + o.w * r, -o.h * b); x.arc(o.w * a, -o.h * b, Math.min(o.w * r, o.h * 0.48), 0, 6.283); });
      x.rect(o.w * 0.08, -o.h * 0.42, o.w * 0.84, o.h * 0.42); x.fill();
      x.beginPath(); x.moveTo(1, 0); cs.forEach(([a, b, r]) => x.arc(o.w * a, -o.h * b, Math.min(o.w * r, o.h * 0.48), Math.PI, 0)); x.lineTo(o.w - 1, 0); x.stroke();
      ['#ff9fc6', '#ffffff', '#ffd166'].forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.arc(o.w * (0.3 + i * 0.2), -o.h * (0.5 + (i % 2) * 0.2), 2.6, 0, 7); x.fill(); });
    } else if (o.type === 'fence') {
      const posts = o.n === 2 ? [6, o.w - 6] : [6, o.w / 2, o.w - 6];
      const bar = (y) => { rr(x, 1, -y - 6, o.w - 2, 11, 5); x.save(); x.clip(); x.fillStyle = '#ffffff'; x.fillRect(0, -y - 8, o.w, 16); x.fillStyle = '#ff8fa3'; for (let s = -10; s < o.w + 10; s += 14) { x.beginPath(); x.moveTo(s, -y + 6); x.lineTo(s + 7, -y + 6); x.lineTo(s + 15, -y - 8); x.lineTo(s + 8, -y - 8); x.closePath(); x.fill(); } x.restore(); rr(x, 1, -y - 6, o.w - 2, 11, 5); x.stroke(); };
      posts.forEach((px) => { const g = x.createLinearGradient(px - 4, 0, px + 4, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d9d1f7'); x.fillStyle = g; rr(x, px - 4, -o.h, 8, o.h + 2, 3); x.fill(); x.stroke(); });
      bar(o.h * 0.72); bar(o.h * 0.38);
      x.fillStyle = '#ffd166'; x.beginPath(); x.arc(posts[0], -o.h - 3, 3.6, 0, 7); x.fill(); x.stroke();
    }
    return (SPR[o.key] = c);
  }
  function buildLayers() {
    L = { ready: false }; for (const k in SPR) delete SPR[k];
    const R = MG.rng(11), K = V.K;
    const hills = (pal) => { const T = 900, Hh = 120, [c, x] = mk(T, Hh); x.fillStyle = pal.hill; x.strokeStyle = pal.hillLine; x.lineWidth = 2; x.beginPath(); x.moveTo(0, Hh);
      for (let i = 0; i <= T; i += 6) { const y = Hh - 40 - 26 * Math.sin(i / T * Math.PI * 4) - 18 * Math.sin(i / T * Math.PI * 10 + 1) ; x.lineTo(i, y); } x.lineTo(T, Hh); x.closePath(); x.fill();
      x.beginPath(); for (let i = 0; i <= T; i += 6) { const y = Hh - 40 - 26 * Math.sin(i / T * Math.PI * 4) - 18 * Math.sin(i / T * Math.PI * 10 + 1); i ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke(); return c; };
    L.hills = [hills(PAL.day), hills(PAL.night)];
    const ground = (pal) => { const T = 520, Hh = 60, [c, x] = mk(T, Hh); const r2 = MG.rng(5); x.fillStyle = pal.speck; x.strokeStyle = pal.speck; x.lineCap = 'round';
      for (let i = 0; i < 38; i++) { const px = r2() * T, py = 8 + r2() * 44; if (r2() < 0.55) { x.lineWidth = 1.6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 4 + r2() * 8, py); x.stroke(); } else { x.beginPath(); x.arc(px, py, 1 + r2() * 1.4, 0, 7); x.fill(); } }
      for (let i = 0; i < 9; i++) { const px = r2() * T; x.beginPath(); x.ellipse(px, 4.5, 3 + r2() * 3, 1.6, 0, 0, 7); x.fill(); }
      return c; };
    L.ground = [ground(PAL.day), ground(PAL.night)];
    const cloud = (pal, w) => { const h = w * 0.42, [c, x] = mk(w + 8, h + 8); x.translate(4, 4); x.fillStyle = pal.cloud; x.strokeStyle = pal.cloudLine; x.lineWidth = 2;
      const path = () => { x.beginPath(); x.moveTo(w * 0.1, h); x.arc(w * 0.22, h - h * 0.3, h * 0.3, Math.PI * 0.6, Math.PI * 1.5); x.arc(w * 0.45, h * 0.42, h * 0.42, Math.PI * 1.1, Math.PI * 1.95); x.arc(w * 0.72, h * 0.55, h * 0.32, Math.PI * 1.3, Math.PI * 0.1); x.lineTo(w * 0.9, h); x.closePath(); };
      path(); x.fill(); path(); x.stroke(); return c; };
    L.clouds = [0, 1, 2, 3].map((i) => { const w = 70 + R() * 50; return { x: i * 180 + R() * 80, h: 130 + R() * 170, p: 0.18 + R() * 0.1, img: [cloud(PAL.day, w), cloud(PAL.night, w)] }; });
    // astres
    const orb = (col, moon) => { const [c, x] = mk(70, 70); const g = x.createRadialGradient(35, 35, 6, 35, 35, 34); g.addColorStop(0, moon ? 'rgba(240,236,255,.35)' : 'rgba(255,216,138,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 70, 70);
      x.fillStyle = col; x.beginPath(); x.arc(35, 35, 15, 0, 7); x.fill(); if (moon) { x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(42, 30, 13, 0, 7); x.fill(); } return c; };
    L.sun = orb(PAL.day.orb, false); L.moon = orb(PAL.night.orb, true);
    const st2 = document.createElement('canvas'); st2.width = cv.width; st2.height = Math.round(V.gy * V.dpr); const sx = st2.getContext('2d'); const r3 = MG.rng(9);
    for (let i = 0; i < 60; i++) { sx.fillStyle = `rgba(255,255,255,${0.35 + r3() * 0.6})`; sx.beginPath(); sx.arc(r3() * st2.width, r3() * st2.height * 0.8, (0.6 + r3() * 1.2) * V.dpr, 0, 7); sx.fill(); }
    L.stars = st2;
    // particules et bonus
    const soft = (col) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; };
    L.puff = soft('rgba(205,195,245,0.95)'); L.puffN = soft('rgba(120,110,190,0.9)');
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
        <div class="jp-pauseov"><h3>Pause</h3><p>Touche l'écran pour reprendre.</p><div class="jp-pacts"><button class="gbtn" data-jp="resume">${MG.icon('play')}Reprendre</button><button class="gbtn light" data-jp="quit">Quitter la partie</button></div></div>`;
      frame.insertBefore(root, frame.firstChild);
      cv = root.querySelector('.jp-cv'); ctx = cv.getContext('2d', { alpha: false });
      UI = { score: root.querySelector('.jp-score'), best: root.querySelector('#jpBest'), msg: root.querySelector('.jp-msg'), menu: root.querySelector('.jp-menu') };
      loadImgs(); V.cw = V.ch = 0; L = {}; st = null;
      newRun(); showMenu(); layout(); updHud();
      try { ro = new ResizeObserver(() => { clearTimeout(rTimer); rTimer = setTimeout(layout, 80); }); ro.observe(root); } catch (e) { window.addEventListener('resize', layout); }
      root.addEventListener('pointerdown', onDown); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp); root.addEventListener('pointerleave', onUp);
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
        art: `<i class="jp-cmilo" aria-hidden="true"></i>`,
        stats: [['Record', MG.fmt(d.best || 0), 'crown'], ['Parties', MG.fmt(s.games || 0), 'pad'], ['Étoiles', MG.fmt(s.stars || 0), 'star']],
        progress: null, cta: d.best ? 'Battre mon record' : 'Courir avec Milo' };
    },
    homeLine(d) { return `Milo Jump record ${MG.fmt(d.best || 0)}`; },
    _debug: { state: () => st, press: () => press(), release: () => release(), spawn: () => spawn(), score: () => score(), L: () => L }
  });

  /* ---------- Styles ---------- */
  const css = `
  .gscreen.jump{background:linear-gradient(180deg,#f1ecff,#fdfcff 60%,#ece6ff 60%)}
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
  .gcard.jump .gcard-art{background:linear-gradient(180deg,#f1ecff 0%,#fdfcff 70%,#ece6ff 70%)}
  .gcard.jump .gcard-art:after{content:"";position:absolute;left:0;right:0;bottom:30%;height:2.5px;background:#4b3f93;border-radius:2px}
  .gcard.jump .gcard-art img{position:relative;z-index:1;margin-left:30%}
  .jp-cmilo{position:absolute;left:5%;bottom:calc(30% - 5px);width:104px;height:86px;z-index:2;background:url(${MG.asset(SHEET.src)}) 0 0/800% 100% no-repeat;animation:jprun .5s steps(8) infinite,jpbob .25s ease-in-out infinite alternate}
  @keyframes jprun{to{background-position:114.2857% 0}}
  @keyframes jpbob{to{transform:translateY(-3px)}}
  @media (prefers-reduced-motion:reduce){.jp-logo,.jp-hint,.jp-cmilo{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
