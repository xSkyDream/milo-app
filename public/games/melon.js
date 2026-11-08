/* =====================================================================
   Milo Melon — jeu de fusion (principe « Suika »), univers Milo
   Architecture du module :
     1. Catalogue      → games/melon-data.js (window.MILO_MELON_TIERS)
     2. Physique       → class World (Verlet sous-échantillonné, cercles)
     3. Fusion         → Merge (détection, file d'attente, réactions en chaîne)
     4. Score          → Score (points, combos, multiplicateurs)
     5. Rendu/anim.    → Render (canvas 2D, sprites pré-rendus, déformations)
     6. Interface      → écrans DOM (accueil, réglages, règles, fin)
     7. Sauvegarde     → Store (S.games.melon, format versionné)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames; if (!MG) return;
  const TIERS = () => window.MILO_MELON_TIERS || [];

  /* ---------- Constantes du bocal (unités logiques) ---------- */
  const W = 360, H = 500, LIM = 60, DROP_Z = 86, WALL = 10;
  const PH = { g: 2300, sub: 8, damp: 0.9994, rest: 0.22, fr: 0.035, floorFr: 0.92, relax: 0.85 };
  const GAME = { cooldown: 0.42, dangerTime: 2.6, settleAge: 1.3, comboWin: 0.8 };
  const FACE = { idle: 'v3_face', joie: 'v3_heureux', wow: 'v3_alerte', bravo: 'v3_felicitations', focus: 'v3_determine', amour: 'v3_amour', dodo: 'v3_sommeil', clin: 'v3_clin' };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* =====================================================================
     2. PHYSIQUE
     ===================================================================== */
  let uid = 1;
  class World {
    constructor() { this.bodies = []; this.onTouch = null; }
    add(tier, x, y, r) {
      const t = TIERS()[tier], R = t.size;
      const b = { id: uid++, tier, x, y, px: x, py: y, r: r || R, R, m: R * R, ang: 0, lx: x, age: 0, sq: 0, sqv: 0, sqA: 0, ps: 0, psv: 0, hit: 0, touch: false, lock: false, dead: false };
      this.bodies.push(b); return b;
    }
    step(dt) {
      const n = PH.sub, sdt = dt / n, g = PH.g * sdt * sdt, B = this.bodies;
      for (const b of B) { b.hit = 0; b.touch = false; }
      for (let s = 0; s < n; s++) {
        for (const b of B) {
          let vx = (b.x - b.px) * PH.damp, vy = (b.y - b.py) * PH.damp;
          const lim = b.r * 0.45, sp = vx * vx + vy * vy; if (sp > lim * lim) { const k = lim / Math.sqrt(sp); vx *= k; vy *= k; }
          b.px = b.x; b.py = b.y; b.x += vx; b.y += vy + g;
        }
        for (let i = 0; i < B.length; i++) {
          const a = B[i];
          for (let j = i + 1; j < B.length; j++) {
            const b = B[j], rr = a.r + b.r, rm = rr + 1.5, dx = b.x - a.x; if (dx > rm || dx < -rm) continue;
            const dy = b.y - a.y; if (dy > rm || dy < -rm) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) { if (a.tier === b.tier && d2 < (rr + 1.2) * (rr + 1.2) && this.onTouch) this.onTouch(a, b); continue; }
            const d = Math.sqrt(d2) || 0.0001, nx = dx / d, ny = dy / d, ov = (rr - d) * PH.relax, ta = b.m / (a.m + b.m), tb = 1 - ta;
            a.x -= nx * ov * ta; a.y -= ny * ov * ta; b.x += nx * ov * tb; b.y += ny * ov * tb;
            const rvx = (b.x - b.px) - (a.x - a.px), rvy = (b.y - b.py) - (a.y - a.py), vn = rvx * nx + rvy * ny;
            const tx = rvx - vn * nx, ty = rvy - vn * ny;
            a.px -= tx * PH.fr * ta; a.py -= ty * PH.fr * ta; b.px += tx * PH.fr * tb; b.py += ty * PH.fr * tb;
            if (vn < 0) { const h = -vn; if (h > a.hit) { a.hit = h; a.sqA = Math.atan2(ny, nx); } if (h > b.hit) { b.hit = h; b.sqA = Math.atan2(ny, nx); } }
            a.touch = b.touch = true;
            if (a.tier === b.tier && this.onTouch) this.onTouch(a, b);
          }
        }
        for (const b of B) {
          if (b.x < b.r) { const vx = b.x - b.px; b.x = b.r; b.px = b.x + vx * PH.rest; b.touch = true; }
          else if (b.x > W - b.r) { const vx = b.x - b.px; b.x = W - b.r; b.px = b.x + vx * PH.rest; b.touch = true; }
          if (b.y > H - b.r) {
            const vy = b.y - b.py; if (vy > b.hit) { b.hit = vy; b.sqA = Math.PI / 2; }
            b.y = H - b.r; b.py = b.y + vy * PH.rest; const vx = b.x - b.px; b.px = b.x - vx * PH.floorFr; b.touch = true;
          }
        }
      }
      // conversion de l'impact (unités/sous-pas → unités/s)
      for (const b of B) b.hit *= n / dt;
    }
  }

  /* =====================================================================
     3. FUSION  ·  4. SCORE
     ===================================================================== */
  const Merge = {
    queue: [],
    touch(a, b) { if (a.dead || b.dead || a.lock || b.lock || a.tier !== b.tier) return; if (a.age < 0.04 && b.age < 0.04) return; a.lock = b.lock = true; Merge.queue.push([a, b]); },
    resolve() {
      const q = Merge.queue; Merge.queue = []; const T = TIERS(), top = T.length - 1;
      const alive = new Set(st.world.bodies);
      for (const [a, b] of q) {
        if (a.dead || b.dead || !alive.has(a) || !alive.has(b)) continue;
        a.dead = b.dead = true;
        const m = a.m + b.m, x = (a.x * a.m + b.x * b.m) / m, y = (a.y * a.m + b.y * b.m) / m;
        const vx = ((a.x - a.px) * a.m + (b.x - b.px) * b.m) / m, vy = ((a.y - a.py) * a.m + (b.y - b.py) * b.m) / m;
        if (a.tier >= top) { onMerge(a.tier, x, y, null); continue; }
        const nb = st.world.add(a.tier + 1, x, y, Math.max(a.r, b.r));
        nb.px = x - vx * 0.3; nb.py = y - vy * 0.3; nb.ang = (a.ang + b.ang) / 2; nb.psv = 5.5; nb.age = 0.3; nb.born = st.t;
        onMerge(a.tier, x, y, nb);
      }
      st.world.bodies = st.world.bodies.filter((b) => !b.dead);
    }
  };
  const Score = {
    add(newTier, ultimate) {
      const T = TIERS();
      st.combo = st.t - st.lastMerge < GAME.comboWin ? st.combo + 1 : 1; st.lastMerge = st.t;
      const mult = Math.min(3, 1 + 0.25 * (st.combo - 1)), base = ultimate ? T[T.length - 1].points * 2 : T[newTier].points;
      const pts = Math.round(base * mult); st.score += pts; return { pts, mult };
    }
  };

  /* ---------- État ---------- */
  let api = null, root = null, cv = null, ctx = null, ro = null, raf = 0, last = 0, acc = 0, rTimer = 0;
  let st = null, UI = {}, V = { cw: 0, ch: 0, dpr: 1, s: 1, bx: 0, by: 0 }, SPR = {}, IMG = {}, L = {};
  const parts = [], floats = [], glows = [];

  function loadImgs() {
    TIERS().forEach((t) => { if (IMG[t.id]) return; const im = new Image(); im.decoding = 'async'; im.onload = () => { im.ok = true; SPR = {}; }; im.src = MG.asset(t.src); IMG[t.id] = im; });
    Object.values(FACE).forEach((f) => { const im = new Image(); im.src = `assets/${f}.webp`; });
  }
  function pickSpawn() {
    const T = TIERS(), cap = Math.min(T.length - 1, Math.max(2, (st ? st.maxTier : 0)));
    let tot = 0; T.forEach((t, i) => { if (i <= cap && t.spawn) tot += t.spawn; });
    let x = Math.random() * tot; for (let i = 0; i < T.length; i++) { const w = i <= cap ? T[i].spawn || 0 : 0; x -= w; if (x <= 0 && w) return i; }
    return 0;
  }
  function newGame(saved) {
    const world = new World(); world.onTouch = Merge.touch; Merge.queue = [];
    st = { world, t: 0, score: 0, combo: 0, lastMerge: -9, cur: 0, next: 0, dropX: W / 2, aimX: W / 2, aiming: false, cool: 0, maxTier: 0, merges: 0, drops: 0,
      danger: 0, dangerBeep: 0, over: false, state: 'menu', prevBest: api.data.best || 0, recShown: false, dirty: false, saveAt: 0, chainMax: 0, idle: 0, msgAt: -9 };
    if (saved && saved.bodies) {
      saved.bodies.forEach(([tier, x, y, ang]) => { if (TIERS()[tier]) { const b = world.add(tier, x, y); b.ang = ang || 0; b.age = 5; } });
      Object.assign(st, { score: saved.score || 0, cur: saved.cur || 0, next: saved.next || 0, maxTier: saved.maxTier || 0, merges: saved.merges || 0, drops: saved.drops || 0 });
    } else { st.cur = pickSpawn(); st.next = pickSpawn(); }
    parts.length = 0; floats.length = 0; glows.length = 0;
    updHud(); drawStrip();
  }

  /* ---------- Lâcher ---------- */
  function drop() {
    if (!st || st.state !== 'play' || st.cool > 0 || st.over) return;
    const t = TIERS()[st.cur], x = clamp(st.dropX, t.size + 1, W - t.size - 1);
    const b = st.world.add(st.cur, x, -t.size - 10); b.py = b.y - 1.2; b.ps = -0.08; b.age = 0;
    st.drops++; st.cool = GAME.cooldown; st.cur = st.next; st.next = pickSpawn(); st.dirty = true;
    MG.sfx.play('drop'); updHud(); hideHint();
  }

  /* ---------- Réactions aux fusions ---------- */
  function onMerge(tier, x, y, nb) {
    const T = TIERS(), top = T.length - 1, ult = !nb, newTier = ult ? tier : tier + 1;
    const { pts, mult } = Score.add(newTier, ult);
    st.merges++; st.chainMax = Math.max(st.chainMax, st.combo); st.dirty = true;
    const d = api.data, s = d.stats;
    s.merges = (s.merges || 0) + 1;
    const firstEver = newTier > (s.maxTier || 0);
    if (newTier > st.maxTier) st.maxTier = newTier;
    if (newTier > (s.maxTier || 0)) s.maxTier = newTier;
    // effets
    const [sx, sy] = toScreen(x, y), col = T[newTier].color;
    try { api.fx.burst(sx, sy, [col, '#ffffff', T[tier].color], Math.min(26, 8 + newTier * 2), { speed: 3 + newTier * 0.35, size: 6 + newTier * 0.6 }); if (newTier >= 6 || st.combo >= 3) api.fx.ring(sx, sy, '#ffffff', 3); } catch (e) {}
    glows.push({ x, y, r: T[newTier].size * 1.6, t: 0 });
    floats.push({ x, y: y - T[newTier].size * 0.4, t: 0, text: '+' + pts, big: mult > 1 || newTier >= 7 });
    if (st.combo >= 2) floats.push({ x, y: y - T[newTier].size * 0.4 - 22, t: -0.05, text: 'Chaîne ×' + st.combo, chain: true });
    MG.sfx.play('pop', { lv: newTier, chain: st.combo });
    if (newTier >= 6 && (d.prefs || {}).haptics !== false) { try { navigator.vibrate && navigator.vibrate(12 + newTier * 2); } catch (e) {} }
    // Milo
    if (ult) { say('Fusion ultime ! Pastèque géante !', 'gold', 2000); face('bravo', 2200); MG.sfx.play('record'); try { api.fx.confetti(110); } catch (e) {} s.melons = (s.melons || 0) + 1; }
    else if (firstEver && newTier >= 4) { say(`Nouvelle mascotte : ${T[newTier].name} !`, 'gold', 1900); face('bravo', 2000); MG.sfx.play('unlock'); drawStrip(true); try { api.fx.confetti(newTier >= 8 ? 90 : 45); } catch (e) {} }
    else if (newTier === top) { say('La pastèque est là !', 'gold', 1800); face('bravo', 2000); try { api.fx.confetti(90); } catch (e) {} }
    else if (st.combo >= 4) { say('Réaction en chaîne incroyable !', 'fire', 1500); face('wow', 1500); }
    else if (st.combo === 3) { say('Réaction en chaîne !', 'fire', 1300); face('joie', 1300); }
    else if (newTier >= 8) { say(['Magnifique !', 'Superbe fusion !'][st.merges % 2], 'pop', 1300); face('joie', 1300); }
    else if (newTier >= 6 && Math.random() < 0.6) { say(['Joli !', 'Bien vu !', 'Super !'][st.merges % 3], '', 1100); face('clin', 1100); }
    if (st.prevBest > 0 && st.score > st.prevBest && !st.recShown) { st.recShown = true; setTimeout(() => { if (!root) return; say('Nouveau record !', 'gold', 1800); face('bravo', 1800); MG.sfx.play('record'); }, 500); }
    if (st.score > (d.best || 0)) { d.best = st.score; d.bestAt = new Date().toISOString(); }
    updHud(true); drawStrip();
  }

  /* =====================================================================
     BOUCLE
     ===================================================================== */
  const STEP = 1 / 60;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = last ? (now - last) / 1000 : 0; last = now; if (dt > 0.1) dt = 0.1; if (dt < 0) dt = 0;
    if (!st || st.state === 'paused') return;
    if ((st.state === 'over' && !parts.length && !floats.length && !glows.length) || st.state === 'menu') { if (++st.idle > 4) return; } else st.idle = 0;
    if (st.state === 'play') {
      acc += dt; let n = 0;
      while (acc >= STEP && n < 4) { tick(STEP); acc -= STEP; n++; }
      if (n === 4) acc = 0;
    }
    anim(dt); draw();
  }
  function tick(dt) {
    st.t += dt; if (st.cool > 0) st.cool -= dt;
    st.world.step(dt); Merge.resolve();
    // âge, croissance, déformation
    for (const b of st.world.bodies) {
      b.age += dt;
      if (b.r < b.R) b.r = Math.min(b.R, b.r + (b.R - b.r) * Math.min(1, dt * 16) + 0.4);
      if (b.hit > 140) { const k = Math.min(0.2, b.hit / 2600); if (k > b.sq) { b.sq = k; b.sqv = 0; } }
      if (b.touch) b.ang += (b.x - b.lx) / b.r * 0.92; b.lx = b.x;
    }
    // débordement
    let over = false;
    for (const b of st.world.bodies) if (b.age > GAME.settleAge && b.y - b.r < LIM) { const v = Math.abs(b.y - b.py) + Math.abs(b.x - b.px); if (v < 0.3) { over = true; break; } }
    if (over) {
      st.danger += dt;
      if (st.danger > 0.5 && st.t - st.dangerBeep > 0.6) { st.dangerBeep = st.t; MG.sfx.play('warn'); if (st.t - st.msgAt > 4) { st.msgAt = st.t; say('Attention, ça déborde !', 'warn', 1500); face('wow', 1500); } }
      if (st.danger > GAME.dangerTime) gameOver();
    } else st.danger = Math.max(0, st.danger - dt * 1.5);
    if (st.dirty && st.t - st.saveAt > 4) { st.saveAt = st.t; persist(); }
  }
  function anim(dt) {
    for (const b of (st ? st.world.bodies : [])) {
      b.sqv += (-280 * b.sq - 15 * b.sqv) * dt; b.sq += b.sqv * dt;
      b.psv += (-300 * b.ps - 14 * b.psv) * dt; b.ps += b.psv * dt;
    }
    st.dropX += (st.aimX - st.dropX) * Math.min(1, dt * 30);
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= 34 * dt; if (f.t > 1) floats.splice(i, 1); }
    for (let i = glows.length - 1; i >= 0; i--) { const g = glows[i]; g.t += dt; if (g.t > 0.35) glows.splice(i, 1); }
    if (st.state === 'menu') st.t += dt;
  }

  /* =====================================================================
     5. RENDU
     ===================================================================== */
  const toScreen = (x, y) => [V.bx + x * V.s, V.by + y * V.s];
  function sprite(i) {
    if (SPR[i]) return SPR[i];
    const t = TIERS()[i], im = IMG[t.id]; if (!im || !im.ok) return null;
    const px = t.size * V.s * V.dpr * 1.03, k = px / (t.body.r * im.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
    c.ax = t.body.cx * c.width; c.ay = t.body.cy * c.height;
    return (SPR[i] = c);
  }
  function buildJar() {
    const s = V.s, dpr = V.dpr, pad = 26, w = (W + 2 * WALL) * s + pad * 2, h = (H + WALL + 18) * s + pad * 2;
    const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(pad, pad);
    const iw = W * s, ih = H * s, wl = WALL * s, rad = 28 * s;
    const jar = (a, b, ww, hh, r) => { x.beginPath(); x.moveTo(a, b); x.lineTo(a, b + hh - r); x.quadraticCurveTo(a, b + hh, a + r, b + hh); x.lineTo(a + ww - r, b + hh); x.quadraticCurveTo(a + ww, b + hh, a + ww, b + hh - r); x.lineTo(a + ww, b); };
    // ombre portée douce
    x.save(); x.shadowColor = 'rgba(120,60,140,.22)'; x.shadowBlur = 26 * s; x.shadowOffsetY = 12 * s; jar(0, 0, iw + 2 * wl, ih + wl, rad + wl); x.closePath(); x.fillStyle = 'rgba(255,255,255,.35)'; x.fill(); x.restore();
    // intérieur
    const g = x.createLinearGradient(0, 0, 0, ih); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.6, 'rgba(255,240,246,.62)'); g.addColorStop(1, 'rgba(244,226,255,.78)');
    jar(wl, 0, iw, ih, rad); x.closePath(); x.fillStyle = g; x.fill();
    // reflets lumineux (lignes douces)
    x.save(); jar(wl, 0, iw, ih, rad); x.closePath(); x.clip();
    const lg = x.createLinearGradient(wl, 0, wl + iw, 0); lg.addColorStop(0, 'rgba(255,255,255,.0)'); lg.addColorStop(0.08, 'rgba(255,255,255,.55)'); lg.addColorStop(0.16, 'rgba(255,255,255,0)'); lg.addColorStop(0.84, 'rgba(255,255,255,0)'); lg.addColorStop(0.92, 'rgba(255,255,255,.3)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = lg; x.fillRect(wl, 0, iw, ih); x.restore();
    // parois en verre
    x.lineCap = 'round'; x.lineJoin = 'round';
    jar(wl / 2, 0, iw + wl, ih + wl / 2, rad + wl / 2); x.lineWidth = wl; x.strokeStyle = 'rgba(255,255,255,.75)'; x.stroke();
    jar(wl / 2, 0, iw + wl, ih + wl / 2, rad + wl / 2); x.lineWidth = 1.6; x.strokeStyle = 'rgba(160,110,200,.35)'; x.stroke();
    jar(0, 0, iw + 2 * wl, ih + wl, rad + wl); x.lineWidth = 1.4; x.strokeStyle = 'rgba(140,90,190,.28)'; x.stroke();
    // rebord
    x.fillStyle = '#ffffff'; [[0], [iw + wl]].forEach(([a]) => { x.beginPath(); x.roundRect ? x.roundRect(a - 2 * s, -5 * s, wl + 4 * s, 10 * s, 5 * s) : x.rect(a - 2 * s, -5 * s, wl + 4 * s, 10 * s); x.fill(); });
    c.pad = pad; return c;
  }
  function softGlow() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(0.45, 'rgba(255,240,250,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c; }
  function draw() {
    const c = ctx, s = V.s; if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    // bocal
    if (L.jar) c.drawImage(L.jar, V.bx - WALL * s - L.jar.pad, V.by - L.jar.pad, L.jar.width / V.dpr, L.jar.height / V.dpr);
    // ligne limite
    const ly = V.by + LIM * s, dang = st && st.danger > 0;
    c.save(); c.setLineDash([8 * s, 7 * s]); c.lineWidth = Math.max(1.5, 2 * s); c.lineCap = 'round';
    const pulse = dang ? 0.55 + 0.45 * Math.sin(st.t * 12) : 0;
    c.strokeStyle = dang ? `rgba(240,70,110,${0.6 + pulse * 0.4})` : 'rgba(150,100,200,.28)';
    c.beginPath(); c.moveTo(V.bx + 6 * s, ly); c.lineTo(V.bx + (W - 6) * s, ly); c.stroke(); c.restore();
    if (dang) { c.fillStyle = `rgba(240,70,110,${0.06 + pulse * 0.06})`; c.fillRect(V.bx, V.by, W * s, LIM * s); }
    if (!st) return;
    // ligne de visée + mascotte à lâcher
    const T = TIERS(), ct = T[st.cur], dx = clamp(st.dropX, ct.size + 1, W - ct.size - 1), dyy = -ct.size - 10;
    const showAim = st.state === 'play' && st.cool <= 0;
    if (showAim && (api.data.prefs || {}).guide !== false) {
      let yEnd = H; for (const b of st.world.bodies) { const ddx = Math.abs(b.x - dx); if (ddx < b.r) { const yt = b.y - Math.sqrt(b.r * b.r - ddx * ddx); if (yt < yEnd && yt > dyy) yEnd = yt; } }
      c.save(); c.setLineDash([3 * s, 6 * s]); c.lineWidth = 2; c.strokeStyle = 'rgba(120,80,190,.35)'; c.beginPath(); c.moveTo(V.bx + dx * s, V.by + (dyy + ct.size) * s); c.lineTo(V.bx + dx * s, V.by + yEnd * s); c.stroke(); c.restore();
    }
    if (st.state === 'play' || st.state === 'menu') {
      const k = st.cool > 0 ? clamp(1 - st.cool / GAME.cooldown, 0, 1) : 1, pop = k < 1 ? 0.5 + 0.5 * k : 1 + Math.sin(st.t * 3) * 0.015;
      drawBody({ tier: st.cur, x: dx, y: dyy + Math.sin(st.t * 2.6) * 1.5, r: ct.size, R: ct.size, ang: Math.sin(st.t * 1.8) * 0.08, sq: 0, sqA: 0, ps: pop - 1 }, k);
    }
    // corps
    for (const b of st.world.bodies) drawBody(b, 1);
    const dim = st.state === 'play' && dx * s < 80; if (dim !== UI.dim) { UI.dim = dim; UI.milo.classList.toggle('dim', dim); }
    // lueurs de fusion
    for (const g of glows) { const k = g.t / 0.35, r = g.r * (0.6 + k * 0.7) * s; c.globalAlpha = (1 - k) * 0.8; c.drawImage(L.glow, V.bx + g.x * s - r, V.by + g.y * s - r, r * 2, r * 2); }
    c.globalAlpha = 1;
    // textes
    for (const f of floats) {
      if (f.t < 0) continue; const k = f.t;
      c.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2; const sc = k < 0.12 ? 0.6 + k / 0.12 * 0.5 : 1;
      c.save(); c.translate(V.bx + f.x * s, V.by + f.y * s); c.scale(sc, sc);
      c.font = `900 ${f.chain ? 15 : f.big ? 22 : 17}px ${V.font}`; c.textAlign = 'center'; c.lineJoin = 'round';
      c.lineWidth = 5; c.strokeStyle = f.chain ? '#ff4f8b' : '#6a3be0'; c.strokeText(f.text, 0, 0); c.fillStyle = f.chain ? '#ffffff' : f.big ? '#fff2a6' : '#ffffff'; c.fillText(f.text, 0, 0); c.restore();
    }
    c.globalAlpha = 1;
  }
  function drawBody(b, alpha) {
    const spr = sprite(b.tier); if (!spr) return;
    const c = ctx, s = V.s, sc = (b.r / b.R) * (1 + b.ps);
    c.save(); c.globalAlpha = alpha;
    c.translate(V.bx + b.x * s, V.by + b.y * s);
    if (b.sq > 0.004) { c.rotate(b.sqA); c.scale(1 - b.sq, 1 + b.sq * 0.7); c.rotate(-b.sqA); }
    c.rotate(b.ang); c.scale(sc, sc);
    const w = spr.width / V.dpr, h = spr.height / V.dpr;
    c.drawImage(spr, -spr.ax / V.dpr, -spr.ay / V.dpr, w, h);
    c.restore();
  }
  function layout() {
    if (!root) return;
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === V.cw && h === V.ch && dpr === V.dpr && L.jar) return;
    const top = UI.top.getBoundingClientRect(), bot = UI.bottom.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const topH = top.bottom - rr.top + 6, botH = rr.bottom - bot.top + 6;
    const availH = h - topH - botH, s = Math.min((w - 24) / (W + 2 * WALL + 8), availH / (DROP_Z + H + WALL + 6));
    V.cw = w; V.ch = h; V.dpr = dpr; V.s = s;
    V.bx = (w - W * s) / 2; V.by = topH + Math.max(0, (availH - (DROP_Z + H + WALL) * s) / 2) + DROP_Z * s;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    SPR = {}; L.jar = buildJar(); L.glow = L.glow || softGlow();
    V.font = getComputedStyle(root).fontFamily;
    // Milo sur le rebord du bocal
    UI.milo.style.left = (V.bx - WALL * s - 6) + 'px'; UI.milo.style.top = (V.by - 64) + 'px';
    UI.hint.style.top = (V.by + (H * 0.42) * s) + 'px';
    if (st) { st.idle = 0; draw(); }
  }

  /* =====================================================================
     6. INTERFACE
     ===================================================================== */
  function face(k, ms) {
    const img = UI.miloImg; if (!img) return; clearTimeout(UI.faceT);
    img.src = `assets/${FACE[k] || FACE.idle}.webp`; img.classList.remove('hop'); void img.offsetWidth; img.classList.add('hop');
    UI.faceT = ms ? setTimeout(() => { if (UI.miloImg) UI.miloImg.src = `assets/${FACE[st && st.danger > 0 ? 'focus' : 'idle']}.webp`; }, ms) : 0;
  }
  function say(text, kind, ms) {
    const b = UI.bub; if (!b) return; clearTimeout(UI.bubT);
    b.textContent = text; b.className = 'ml-bub ' + (kind || ''); void b.offsetWidth; b.classList.add('show');
    UI.bubT = setTimeout(() => b.classList.remove('show'), ms || 1400);
  }
  function hideHint() { root && root.classList.add('moved'); }
  function updHud(bump) {
    if (!UI.score || !st) return; const T = TIERS();
    UI.score.textContent = MG.fmt(st.score); UI.best.textContent = MG.fmt(Math.max(api.data.best || 0, st.score));
    UI.next.src = MG.asset(T[st.next].src); UI.next.alt = T[st.next].name;
    if (bump) { UI.score.classList.remove('bump'); void UI.score.offsetWidth; UI.score.classList.add('bump'); }
  }
  function drawStrip(flash) {
    if (!UI.strip || !st) return; const T = TIERS(), ever = (api.data.stats || {}).maxTier || 0;
    UI.strip.innerHTML = T.map((t, i) => `<i class="${i <= ever ? 'ok' : ''} ${i === st.maxTier ? 'cur' : ''} ${flash && i === st.maxTier ? 'new' : ''}" title="${i <= ever ? t.name : 'À découvrir'}">${i <= ever ? `<img src="${MG.asset(t.src)}" alt="" draggable="false">` : '<b>?</b>'}</i>`).join('');
  }
  function menuHTML() {
    const d = api.data, s = d.stats || {}, T = TIERS(), mt = s.maxTier || 0, cur = d.current;
    return `<div class="ml-mtop"><div class="grow"></div>${MG.soundBtn()}<button class="gclose" data-ml="quit" aria-label="Quitter">${MG.icon('x')}</button></div>
      <img class="ml-logo" src="${MG.asset('logo_melon.webp')}" alt="Milo Melon" draggable="false">
      <div class="ml-card">
        <img class="ml-cmilo" src="assets/${FACE.joie}.webp" alt="" draggable="false">
        <div class="ml-stats"><div><span>${MG.icon('crown')}Record</span><b>${MG.fmt(d.best || 0)}</b></div><div><span>Parties</span><b>${MG.fmt(s.games || 0)}</b></div><div><span>Fusions</span><b>${MG.fmt(s.merges || 0)}</b></div></div>
        <div class="ml-maxm"><img src="${MG.asset(T[mt].src)}" alt=""><span>Plus grosse mascotte<b>${T[mt].name}</b></span><em>${mt + 1} / ${T.length}</em></div>
        <div class="ml-macts">${cur && cur.bodies && cur.bodies.length ? `<button class="gbtn" data-ml="resume-game">${MG.icon('play')}Reprendre (${MG.fmt(cur.score || 0)})</button><button class="gbtn light" data-ml="new">Nouvelle partie</button>` : `<button class="gbtn" data-ml="new">${MG.icon('play')}Jouer</button>`}</div>
        <button class="ml-link" data-ml="rules">${MG.icon('help')}Comment jouer</button>
      </div>`;
  }
  function showMenu() { st.state = 'menu'; root.dataset.state = 'menu'; UI.menu.innerHTML = menuHTML(); UI.menu.classList.add('show'); }
  function startGame(resume) {
    UI.menu.classList.remove('show'); closeModal();
    const cur = api.data.current;
    newGame(resume && cur && cur.bodies ? cur : null);
    if (!resume) { api.data.current = null; }
    st.state = 'play'; root.dataset.state = 'play'; root.classList.toggle('moved', !!resume); last = 0; acc = 0;
    face('joie', 1200); say(resume ? 'On reprend !' : 'À toi de jouer !', '', 1300);
  }
  function modal(html, cls) {
    closeModal(); const m = document.createElement('div'); m.className = 'gmodal ml-modal ' + (cls || ''); m.innerHTML = `<div class="gpanel">${html}</div>`; root.appendChild(m); return m;
  }
  function closeModal() { const m = root && root.querySelector('.ml-modal'); if (m) m.remove(); }
  function rulesHTML() {
    const T = TIERS(), ever = (api.data.stats || {}).maxTier || 0;
    return `<h3>Comment jouer</h3>
      <ul class="ml-rules"><li><b>1</b>Glisse ton doigt pour placer la mascotte, relâche pour la lâcher.</li><li><b>2</b>Deux mascottes identiques qui se touchent fusionnent en une plus grosse.</li><li><b>3</b>Enchaîne les fusions pour multiplier tes points.</li><li><b>4</b>Si les mascottes restent au-dessus de la ligne, la partie s'arrête.</li></ul>
      <div class="ml-evo">${T.map((t, i) => `<span class="${i <= ever ? '' : 'lk'}"><img src="${MG.asset(t.src)}" alt=""><small>${i <= ever ? t.name : '?'}</small></span>`).join('')}</div>
      <div class="acts"><button class="gbtn" data-ml="close">${st && st.state === 'paused' ? 'Reprendre' : 'Compris'}</button></div>`;
  }
  function settingsHTML() {
    const p = api.data.prefs || {};
    const tg = (k, label, on) => `<button class="ml-tg ${on ? 'on' : ''}" data-tg="${k}"><span>${label}</span><i></i></button>`;
    return `<h3>Paramètres</h3>
      <div class="ml-tgs">${tg('sound', 'Sons', !MG.sfx.muted)}${tg('haptics', 'Vibrations', p.haptics !== false)}${tg('guide', 'Ligne de visée', p.guide !== false)}</div>
      <div class="acts"><button class="gbtn" data-ml="close">${MG.icon('play')}Reprendre</button><button class="gbtn light" data-ml="restart">${MG.icon('redo')}Recommencer la partie</button><button class="gbtn light" data-ml="quit">Quitter le jeu</button></div>`;
  }
  function pause(withPanel) {
    if (!st || st.state !== 'play') return; st.state = 'paused'; root.dataset.state = 'paused'; persist();
    if (withPanel !== false) modal(`<h3>Pause</h3><p>Ta partie est sauvegardée.</p><div class="acts"><button class="gbtn" data-ml="close">${MG.icon('play')}Reprendre</button><button class="gbtn light" data-ml="restart">${MG.icon('redo')}Recommencer</button><button class="gbtn light" data-ml="quit">Quitter le jeu</button></div>`);
  }
  function resume() { if (st && st.state === 'paused') { closeModal(); st.state = 'play'; root.dataset.state = 'play'; last = 0; acc = 0; } }
  function gameOver() {
    if (st.over) return; st.over = true; st.state = 'over'; root.dataset.state = 'over';
    const d = api.data, s = d.stats, T = TIERS(), sc = st.score, rec = sc > st.prevBest && sc > 0, now = new Date().toISOString();
    s.games = (s.games || 0) + 1; s.totalScore = (s.totalScore || 0) + sc; s.drops = (s.drops || 0) + st.drops; s.bestChain = Math.max(s.bestChain || 0, st.chainMax);
    if (sc > (d.best || 0)) { d.best = sc; d.bestAt = now; }
    d.top = (d.top || []).concat([{ s: sc, at: now, max: st.maxTier }]).sort((a, b) => b.s - a.s).slice(0, 10);
    d.current = null; d.lastPlayed = now; api.save();
    face('dodo'); say('Le bocal déborde…', '', 1600); MG.sfx.play('over');
    // les mascottes au-dessus de la ligne clignotent
    st.world.bodies.forEach((b) => { if (b.y - b.r < LIM) { b.ps = 0.15; b.psv = 4; } });
    setTimeout(() => {
      if (!root || !st) return;
      if (rec) { try { api.fx.confetti(110); } catch (e) {} MG.sfx.play('record'); }
      const mt = st.maxTier;
      modal(`<img class="mas" src="assets/${FACE[rec ? 'bravo' : 'amour']}.webp" alt="">
        <h3>${rec ? (st.prevBest ? 'Nouveau record !' : 'Premier record !') : 'Partie terminée'}</h3>
        <p>${rec ? (st.prevBest ? `Tu as battu ton ancien record de ${MG.fmt(st.prevBest)}.` : 'Ton premier score est enregistré.') : mt >= 8 ? 'Très belle partie, Milo est fier de toi !' : 'Chaque partie te rapproche de la pastèque. On recommence ?'}</p>
        <div class="ml-sc"><div><span>Score</span><b>${MG.fmt(sc)}</b></div><div class="${rec ? 'hot' : ''}"><span>${MG.icon('crown')}Record</span><b>${MG.fmt(d.best)}</b></div></div>
        <div class="ml-maxm"><img src="${MG.asset(T[mt].src)}" alt=""><span>Mascotte maximale<b>${T[mt].name}</b></span><em>${st.merges} fusions</em></div>
        <div class="acts"><button class="gbtn" data-ml="new">${MG.icon('redo')}Rejouer</button><button class="gbtn light" data-ml="quit">Retour aux jeux</button></div>`, 'ml-over');
    }, 1300);
  }

  /* =====================================================================
     7. SAUVEGARDE (format versionné, prêt pour une synchronisation de compte)
     ===================================================================== */
  function persist() {
    if (!st || st.over || st.state === 'menu') { api.save(); return; }
    const d = api.data; d.v = 1;
    d.current = { v: 1, score: st.score, cur: st.cur, next: st.next, maxTier: st.maxTier, merges: st.merges, drops: st.drops, at: new Date().toISOString(),
      bodies: st.world.bodies.filter((b) => !b.dead).map((b) => [b.tier, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.ang * 100) / 100]) };
    if (!d.current.bodies.length && !st.score) d.current = null;
    api.save(); st.dirty = false;
  }

  /* ---------- Entrées ---------- */
  function toUnits(clientX) { const r = root.getBoundingClientRect(); return (clientX - r.left - V.bx) / V.s; }
  function onDown(e) {
    if (e.button > 0 || e.target.closest('button, .ml-menu, .gmodal, .ml-top, .ml-bottom')) return;
    if (!st || st.state !== 'play') return;
    if (e.cancelable) e.preventDefault();
    st.aiming = true; st.aimX = toUnits(e.clientX); st.dropX = st.aimX; // pas de décalage : la mascotte suit le doigt immédiatement
    try { root.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onMove(e) { if (st && st.aiming) st.aimX = toUnits(e.clientX); }
  function onUp(e) { if (!st || !st.aiming) return; st.aiming = false; st.aimX = toUnits(e.clientX); st.dropX = st.aimX; drop(); }
  function onKey(e) {
    if (!root || !st || e.metaKey || e.ctrlKey) return;
    if (st.state === 'play') {
      if (e.code === 'ArrowLeft') { e.preventDefault(); st.aimX = clamp(st.aimX - 18, 0, W); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); st.aimX = clamp(st.aimX + 18, 0, W); }
      else if ((e.code === 'Space' || e.code === 'ArrowDown') && !e.repeat) { e.preventDefault(); drop(); }
      else if (e.code === 'KeyP') pause();
    } else if (st.state === 'paused' && (e.code === 'Space' || e.code === 'KeyP')) { e.preventDefault(); resume(); }
  }
  function onClick(e) {
    const tg = e.target.closest('[data-tg]');
    if (tg) { const k = tg.dataset.tg, p = api.data.prefs || (api.data.prefs = {}); if (k === 'sound') MG.sfx.toggle(); else { p[k] = p[k] === false; api.save(); } tg.classList.toggle('on', k === 'sound' ? !MG.sfx.muted : p[k] !== false); return; }
    const b = e.target.closest('[data-ml]'); if (!b) return;
    const a = b.dataset.ml;
    if (a === 'quit') { persist(); api.close(); }
    else if (a === 'new') { MG.sfx.play('tap'); startGame(false); }
    else if (a === 'resume-game') { MG.sfx.play('tap'); startGame(true); }
    else if (a === 'rules') { if (st.state === 'play') pause(false); modal(rulesHTML(), 'ml-rulesm'); }
    else if (a === 'settings') { if (st.state === 'play') pause(false); modal(settingsHTML(), 'ml-set'); }
    else if (a === 'pause') { st.state === 'play' ? pause() : resume(); }
    else if (a === 'restart') { closeModal(); st.state = 'play'; api.data.current = null; startGame(false); }
    else if (a === 'close') { closeModal(); if (st.state === 'paused') resume(); }
  }
  function onVis() { if (document.hidden) { if (st && st.state === 'play') pause(); else if (st) persist(); } }

  /* ---------- Module ---------- */
  MG.register({
    id: 'melon', name: 'Milo Melon', logo: 'logo_melon.webp', theme: 'melon',
    mount(frame, a) {
      api = a; const d = api.data; d.stats = d.stats || {}; d.prefs = d.prefs || {}; d.v = 1;
      root = document.createElement('div'); root.className = 'ml-root'; root.dataset.state = 'menu';
      root.innerHTML = `<canvas class="ml-cv" aria-label="Milo Melon"></canvas>
        <div class="ml-top">
          <button class="gclose ml-gear" data-ml="settings" aria-label="Paramètres">${MG.icon('gear')}</button>
          <div class="ml-score"><b id="mlScore">0</b><span>${MG.icon('crown')}Record <em id="mlBest">0</em></span></div>
          <div class="ml-next"><div><img id="mlNext" alt="" draggable="false"></div><span>Suivant</span></div>
          <button class="gclose" data-ml="quit" aria-label="Quitter">${MG.icon('x')}</button>
        </div>
        <div class="ml-milo"><img id="mlMilo" src="assets/${FACE.idle}.webp" alt="Milo" draggable="false"><div class="ml-bub" id="mlBub"></div></div>
        <div class="ml-hint">Glisse pour viser · relâche pour lâcher</div>
        <div class="ml-bottom">
          <div class="ml-strip" id="mlStrip" data-ml="rules"></div>
          <div class="ml-btns"><button data-ml="restart">${MG.icon('redo')}<span>Recommencer</span></button><button data-ml="pause">${MG.icon('pause')}<span>Pause</span></button><button data-ml="rules">${MG.icon('help')}<span>Règles</span></button></div>
        </div>
        <div class="ml-menu"></div>`;
      frame.insertBefore(root, frame.firstChild);
      cv = root.querySelector('.ml-cv'); ctx = cv.getContext('2d');
      UI = { score: root.querySelector('#mlScore'), best: root.querySelector('#mlBest'), next: root.querySelector('#mlNext'), strip: root.querySelector('#mlStrip'), menu: root.querySelector('.ml-menu'), top: root.querySelector('.ml-top'), bottom: root.querySelector('.ml-bottom'), milo: root.querySelector('.ml-milo'), hint: root.querySelector('.ml-hint'), miloImg: root.querySelector('#mlMilo'), bub: root.querySelector('#mlBub') };
      loadImgs(); V.cw = V.ch = 0; L = {}; SPR = {};
      newGame(null); showMenu(); layout();
      try { ro = new ResizeObserver(() => { clearTimeout(rTimer); rTimer = setTimeout(layout, 80); }); ro.observe(root); } catch (e) { window.addEventListener('resize', layout); }
      root.addEventListener('pointerdown', onDown); root.addEventListener('pointermove', onMove); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', () => { if (st) st.aiming = false; });
      root.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVis);
      last = 0; raf = requestAnimationFrame(loop);
    },
    unmount() {
      cancelAnimationFrame(raf); clearTimeout(rTimer); clearTimeout(UI.faceT); clearTimeout(UI.bubT);
      try { ro && ro.disconnect(); } catch (e) {} ro = null; window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
      if (st && (st.state === 'play' || st.state === 'paused')) persist(); else api.save();
      root = null; cv = null; ctx = null; L = {}; SPR = {}; parts.length = 0; UI = {}; st = null;
    },
    card(d) {
      const s = d.stats || {}, T = TIERS(), mt = s.maxTier || 0;
      return { desc: 'Fais tomber les mascottes dans le bocal : deux identiques fusionnent en une plus grosse. Vise la pastèque géante !',
        art: `<img class="ml-cf a" src="${MG.asset(T[0].src)}" alt=""><img class="ml-cf b" src="${MG.asset(T[3].src)}" alt=""><img class="ml-cf c" src="${MG.asset(T[1].src)}" alt="">`,
        stats: [['Record', MG.fmt(d.best || 0), 'crown'], ['Parties', MG.fmt(s.games || 0), 'pad'], ['Fusions', MG.fmt(s.merges || 0), 'flame']],
        progress: (mt + 1) / T.length, progressLabel: `Plus grosse mascotte : ${T[mt].name} (${mt + 1} / ${T.length})`,
        cta: d.current && d.current.bodies && d.current.bodies.length ? `Reprendre la partie (${MG.fmt(d.current.score || 0)})` : d.best ? 'Battre mon record' : 'Jouer' };
    },
    homeLine(d) { return `Milo Melon record ${MG.fmt(d.best || 0)}`; },
    _debug: { state: () => st, drop: () => drop(), aim: (x) => { if (st) { st.aimX = x; st.dropX = x; } }, World, Merge, toScreen: (x, y) => toScreen(x, y), V, persist: () => persist() }
  });

  /* ---------- Styles ---------- */
  const css = `
  .gscreen.melon{background:radial-gradient(circle at 12% 10%,rgba(255,214,170,.85),transparent 40%),radial-gradient(circle at 90% 22%,rgba(255,190,214,.75),transparent 42%),radial-gradient(circle at 20% 92%,rgba(196,170,255,.7),transparent 45%),radial-gradient(circle at 85% 85%,rgba(170,232,200,.55),transparent 40%),linear-gradient(170deg,#fff1e6,#ffe8f1 45%,#f1e9ff)}
  .ml-root{position:absolute;inset:0;overflow:hidden;z-index:1;touch-action:none;-webkit-tap-highlight-color:transparent;color:#2a1f6b}
  .ml-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
  .ml-root .gclose{background:rgba(255,255,255,.82);color:#7a3fd8;box-shadow:0 4px 12px rgba(150,70,140,.16)}
  .ml-top{position:absolute;left:0;right:0;top:0;z-index:6;display:flex;align-items:center;gap:8px;padding:12px 14px 4px}
  .ml-gear .gi{width:20px;height:20px}
  .ml-score{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;line-height:1}
  .ml-score b{font-size:34px;font-weight:900;letter-spacing:-.8px;color:#5b2fd0;font-variant-numeric:tabular-nums;text-shadow:0 2px 0 rgba(255,255,255,.9)}
  .ml-score b.bump{animation:mlbump .3s cubic-bezier(.34,1.7,.5,1)}
  @keyframes mlbump{40%{transform:scale(1.18)}}
  .ml-score span{display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:12px;font-weight:800;color:#8a6aa8}
  .ml-score span .gi{width:13px;height:13px;fill:#ffcf3a;stroke:#e19c00}.ml-score em{font-style:normal;color:#5b2fd0;font-weight:900;font-variant-numeric:tabular-nums}
  .ml-next{display:flex;flex-direction:column;align-items:center;gap:2px}
  .ml-next div{width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:inset 0 0 0 2px rgba(255,255,255,.9),0 4px 12px rgba(150,70,140,.16);display:grid;place-items:center}
  .ml-next img{width:34px;height:34px;object-fit:contain}
  .ml-next span{font-size:10.5px;font-weight:900;color:#8a6aa8;letter-spacing:.3px}
  .ml-milo{position:absolute;z-index:5;width:66px;height:66px;pointer-events:none}
  .ml-milo{transition:opacity .2s}.ml-milo.dim{opacity:.25}
  .ml-milo img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 6px 8px rgba(120,60,150,.25));transform-origin:50% 100%;animation:mlmilo 3.4s ease-in-out infinite}
  .ml-milo img.hop{animation:mlhop .45s cubic-bezier(.34,1.7,.5,1),mlmilo 3.4s .45s ease-in-out infinite}
  @keyframes mlmilo{50%{transform:translateY(-3px) rotate(-2deg)}}
  @keyframes mlhop{0%{transform:scale(.8,1.15)}50%{transform:translateY(-10px) scale(1.05,.95)}100%{transform:none}}
  .ml-bub{position:absolute;left:68px;top:4px;padding:7px 12px;border-radius:16px 16px 16px 4px;background:#fff;color:#5b2fd0;font-size:13.5px;font-weight:900;white-space:nowrap;box-shadow:0 6px 16px rgba(120,60,150,.18);opacity:0;transform:scale(.6) translateY(6px);transform-origin:0 100%;transition:opacity .18s,transform .25s cubic-bezier(.34,1.7,.5,1)}
  .ml-bub.show{opacity:1;transform:none}
  .ml-bub.gold{background:linear-gradient(160deg,#fff6c9,#ffe07a);color:#8a4b00}.ml-bub.warn{background:#fff1e6;color:#c2410c}
  .ml-bub.fire{background:linear-gradient(135deg,#ff9a4d,#ff4f8b);color:#fff}.ml-bub.pop{background:linear-gradient(135deg,#8f6bff,#ff7eb3);color:#fff}
  .ml-hint{position:absolute;left:50%;top:45%;transform:translateX(-50%);z-index:4;display:none;padding:7px 13px;border-radius:18px;background:rgba(255,255,255,.88);color:#7a3fd8;font-weight:800;font-size:13px;white-space:nowrap;box-shadow:0 4px 12px rgba(150,70,140,.14);pointer-events:none}
  .ml-root[data-state=play]:not(.moved) .ml-hint{display:block;animation:mlhint 1.5s ease-in-out infinite}
  @keyframes mlhint{50%{opacity:.6}}
  .ml-bottom{position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 14px max(12px,env(safe-area-inset-bottom,0px))}
  .ml-strip{display:flex;gap:2px;padding:5px 8px;border-radius:24px;background:rgba(255,255,255,.7);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.9),0 4px 14px rgba(150,70,140,.12);cursor:pointer;max-width:100%}
  .ml-strip i{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex:none;background:rgba(160,120,200,.14);transition:transform .25s}
  .ml-strip i img{width:22px;height:22px;object-fit:contain}
  .ml-strip i b{font-size:11px;font-weight:900;color:rgba(130,90,180,.55)}
  .ml-strip i.cur{background:#fff;box-shadow:0 0 0 2px #ffcf3a;transform:scale(1.18)}
  .ml-strip i.new{animation:mlnew .7s cubic-bezier(.34,1.7,.5,1) 2}
  @keyframes mlnew{50%{transform:scale(1.5)}}
  .ml-btns{display:flex;gap:8px;width:min(100%,400px)}
  .ml-btns button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:18px;padding:10px 6px;background:rgba(255,255,255,.85);color:#6a35d6;font-weight:900;font-size:13px;box-shadow:0 4px 12px rgba(150,70,140,.12)}
  .ml-btns button .gi{width:17px;height:17px}.ml-btns button:active{transform:scale(.96)}
  .ml-root[data-state=menu] .ml-top,.ml-root[data-state=menu] .ml-bottom,.ml-root[data-state=menu] .ml-milo{visibility:hidden}
  .ml-menu{position:absolute;inset:0;z-index:8;display:none;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:14px 16px max(16px,env(safe-area-inset-bottom,0px));background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.7),transparent 45%),linear-gradient(170deg,rgba(255,241,230,.94),rgba(255,232,241,.94) 45%,rgba(241,233,255,.96))}
  .ml-menu.show{display:flex;animation:fade .25s}
  .ml-mtop{position:absolute;left:0;right:0;top:0;display:flex;gap:8px;padding:12px 14px}
  .ml-logo{width:min(64%,250px);height:auto;filter:drop-shadow(0 14px 22px rgba(120,60,150,.28));animation:mllogo 3.2s ease-in-out infinite;margin-bottom:-14px;position:relative;z-index:1}
  @keyframes mllogo{50%{transform:translateY(-6px) rotate(-1deg)}}
  .ml-card{position:relative;width:min(100%,380px);border-radius:28px;background:#fff;padding:24px 16px 14px;box-shadow:0 20px 46px rgba(120,60,150,.2);animation:gpop .5s .06s cubic-bezier(.34,1.6,.5,1) both}
  .ml-cmilo{position:absolute;left:-10px;top:-50px;width:74px;height:74px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(120,60,150,.25));animation:mlmilo 3s ease-in-out infinite}
  .ml-stats,.ml-sc{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
  .ml-sc{grid-template-columns:1fr 1fr;margin:10px 0}
  .ml-stats div,.ml-sc div{background:#fbf5ff;border-radius:16px;padding:8px 6px;text-align:center}
  .ml-sc div.hot{background:linear-gradient(160deg,#fff6cf,#ffe7a0)}
  .ml-stats span,.ml-sc span{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:800;color:var(--muted)}
  .ml-stats span .gi,.ml-sc span .gi{width:12px;height:12px;fill:#ffcf3a;stroke:#e19c00}
  .ml-stats b{display:block;font-size:20px;font-weight:900;color:#5b2fd0}.ml-sc b{display:block;font-size:28px;font-weight:900;color:#5b2fd0;font-variant-numeric:tabular-nums}
  .ml-maxm{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:18px;background:linear-gradient(120deg,#fff6ec,#fdeffa);margin-bottom:12px;text-align:left}
  .ml-maxm img{width:42px;height:42px;object-fit:contain;flex:none}
  .ml-maxm span{display:flex;flex-direction:column;font-size:11.5px;font-weight:800;color:var(--muted)}.ml-maxm span b{font-size:16px;color:#2a1f6b}
  .ml-maxm em{margin-left:auto;font-style:normal;font-weight:900;color:#c2410c;font-size:13px;white-space:nowrap}
  .ml-macts{display:flex;flex-direction:column;gap:10px}
  .ml-link{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:10px;border:0;background:none;color:#7a3fd8;font-weight:900;font-size:14px;padding:6px}
  .ml-link .gi{width:17px;height:17px}
  .ml-modal .gpanel{max-height:calc(100% - 20px);overflow:auto}
  .ml-modal .acts{gap:8px}
  .ml-over .mas{width:116px;height:116px}
  .ml-rules{list-style:none;margin:10px 0 12px;padding:0;display:flex;flex-direction:column;gap:8px;text-align:left}
  .ml-rules li{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;font-weight:700;color:#3a2f74;line-height:1.35}
  .ml-rules li b{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#ff9a4d,#ff4f8b);color:#fff;font-size:12px}
  .ml-evo{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:4px}
  .ml-evo span{display:flex;flex-direction:column;align-items:center;gap:1px}.ml-evo img{width:34px;height:34px;object-fit:contain}
  .ml-evo small{font-size:9.5px;font-weight:800;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .ml-evo .lk img{filter:grayscale(1) brightness(1.4) opacity(.35)}
  .ml-tgs{display:flex;flex-direction:column;gap:8px;margin:12px 0 14px}
  .ml-tg{display:flex;align-items:center;justify-content:space-between;border:0;border-radius:16px;padding:12px 14px;background:#fbf5ff;font-weight:900;font-size:15px;color:#2a1f6b}
  .ml-tg i{width:44px;height:26px;border-radius:13px;background:#d9d0ec;position:relative;transition:background .2s}
  .ml-tg i:after{content:"";position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.18);transition:transform .2s}
  .ml-tg.on i{background:linear-gradient(135deg,#9d66f7,#ff7eb3)}.ml-tg.on i:after{transform:translateX(18px)}
  .gcard.melon .gcard-art{background:radial-gradient(circle at 20% 20%,#ffd9b8,transparent 50%),radial-gradient(circle at 85% 80%,#e6d6ff,transparent 55%),linear-gradient(160deg,#fff0e4,#ffe6f2 55%,#efe6ff)}
  .gcard.melon .gcard-art img{position:relative;z-index:1}
  .gcard.melon .gcard-art img.ml-cf{position:absolute;z-index:2;height:auto;max-width:none;filter:drop-shadow(0 6px 8px rgba(120,60,150,.25))}
  .ml-cf.a{width:52px;left:6%;bottom:22px;animation:mlcf 2.6s ease-in-out infinite}
  .ml-cf.b{width:70px;left:15%;top:18px;animation:mlcf 3s .4s ease-in-out infinite}
  .ml-cf.c{width:44px;right:6%;bottom:26px;animation:mlcf 2.4s .8s ease-in-out infinite}
  @keyframes mlcf{50%{transform:translateY(-8px) rotate(8deg)}}
  @media (prefers-reduced-motion:reduce){.ml-logo,.ml-milo img,.ml-cf,.ml-cmilo{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
