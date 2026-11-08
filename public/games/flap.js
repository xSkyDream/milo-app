/* =====================================================================
   Milo Flap — tapote pour faire voler Milo entre les poteaux
   Module isolé : s'enregistre dans MiloGames, ne dépend que du hub.
   Rendu canvas 60 FPS : décor pré-rendu (parallaxe), physique sous-échantillonnée,
   aucune allocation DOM pendant la partie (seul le score est mis à jour).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames; if (!MG) return;

  /* ---------- Sprites de Milo volant (remplaçables) ----------
     Pour remplacer un visuel : dépose le PNG/WebP définitif dans assets/games/flap/
     et mets à jour « src ». ax / ay = centre du corps dans l'image (fraction 0..1),
     utilisé comme pivot et centre de collision. scale = correction de taille
     si l'image n'a pas la même résolution que « vol » (1 = identique). */
  const SPRITES = {
    vol:      { src: 'flap/vol.webp',      ax: 0.610, ay: 0.583 }, // vol normal
    haut:     { src: 'flap/haut.webp',     ax: 0.590, ay: 0.607 }, // battement : ailes levées
    bas:      { src: 'flap/bas.webp',      ax: 0.575, ay: 0.592 }, // battement : ailes baissées
    accel:    { src: 'flap/accel.webp',    ax: 0.804, ay: 0.609 }, // accélération
    surpris:  { src: 'flap/surpris.webp',  ax: 0.606, ay: 0.628 }, // obstacle tout proche
    heureux:  { src: 'flap/heureux.webp',  ax: 0.583, ay: 0.593 }, // passage réussi
    etourdi:  { src: 'flap/etourdi.webp',  ax: 0.591, ay: 0.603 }, // collision
    decu:     { src: 'flap/decu.webp',     ax: 0.621, ay: 0.586 }, // fin de partie
    victoire: { src: 'flap/victoire.webp', ax: 0.541, ay: 0.486 }  // record personnel
  };

  /* ---------- Réglages du monde (unités logiques : hauteur = 720) ---------- */
  const H = 720, GROUND_H = 96, GY = H - GROUND_H;
  const PHYS = { g: 1450, flap: -430, maxFall: 620 };
  const MW = 74, MR = 16.5;                       // largeur dessinée de Milo (« vol »), rayon de collision
  const PW = 68, CAP = 26, CO = 5;                // poteau : largeur, hauteur du chapeau, débord du chapeau
  const BAND_H = 14, CAPH = CAP + 6 + BAND_H + 7; // chapeau + pansement
  const PIPE_BODY = [[0, '#2a7a1f'], [0.06, '#46a72b'], [0.2, '#6fcd45'], [0.32, '#b3ef86'], [0.4, '#d6fab4'], [0.5, '#88dd59'], [0.78, '#5abd35'], [0.94, '#3d9828'], [1, '#28731d']];
  const PIPE_RIM = [[0, '#2f8423'], [0.05, '#55b934'], [0.2, '#80dc52'], [0.32, '#c2f69a'], [0.4, '#e4ffc8'], [0.52, '#98e766'], [0.8, '#64c63c'], [0.95, '#46a32e'], [1, '#2f7f22']];
  const MEDALS = [
    { at: 10, id: 'bronze', name: 'bronze', label: 'Médaille de bronze', c1: '#f6bd8a', c2: '#c06a2c' },
    { at: 25, id: 'argent', name: 'argent', label: "Médaille d'argent", c1: '#f4f7ff', c2: '#93a0bd' },
    { at: 50, id: 'or', name: 'or', label: "Médaille d'or", c1: '#ffe680', c2: '#e09c0c' },
    { at: 100, id: 'diamant', name: 'diamant', label: 'Médaille de diamant', c1: '#d4f7ff', c2: '#3fb2ee' }
  ];
  const SKIES = [ // jour, coucher de soleil, nuit (alternent tous les 25 passages)
    { stops: [[0, '#74a9ff'], [0.48, '#a7c5ff'], [0.8, '#d0c6ff'], [1, '#ece4ff']], glow: [0.84, 0.1, 'rgba(255,255,255,.8)', 0.3], disc: '#fffdf4', tint: null },
    { stops: [[0, '#7a6be6'], [0.42, '#c393ee'], [0.72, '#ffaec6'], [1, '#ffd8bd']], glow: [0.72, 0.62, 'rgba(255,214,150,.9)', 0.36], disc: '#fff1c9', tint: [255, 140, 170, 0.12] },
    { stops: [[0, '#2a2266'], [0.5, '#45368f'], [0.85, '#7058c4'], [1, '#9278da']], glow: [0.8, 0.13, 'rgba(225,220,255,.55)', 0.14], disc: '#f6f2ff', moon: 1, stars: 1, tint: [28, 20, 92, 0.36] }
  ];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (x) => { x = clamp(x, 0, 1); return x * (2 - x); };
  const speedAt = (s) => 152 + 74 * ease(s / 70);
  function diff(n) { // n = numéro du poteau
    return { gap: 182 - 44 * ease(n / 55), spacing: 236 - 24 * ease(n / 60), jump: 110 + 190 * ease(n / 35), moving: n < 14 ? 0 : 0.2 + 0.3 * ease((n - 14) / 50) };
  }
  const medalFor = (s) => { let m = null; MEDALS.forEach((x) => { if (s >= x.at) m = x; }); return m; };
  const nextMedal = (s) => MEDALS.find((x) => s < x.at) || null;

  const ICO = {
    pause: '<rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/>',
    tap: '<path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1"/><path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
  };
  const svg = (n, cls) => `<svg class="gi ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICO[n]}</svg>`;

  /* ---------- État ---------- */
  let api = null, root = null, cv = null, ctx = null, ro = null, raf = 0, last = 0, rng = Math.random, deco = Math.random, rTimer = 0;
  const IMG = {};
  const V = { cw: 0, ch: 0, dpr: 1, s: 1, K: 1, ww: 360, kPx: MW / 271 };
  let L = {}, st = null, UI = {};
  const parts = [];
  const M = { x: 108, y: 338, vy: 0, rot: 0, q: 0, qv: 0, flapAt: -9, expr: null, exprUntil: 0, exprPri: 0 };

  function loadImgs() {
    Object.keys(SPRITES).forEach((k) => {
      if (IMG[k]) return;
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { im.ok = true; if (k === 'vol') V.kPx = MW / im.naturalWidth; };
      im.src = MG.asset(SPRITES[k].src); IMG[k] = im;
    });
  }

  /* ---------- Partie ---------- */
  function newRun(replay) {
    st = { state: 'ready', t: 0, wt: 0, scroll: 0, score: 0, pipes: [], nPipe: 0, lastCy: H * 0.48, prevBest: api.data.best || 0,
      flash: 0, shake: 0, pFrom: 0, pTo: 0, pK: 1, warnAt: -99, msgAt: -99, msgKind: '', trailAt: 0, sparkAt: 0, flaps: 0,
      started: false, finished: false, dirty: false, saveAt: 0, movingSeen: false, idle: 0, res: null };
    M.y = H * 0.47; M.vy = 0; M.rot = 0; M.q = 0; M.qv = 0; M.flapAt = -9; M.expr = null; M.exprUntil = 0; M.exprPri = 0;
    parts.length = 0;
    rng = MG.rng((Date.now() ^ Math.floor(Math.random() * 4294967295)) >>> 0);
    root.classList.toggle('replay', !!replay);
    setState('ready'); updScore(false); updBest();
  }
  function setState(s) { st.state = s; if (root) root.dataset.state = s; }

  function tap() {
    if (!st) return;
    if (st.state === 'ready') { st.started = true; st.wt = 0; setState('play'); flap(); }
    else if (st.state === 'play') flap();
    else if (st.state === 'paused') resume();
  }
  function flap() {
    M.vy = PHYS.flap; M.flapAt = st.t; M.qv += 2.3; st.flaps++;
    for (let i = 0; i < 3; i++) addP('puff', M.x - 16 + Math.random() * 6, M.y + 12 + Math.random() * 6, -60 - Math.random() * 50, 30 + Math.random() * 60, 0.34, 9 + Math.random() * 6, 0);
  }
  function pause() { if (!st || st.state !== 'play') return; setState('paused'); flushSave(); }
  function resume() { if (!st || st.state !== 'paused') return; setState('play'); last = 0; flap(); }

  function spawnPipe(x) {
    const n = st.nPipe++, d = diff(n), minC = 64 + d.gap / 2, maxC = GY - 56 - d.gap / 2;
    let cy;
    if (n === 0) cy = clamp(M.y + 10, minC, maxC);
    else { const lo = Math.max(minC, st.lastCy - d.jump), hi = Math.min(maxC, st.lastCy + d.jump); cy = lo + rng() * (hi - lo); }
    let amp = 0, freq = 0, ph = 0;
    if (d.moving && rng() < d.moving) { amp = 16 + rng() * 26; freq = 1.5 + rng() * 1.3; ph = rng() * 6.283; cy = clamp(cy, minC + amp, maxC - amp); }
    const p = { x, cy, c: cy, gap: d.gap + (amp ? 10 : 0), amp, freq, ph, n, passed: false, gold: st.prevBest > 0 && n === st.prevBest, warn: false, warned: false,
      next: d.spacing * (n < 4 ? 1 : 1 + (rng() - 0.5) * 0.26) };
    if (amp && !st.movingSeen) { st.movingSeen = true; p.warn = true; }
    else if (n > 6 && Math.abs(cy - st.lastCy) > Math.max(150, 0.75 * d.jump)) p.warn = true;
    st.lastCy = cy; st.pipes.push(p);
  }

  function setExpr(n, dur, pri) { if (st.t < M.exprUntil && pri < M.exprPri) return; M.expr = n; M.exprUntil = st.t + dur; M.exprPri = pri; }
  function msg(text, kind) {
    if (st.t - st.msgAt < 1.15 && st.msgKind === 'gold' && kind !== 'gold') return;
    st.msgAt = st.t; st.msgKind = kind || '';
    const el = UI.msg; el.textContent = text; el.className = 'fl-msg ' + (kind || ''); void el.offsetWidth; el.classList.add('show');
  }
  function celebrate(big) {
    try { const [x, y] = api.fx.at(UI.score); api.fx.burst(x, y + 10, ['#ffd84d', '#ffffff', '#b48cff', '#7cc4ff'], big ? 26 : 16, { shape: 'star', speed: 5, size: 10 }); api.fx.ring(x, y + 10, '#ffffff', 4); if (big) api.fx.confetti(70); } catch (e) {}
  }

  function onPass(p) {
    st.score++; updScore(true);
    const s = st.score, sp = speedAt(s);
    for (let i = 0; i < 6; i++) addP(i % 2 ? 'spark' : 'gold', p.x + PW / 2 + (Math.random() - 0.5) * 20, p.c + (Math.random() - 0.5) * p.gap * 0.6, -sp * 0.3 + (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 70, 0.55, 9 + Math.random() * 7, 0);
    setExpr('heureux', 0.5, 1);
    if (st.prevBest > 0 && s === st.prevBest + 1) { msg('Nouveau record !', 'gold'); setExpr('victoire', 1.0, 4); try { api.fx.confetti(70); } catch (e) {} }
    else if (s % 25 === 0) { msg('Incroyable, tu voles !'); celebrate(true); }
    else if (s % 10 === 0) { msg('Continue comme ça !'); celebrate(false); }
    else if (s === 5 || (s === 1 && !(api.data.stats.games || 0))) msg('Bien joué !');
    if (s % 10 === 0) accelerate();
    if (s > (api.data.best || 0)) { api.data.best = s; api.data.bestAt = new Date().toISOString(); st.dirty = true; updBest(); }
    const ph = Math.floor(s / 25) % 3; if (ph !== st.pTo) { st.pFrom = st.pTo; st.pTo = ph; st.pK = 0; }
  }
  function accelerate() {
    setExpr('accel', 0.85, 3); M.qv += 2.6;
    for (let i = 0; i < 10; i++) addP('line', M.x + 20 + Math.random() * 120, M.y + (Math.random() - 0.5) * 70, -speedAt(st.score) * 2.6 - 220, 0, 0.36, 26 + Math.random() * 36, 0);
  }

  function die(kind, ix, iy) {
    if (st.state !== 'play') return;
    setState('dying'); st.flash = 1; st.shake = MG.reduced() ? 0 : 1;
    M.vy = kind === 'pipe' ? -170 : kind === 'ceil' ? 60 : 0; M.qv -= 3;
    for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, v = 140 + Math.random() * 200; addP(i % 3 ? 'gold' : 'spark', ix, iy, Math.cos(a) * v, Math.sin(a) * v - 60, 0.7, 10 + Math.random() * 8, 600); }
    try { navigator.vibrate && navigator.vibrate(35); } catch (e) {}
    finishRun();
  }
  function land() {
    setState('over'); M.vy = 0; M.q = -0.2; M.qv = 0; st.shake = Math.max(st.shake, MG.reduced() ? 0 : 0.35);
    for (let i = 0; i < 6; i++) addP('puff', M.x + (Math.random() - 0.5) * 40, GY - 6, (Math.random() - 0.5) * 120, -30 - Math.random() * 50, 0.5, 12 + Math.random() * 8, 0);
    setTimeout(() => { if (root && st && st.state === 'over' && !root.querySelector('.fl-over')) showOver(); }, 520);
  }

  function finishRun() {
    if (!st || st.finished || !st.started) return st && st.res;
    st.finished = true;
    const d = api.data, s = d.stats || (d.stats = {}), sc = st.score, now = new Date().toISOString();
    s.games = (s.games || 0) + 1; s.passes = (s.passes || 0) + sc; s.flaps = (s.flaps || 0) + st.flaps; s.time = Math.round((s.time || 0) + st.wt);
    const med = medalFor(sc); if (med) { s.medals = s.medals || {}; s.medals[med.id] = (s.medals[med.id] || 0) + 1; }
    if (sc > (d.best || 0)) { d.best = sc; d.bestAt = now; }
    d.last = sc; d.lastPlayed = now; d.history = [{ s: sc, at: now }].concat(d.history || []).slice(0, 30);
    api.save(); st.dirty = false;
    return (st.res = { record: sc > st.prevBest && sc > 0, prev: st.prevBest });
  }
  function flushSave() { if (st && st.dirty) { api.save(); st.dirty = false; } }

  /* ---------- Particules (dans le monde, pré-rendues) ---------- */
  function addP(type, x, y, vx, vy, life, size, g) {
    if (parts.length > 220) return;
    if (MG.reduced() && type !== 'line' && Math.random() < 0.6) return;
    parts.push({ type, x, y, vx, vy, life, max: life, size, g: g || 0, rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 6 });
  }

  /* ---------- Boucle ---------- */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = last ? (now - last) / 1000 : 0; last = now;
    if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
    if (!st || !L.ready || st.state === 'paused') return;
    if (st.state === 'over' && !parts.length && st.flash <= 0 && st.shake <= 0 && M.q * M.q + M.qv * M.qv < 1e-5) { if (++st.idle > 2) return; } else st.idle = 0;
    update(dt); draw();
  }

  function update(dt) {
    st.t += dt;
    const S = st.state, sp = speedAt(st.score);
    if (st.pK < 1) st.pK = Math.min(1, st.pK + dt / 2.5);
    if (S === 'ready') {
      st.scroll += sp * 0.8 * dt;
      M.y = H * 0.47 + Math.sin(st.t * 2.6) * 9; M.rot = Math.sin(st.t * 2.6 + 1.2) * 0.07;
    } else if (S === 'play') {
      st.wt += dt; st.scroll += sp * dt;
      const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
      for (let i = 0; i < n; i++) { M.vy = Math.min(PHYS.maxFall, M.vy + PHYS.g * h); M.y += M.vy * h; }
      // poteaux
      const ps = st.pipes;
      for (let i = 0; i < ps.length; i++) { const p = ps[i]; p.x -= sp * dt; p.c = p.amp ? p.cy + p.amp * Math.sin(p.ph + st.wt * p.freq) : p.cy; }
      while (ps.length && ps[0].x + PW + CO < -20) ps.shift();
      const lp = ps[ps.length - 1];
      if (!lp) spawnPipe(V.ww + 60); else if (lp.x + lp.next < V.ww + 90) spawnPipe(lp.x + lp.next);
      let next = null;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (!p.passed && p.x + PW / 2 < M.x) { p.passed = true; onPass(p); }
        if (!next && p.x + PW + CO > M.x - MR) next = p;
        if (p.warn && !p.warned && p.x < V.ww - 6) { p.warned = true; if (st.t - st.warnAt > 4) { st.warnAt = st.t; msg('Attention devant !', 'warn'); setExpr('surpris', 0.6, 2); } }
        if (p.gold && p.x < V.ww && st.t - st.sparkAt > 0.12) { st.sparkAt = st.t; addP('gold', p.x + Math.random() * PW, p.c + (Math.random() < 0.5 ? -1 : 1) * (p.gap / 2 + 4), -sp * 0.2, (Math.random() - 0.5) * 30, 0.6, 8 + Math.random() * 6, 0); }
      }
      // collisions
      if (st.state === 'play' && next) {
        const top = next.c - next.gap / 2, bot = next.c + next.gap / 2;
        if (circRect(next.x, -400, next.x + PW, top - CAP) || circRect(next.x - CO, top - CAP, next.x + PW + CO, top) || circRect(next.x - CO, bot, next.x + PW + CO, bot + CAP) || circRect(next.x, bot + CAP, next.x + PW, GY + 60)) {
          die('pipe', clamp(M.x, next.x - CO, next.x + PW + CO), clamp(M.y, top, bot)); }
        else {
          const dx = next.x - CO - M.x;
          if (dx > -PW && dx < 92 && (M.y - MR < top + 9 || M.y + MR > bot - 9)) setExpr('surpris', 0.3, 2);
        }
      }
      if (st.state === 'play' && M.y + MR > GY - 3) { die('ground', M.x, GY - 4); }
      if (st.state === 'play' && M.y < -14) die('ceil', M.x, 4);
      // traînée
      if (st.state === 'play' && st.t - st.trailAt > 0.06) { st.trailAt = st.t; addP(Math.random() < 0.5 ? 'spark' : 'sparkL', M.x - 24 - Math.random() * 6, M.y + 4 + (Math.random() - 0.5) * 14, -sp * 0.55 - 20, (Math.random() - 0.5) * 16, 0.5, 6 + Math.random() * 5, 0); }
      const tr = clamp(M.vy / 600, -0.45, 1.15); M.rot += (tr - M.rot) * Math.min(1, dt * (M.vy < 0 ? 18 : 7));
      if (st.dirty && st.t - st.saveAt > 3) { st.saveAt = st.t; flushSave(); }
    } else if (S === 'dying') {
      M.vy = Math.min(PHYS.maxFall * 1.25, M.vy + PHYS.g * dt); M.y += M.vy * dt;
      M.rot += (1.45 - M.rot) * Math.min(1, dt * 7);
      if (M.y + MR * 0.9 >= GY + 2) { M.y = GY + 2 - MR * 0.9; land(); }
    }
    // ressort d'étirement
    M.qv += (-260 * M.q - 15 * M.qv) * dt; M.q += M.qv * dt;
    if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 2.6);
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 3.4);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  function circRect(x0, y0, x1, y1) { const nx = clamp(M.x, x0, x1), ny = clamp(M.y, y0, y1), dx = M.x - nx, dy = M.y - ny; return dx * dx + dy * dy < MR * MR; }

  /* ---------- Rendu ---------- */
  function phaseW(i) { return (st.pTo === i ? st.pK : 0) + (st.pFrom === i && st.pFrom !== st.pTo ? 1 - st.pK : 0); }
  function tile(cnv, off, yU, ox, oy, a) {
    const w = cnv.width; let x = Math.round(-((off * V.K) % w) + ox); const y = Math.round(yU * V.K + oy);
    if (a != null) ctx.globalAlpha = a;
    for (; x < cv.width; x += w) ctx.drawImage(cnv, x, y);
    ctx.globalAlpha = 1;
  }
  function tint(k, y0) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < 3; i++) { const t = SKIES[i].tint, w = phaseW(i); if (!t || !w) continue; r += t[0] * w; g += t[1] * w; b += t[2] * w; a += t[3] * w; }
    if (a < 0.005) return;
    const w = phaseW(1) + phaseW(2); ctx.fillStyle = `rgba(${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)},${(a * k).toFixed(3)})`;
    ctx.fillRect(0, y0 || 0, cv.width, cv.height);
  }
  function draw() {
    const K = V.K, c = ctx;
    let ox = 0, oy = 0;
    if (st.shake > 0) { const a = st.shake * st.shake * 7 * K; ox = (Math.random() * 2 - 1) * a; oy = (Math.random() * 2 - 1) * a; }
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    // ciel (fondu entre les phases)
    c.drawImage(L.sky[st.pTo], 0, 0, cv.width, cv.height);
    if (st.pK < 1 && st.pFrom !== st.pTo) { c.globalAlpha = 1 - st.pK; c.drawImage(L.sky[st.pFrom], 0, 0, cv.width, cv.height); c.globalAlpha = 1; }
    const night = phaseW(2);
    tile(L.far, st.scroll * 0.06, 70, ox * 0.3, oy * 0.3, 0.92);
    tile(L.city, st.scroll * 0.18, GY - 178, ox * 0.6, oy * 0.6);
    tint(0.9);
    if (night > 0.01) tile(L.lit, st.scroll * 0.18, GY - 178, ox * 0.6, oy * 0.6, night);
    tile(L.bank, st.scroll * 0.42, GY - 84, ox * 0.8, oy * 0.8);
    tint(0.5, Math.round((GY - 84) * K));
    // poteaux
    for (let i = 0; i < st.pipes.length; i++) drawPipe(st.pipes[i], ox, oy);
    // sol nuageux
    tile(L.ground, st.scroll, GY - 18, ox, oy);
    tint(0.45);
    // Milo
    c.setTransform(K, 0, 0, K, ox, oy);
    if (night > 0.05) { c.globalAlpha = night * 0.55; c.drawImage(L.pt.glow, M.x - 60, M.y - 52, 120, 104); c.globalAlpha = 1; }
    drawMilo(ox, oy);
    // particules
    c.setTransform(K, 0, 0, K, ox, oy);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], k = p.life / p.max;
      if (p.type === 'line') { c.globalAlpha = k * 0.75; c.strokeStyle = '#ffffff'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + p.size, p.y); c.stroke(); continue; }
      const img = L.pt[p.type]; if (!img) continue;
      const s = p.type === 'puff' ? p.size * (1 + (1 - k) * 0.9) : p.size * (0.4 + 0.6 * k);
      c.globalAlpha = p.type === 'puff' ? k * 0.75 : Math.min(1, k * 1.6);
      if (p.type === 'gold') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.drawImage(img, -s / 2, -s / 2, s, s); c.restore(); }
      else c.drawImage(img, p.x - s / 2, p.y - s / 2, s, s);
    }
    c.globalAlpha = 1;
    if (st.flash > 0) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = `rgba(255,255,255,${(st.flash * 0.7).toFixed(3)})`; c.fillRect(0, 0, cv.width, cv.height); }
  }
  function drawPipe(p, ox, oy) {
    const K = V.K, bw = L.body.width, bh = L.body.height;
    const x0 = Math.round((p.x - CO) * K + ox), xb = Math.round(p.x * K + ox);
    if (x0 > cv.width || x0 + L.capUp.width < 0) return;
    const top = p.c - p.gap / 2, bot = p.c + p.gap / 2;
    const tcy = Math.round((top - CAPH) * K + oy);
    if (tcy > -20) ctx.drawImage(L.body, 0, 0, bw, bh, xb, -30, bw, tcy + 31);
    ctx.drawImage(p.gold ? L.capDownG : L.capDown, x0, tcy);
    const bcy = Math.round(bot * K + oy), bb = bcy + L.capUp.height - 1, gy = Math.round((GY + 12) * K + oy);
    ctx.drawImage(p.gold ? L.capUpG : L.capUp, x0, bcy);
    if (gy > bb) ctx.drawImage(L.body, 0, 0, bw, bh, xb, bb, bw, gy - bb);
  }
  function spriteName() {
    const S = st.state, t = st.t;
    if (S === 'dying' || S === 'over') return 'etourdi';
    if (S === 'ready') { const ph = (t * 2.6) % 1; return ph < 0.2 ? 'haut' : ph < 0.48 ? 'bas' : 'vol'; }
    const f = t - M.flapAt;
    if (f < 0.07) return 'haut';
    if (f < 0.17) return 'bas';
    if (M.expr && t < M.exprUntil) return M.expr;
    return 'vol';
  }
  function drawMilo(ox, oy) {
    let n = spriteName(); if (!IMG[n] || !IMG[n].ok) n = 'vol';
    const img = IMG[n]; if (!img || !img.ok) return;
    const sp = SPRITES[n], k = V.kPx * (sp.scale || 1), w = img.naturalWidth * k, h = img.naturalHeight * k;
    const fall = st.state === 'play' ? clamp(M.vy / 7000, 0, 0.05) : 0;
    const sy = 1 + M.q + fall, sx = 1 - M.q * 0.55 - fall * 0.5;
    ctx.setTransform(V.K, 0, 0, V.K, ox + M.x * V.K, oy + M.y * V.K);
    ctx.rotate(M.rot); ctx.scale(sx, sy);
    ctx.drawImage(img, -sp.ax * w, -sp.ay * h, w, h);
  }

  /* ---------- Pré-rendu du décor (à chaque redimensionnement) ---------- */
  function mk(wu, hu) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(wu * V.K)); c.height = Math.max(1, Math.round(hu * V.K));
    const x = c.getContext('2d'); x.scale(c.width / wu, c.height / hu); return [c, x];
  }
  function rr(x, a, b, w, h, r, keep) { r = Math.min(r, w / 2, h / 2); if (!keep) x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function grad(x, x0, x1, stops) { const g = x.createLinearGradient(x0, 0, x1, 0); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
  function vgrad(x, y0, y1, stops) { const g = x.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
  function cross(x, cx, cy, L_, T, col) { x.fillStyle = col; rr(x, cx - L_ / 2, cy - T / 2, L_, T, T * 0.3); x.fill(); rr(x, cx - T / 2, cy - L_ / 2, T, L_, T * 0.3); x.fill(); }
  function star5(x, cx, cy, R, r) { x.beginPath(); for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.5708, b = a + 0.6283; x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r); } x.closePath(); }

  function mkSky(def) {
    const w = Math.max(2, Math.round(cv.width / 2)), h = Math.max(2, Math.round(cv.height / 2));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = vgrad(x, 0, h, def.stops); x.fillRect(0, 0, w, h);
    const [gx, gy, col, gr] = def.glow, R = gr * h, rg = x.createRadialGradient(gx * w, gy * h, 0, gx * w, gy * h, R);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = rg; x.fillRect(0, 0, w, h);
    if (def.stars) {
      const R2 = MG.rng(7);
      for (let i = 0; i < 90; i++) { const sx = R2() * w, sy = R2() * h * 0.66, r = (0.4 + R2() * 0.9) * (h / 420); x.globalAlpha = 0.45 + R2() * 0.55; x.fillStyle = '#fff'; x.beginPath(); x.arc(sx, sy, r, 0, 7); x.fill();
        if (R2() < 0.12) { x.globalAlpha = 0.5; x.fillRect(sx - r * 4, sy - r * 0.3, r * 8, r * 0.6); x.fillRect(sx - r * 0.3, sy - r * 4, r * 0.6, r * 8); } }
      x.globalAlpha = 1;
    }
    const dr = h * (def.moon ? 0.034 : 0.04), dx = gx * w, dy = gy * h;
    const d = document.createElement('canvas'); d.width = d.height = Math.ceil(dr * 2 + 4); const dc = d.getContext('2d');
    dc.fillStyle = def.disc; dc.beginPath(); dc.arc(dr + 2, dr + 2, dr, 0, 7); dc.fill();
    if (def.moon) { dc.globalCompositeOperation = 'destination-out'; dc.beginPath(); dc.arc(dr + 2 + dr * 0.55, dr + 2 - dr * 0.25, dr * 0.88, 0, 7); dc.fill(); }
    x.globalAlpha = def.moon ? 0.95 : 0.85; x.drawImage(d, dx - dr - 2, dy - dr - 2); x.globalAlpha = 1;
    return c;
  }
  function blob(x, cx, by, w, h, R) {
    const n = 3 + Math.floor(R() * 3);
    x.save(); x.beginPath(); x.rect(cx - h * 1.2, by - h * 2.4, w + h * 2.4, h * 2.4); x.clip();
    x.beginPath();
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, r = h * (0.42 + 0.42 * Math.sin(Math.PI * t)) * (0.85 + R() * 0.3), px = cx + w * (0.14 + 0.72 * t); x.moveTo(px + r, by - r * 0.62); x.arc(px, by - r * 0.62, r, 0, 6.2832); }
    rr(x, cx, by - h * 0.42, w, h * 0.42 + 2, h * 0.21, true);
    x.fill(); x.restore();
  }
  function mkFar() {
    const T = 540, HH = 270, [c, x] = mk(T, HH), R = deco;
    for (let i = 0; i < 6; i++) {
      const cx = i * (T / 6) + R() * 40, by = 78 + R() * 170, w = 70 + R() * 90, h = 24 + R() * 22, seed = Math.floor(R() * 1e9) + 1;
      [cx, cx - T].forEach((px) => {
        x.fillStyle = 'rgba(205,195,255,.55)'; blob(x, px + 4, by + 5, w, h, MG.rng(seed));
        x.fillStyle = vgrad(x, by - h * 1.3, by, [[0, '#ffffff'], [1, '#efe9ff']]); blob(x, px, by, w, h, MG.rng(seed));
      });
    }
    return c;
  }
  function mkCity() {
    const T = 660, HH = 200, [c, x] = mk(T, HH), [cl, xl] = mk(T, HH), R = deco;
    const row = (cols, hmin, hmax, winA, sign, alpha) => {
      let px = R() * 16, signDone = !sign;
      while (px < T - 26) {
        let w = 30 + R() * 44; if (px + w > T - 4) w = T - 4 - px; if (w < 24) break;
        const h = hmin + R() * (hmax - hmin), top = HH - h, col = cols[Math.floor(R() * cols.length)];
        x.globalAlpha = alpha; x.fillStyle = col; rr(x, px, top, w, h + 8, Math.min(12, w * 0.3)); x.fill();
        if (R() < 0.2 && w > 34) { x.beginPath(); x.arc(px + w / 2, top + 3, w * 0.28, Math.PI, 0); x.fill(); }
        x.fillStyle = 'rgba(255,255,255,.18)'; rr(x, px + 3, top + 4, Math.max(4, w * 0.22), h, 5); x.fill();
        const nc = Math.floor((w - 10) / 11), nr = Math.floor((h - 22) / 15), wx0 = px + (w - (nc * 11 - 5)) / 2;
        let signHere = false;
        if (!signDone && w > 44 && h > 90) { signDone = true; signHere = true; }
        for (let r = 0; r < nr; r++) for (let k = 0; k < nc; k++) {
          const wx = wx0 + k * 11, wy = top + 12 + r * 15 + (signHere ? 26 : 0); if (wy + 8 > HH - 4) continue;
          x.fillStyle = `rgba(255,255,255,${0.55 * winA})`; rr(x, wx, wy, 6, 8, 2); x.fill();
          if (R() < 0.55) { xl.globalAlpha = 0.95; xl.fillStyle = '#ffe49a'; rr(xl, wx, wy, 6, 8, 2); xl.fill(); }
        }
        if (signHere) {
          const sx = px + w / 2, sy = top + 16;
          x.globalAlpha = 1; x.fillStyle = '#ffffff'; rr(x, sx - 11, sy - 11, 22, 22, 6); x.fill(); cross(x, sx, sy, 14, 5, '#3b82ff');
          const g = xl.createRadialGradient(sx, sy, 2, sx, sy, 30); g.addColorStop(0, 'rgba(120,180,255,.75)'); g.addColorStop(1, 'rgba(120,180,255,0)');
          xl.globalAlpha = 1; xl.fillStyle = g; xl.fillRect(sx - 30, sy - 30, 60, 60); xl.fillStyle = '#ffffff'; rr(xl, sx - 11, sy - 11, 22, 22, 6); xl.fill(); cross(xl, sx, sy, 14, 5, '#3b82ff');
        }
        px += w + 3 + R() * 10;
      }
      x.globalAlpha = 1; xl.globalAlpha = 1;
    };
    row(['#dcd4ff', '#d4ddff', '#e0d6ff'], 80, 160, 0.6, false, 0.9);
    row(['#c6b7fb', '#bccaff', '#cfbfff', '#c1b1f8'], 46, 118, 1, true, 1);
    return [c, cl];
  }
  function mkBank() {
    const T = 470, HH = 124, [c, x] = mk(T, HH), R = deco, circ = [];
    let px = -12; while (px < T + 12) { const r = 22 + R() * 26; circ.push([px, HH - 40 - R() * 26 + r * 0.25, r]); px += r * 1.05; }
    const pass = (dx, dy, fill) => { x.fillStyle = fill; x.beginPath(); circ.forEach(([cx, cy, r]) => { [cx, cx - T, cx + T].forEach((q) => { x.moveTo(q + dx + r, cy + dy); x.arc(q + dx, cy + dy, r, 0, 6.2832); }); }); x.rect(0, HH - 46 + dy, T, 46); x.fill(); };
    pass(0, -5, 'rgba(255,255,255,.55)');
    pass(0, 0, vgrad(x, 20, HH, [[0, '#ffffff'], [0.6, '#f5f1ff'], [1, '#e7defe']]));
    x.fillStyle = 'rgba(190,175,250,.35)'; x.fillRect(0, HH - 14, T, 14);
    return c;
  }
  function mkGround() {
    const TG = 44, n = Math.ceil(V.ww / TG) + 2, W = n * TG, HH = H - GY + 18, top = 18, [c, x] = mk(W, HH);
    x.fillStyle = vgrad(x, top, HH, [[0, '#e6ddff'], [0.35, '#c9b7fb'], [1, '#a78ef0']]); x.fillRect(0, top - 2, W, HH);
    x.save(); x.beginPath(); x.rect(0, top + 12, W, 15); x.clip(); x.fillStyle = 'rgba(255,255,255,.38)';
    for (let i = -1; i < W / 22 + 2; i++) { const sx = i * 22; x.beginPath(); x.moveTo(sx, top + 27); x.lineTo(sx + 11, top + 27); x.lineTo(sx + 26, top + 12); x.lineTo(sx + 15, top + 12); x.closePath(); x.fill(); }
    x.restore();
    x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0, top + 11, W, 1.5);
    x.fillStyle = 'rgba(118,88,222,.35)'; x.fillRect(0, top + 27, W, 2.5);
    x.fillStyle = 'rgba(255,255,255,.32)';
    for (let i = 0; i < n; i++) { const bx = i * TG; [[9, 46, 2.2], [31, 62, 1.6], [20, 80, 1.9]].forEach(([a, b, r]) => { x.beginPath(); x.arc(bx + a, top + b, r, 0, 7); x.fill(); }); }
    const scallop = (dy, fill) => { x.fillStyle = fill; x.beginPath(); for (let i = 0; i <= W / 22; i++) { x.moveTo(i * 22 + 11 + 13, top + dy); x.arc(i * 22 + 11, top + dy, 13, 0, 6.2832); } x.fill(); };
    scallop(5, 'rgba(140,110,232,.32)');
    scallop(1, vgrad(x, top - 12, top + 14, [[0, '#ffffff'], [1, '#efe8ff']]));
    return c;
  }
  function mkPipes() {
    const bw = Math.max(2, Math.round(PW * V.K)), body = document.createElement('canvas'); body.width = bw; body.height = 4;
    const bx = body.getContext('2d'); bx.fillStyle = grad(bx, 0, bw, PIPE_BODY); bx.fillRect(0, 0, bw, 4);
    bx.fillStyle = 'rgba(25,80,18,.55)'; const e = Math.max(1, Math.round(1.4 * V.K)); bx.fillRect(0, 0, e, 4); bx.fillRect(bw - e, 0, e, 4);
    const capW = PW + 2 * CO;
    const cap = (gold) => {
      const [c, x] = mk(capW, CAPH);
      x.fillStyle = grad(x, CO, CO + PW, PIPE_BODY); x.fillRect(CO, CAP - 2, PW, CAPH - CAP + 2);
      x.fillStyle = 'rgba(25,80,18,.55)'; x.fillRect(CO, CAP - 2, 1.4, CAPH); x.fillRect(CO + PW - 1.4, CAP - 2, 1.4, CAPH);
      x.fillStyle = grad(x, 0, capW, PIPE_RIM); rr(x, 0.8, 0.8, capW - 1.6, CAP - 1.6, 7); x.fill();
      x.lineWidth = 1.6; x.strokeStyle = '#2a6f1d'; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.55)'; rr(x, 6, 4, capW - 12, 4, 2); x.fill();
      x.fillStyle = 'rgba(0,60,0,.16)'; x.fillRect(2.5, CAP - 7, capW - 5, 4.5);
      const by = CAP + 6;
      x.fillStyle = 'rgba(20,70,10,.22)'; rr(x, CO - 2, by + 2.2, PW + 4, BAND_H, 5); x.fill();
      x.fillStyle = vgrad(x, by, by + BAND_H, gold ? [[0, '#fff1a6'], [1, '#f2b21c']] : [[0, '#ffffff'], [1, '#e6e9ff']]);
      rr(x, CO - 2, by, PW + 4, BAND_H, 5); x.fill(); x.lineWidth = 1; x.strokeStyle = gold ? 'rgba(170,100,0,.45)' : 'rgba(90,90,170,.22)'; x.stroke();
      x.fillStyle = gold ? 'rgba(200,120,0,.35)' : 'rgba(140,150,215,.45)';
      for (let i = 0; i < 3; i++) for (const sx of [CO + 6, CO + PW - 6]) { x.beginPath(); x.arc(sx + (sx < capW / 2 ? i * 5 : -i * 5), by + BAND_H / 2, 0.9, 0, 7); x.fill(); }
      const ccx = CO + PW / 2, ccy = by + BAND_H / 2;
      if (gold) { x.fillStyle = '#ffffff'; star5(x, ccx, ccy, 6.4, 2.7); x.fill(); }
      else { cross(x, ccx, ccy, 10, 3.6, '#2f7bff'); x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(ccx - 1.2, ccy - 4.4, 1, 2.2); }
      return c;
    };
    const flip = (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.translate(0, src.height); x.scale(1, -1); x.drawImage(src, 0, 0); return c; };
    L.body = body; L.capUp = cap(false); L.capUpG = cap(true); L.capDown = flip(L.capUp); L.capDownG = flip(L.capUpG);
  }
  function mkParticles() {
    const S = 64, mkc = (fn) => { const c = document.createElement('canvas'); c.width = c.height = S; fn(c.getContext('2d')); return c; };
    const soft = (col) => (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col); g.addColorStop(0.55, col.replace(/[\d.]+\)$/, '0.45)')); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(0, 0, S, S); };
    const spark = (core, glow) => (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, glow); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
      x.fillStyle = core; x.beginPath(); x.moveTo(32, 6); x.quadraticCurveTo(35, 29, 58, 32); x.quadraticCurveTo(35, 35, 32, 58); x.quadraticCurveTo(29, 35, 6, 32); x.quadraticCurveTo(29, 29, 32, 6); x.fill();
    };
    L.pt = {
      puff: mkc(soft('rgba(255,255,255,0.95)')),
      glow: mkc(soft('rgba(200,180,255,0.9)')),
      spark: mkc(spark('#ffffff', 'rgba(255,255,255,.55)')),
      sparkL: mkc(spark('#e4d8ff', 'rgba(190,160,255,.5)')),
      gold: mkc((x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,220,90,.55)'); g.addColorStop(1, 'rgba(255,220,90,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); star5(x, 32, 33, 22, 9.5); x.fillStyle = '#ffd23f'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#e59a00'; x.stroke(); x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.arc(27, 26, 4, 0, 7); x.fill(); })
    };
  }
  function buildLayers() {
    L = { ready: false };
    deco = MG.rng(V.seed || 1);
    L.sky = SKIES.map(mkSky);
    L.far = mkFar(); [L.city, L.lit] = mkCity(); L.bank = mkBank(); L.ground = mkGround();
    mkPipes(); mkParticles();
    L.ready = true;
  }
  function layout() {
    if (!root) return;
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === V.cw && h === V.ch && dpr === V.dpr && L.ready) return;
    V.cw = w; V.ch = h; V.dpr = dpr; V.s = h / H; V.K = V.s * dpr; V.ww = w / V.s;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    M.x = Math.round(V.ww * 0.3);
    buildLayers();
    ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    if (st) { st.idle = 0; draw(); }
  }

  /* ---------- Interface ---------- */
  function updScore(bump) {
    if (!UI.score) return; UI.score.textContent = st.score;
    if (bump) { UI.score.classList.remove('bump'); void UI.score.offsetWidth; UI.score.classList.add('bump'); }
  }
  function updBest() {
    const b = Math.max(api.data.best || 0, st ? st.score : 0);
    if (UI.best) UI.best.textContent = MG.fmt(b);
    if (UI.rec) UI.rec.innerHTML = b ? `${MG.icon('crown')}Record : <b>${MG.fmt(b)}</b>` : `${MG.icon('star')}Premier vol : fixe ton record`;
  }
  function subFor(s) {
    if (s === 0) return "Milo a besoin d'élan : tapote régulièrement pour le garder en l'air.";
    if (s < 5) return 'Bon début ! Trouve ton rythme avec de petites impulsions régulières.';
    if (s < 10) return 'Joli vol ! Anticipe la hauteur du prochain passage.';
    if (s < 25) return 'Belle série, Milo plane avec style.';
    if (s < 50) return 'Impressionnant, tu maîtrises le vol.';
    return "Pilote d'élite. Milo n'en revient pas.";
  }
  function showOver() {
    const res = st.res || finishRun() || { record: false, prev: st.prevBest };
    const d = api.data, s = st.score, best = d.best || 0, med = medalFor(s), nxt = nextMedal(best), rec = res.record;
    const title = rec ? (res.prev > 0 ? 'Nouveau record !' : 'Premier record !') : 'Partie terminée';
    const sub = rec ? (res.prev > 0 ? `Tu as battu ton ancien record de ${MG.fmt(res.prev)}.` : 'Ton premier record est enregistré. À toi de le battre !') : subFor(s);
    const face = rec ? 'victoire' : 'decu';
    const m = document.createElement('div'); m.className = 'gmodal fl-over';
    m.innerHTML = `<div class="gpanel" role="dialog" aria-label="${title}">
      <img class="mas ${rec ? 'rec' : ''}" src="${MG.asset(SPRITES[face].src)}" alt="" draggable="false">
      <h3>${title}</h3><p>${sub}</p>
      <div class="fl-sc"><div><span>Score</span><b>${MG.fmt(s)}</b></div><div class="${rec ? 'hot' : ''}"><span>${MG.icon('crown')}Record</span><b>${MG.fmt(best)}</b></div></div>
      ${med ? `<div class="fl-medal" style="--m1:${med.c1};--m2:${med.c2}"><i>${MG.icon('star')}</i>${med.label}</div>` : ''}
      ${nxt ? `<p class="fl-next">Prochain palier : ${nxt.label.toLowerCase()} à ${nxt.at} passages${best ? ` (plus que ${nxt.at - best})` : ''}.</p>` : '<p class="fl-next">Toutes les médailles sont à toi. Respect.</p>'}
      <div class="acts wait"><button class="gbtn" data-fl="again">${MG.icon('redo')}Rejouer</button><button class="gbtn light" data-fl="hub">Retour aux jeux</button></div>
    </div>`;
    root.appendChild(m);
    st.overAt = performance.now();
    setTimeout(() => { const a = m.querySelector('.acts'); a && a.classList.remove('wait'); }, 550);
    if (rec) { try { api.fx.confetti(110); } catch (e) {} }
  }
  function again() { const m = root.querySelector('.fl-over'); if (m) m.remove(); newRun(true); last = 0; }

  function onDown(e) {
    if (e.button > 0) return;
    if (e.target.closest('button, .gmodal')) return;
    if (e.cancelable) e.preventDefault();
    tap();
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.fl;
    if (a === 'pause') pause();
    else if (a === 'resume') resume();
    else if (a === 'quit' || a === 'hub') api.close();
    else if (a === 'again') again();
  }
  function onKey(e) {
    if (!root || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.code;
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW' || k === 'Enter') {
      e.preventDefault();
      if (st.state === 'over') { const m = root.querySelector('.fl-over'); if (m && performance.now() - (st.overAt || 0) > 550) again(); }
      else tap();
    } else if (k === 'KeyP') { if (st.state === 'play') pause(); else if (st.state === 'paused') resume(); }
  }
  function onVis() { if (document.hidden) { pause(); flushSave(); } }
  function onBlur() { pause(); }

  /* ---------- Module ---------- */
  MG.register({
    id: 'flap', name: 'Milo Flap', logo: 'logo_flap.webp', theme: 'flap',
    mount(frame, a) {
      api = a; api.data.stats = api.data.stats || {};
      V.seed = (Date.now() & 0xffff) + 1;
      root = document.createElement('div'); root.className = 'fl-root'; root.dataset.state = 'ready';
      root.innerHTML = `<canvas class="fl-cv" role="img" aria-label="Milo Flap"></canvas>
        <div class="fl-hud"><div class="fl-best" title="Meilleur score">${MG.icon('crown')}<b id="flBest">0</b></div><div class="grow"></div>
          <button class="gclose fl-pause" data-fl="pause" aria-label="Pause">${svg('pause')}</button>
          <button class="gclose" data-fl="quit" aria-label="Quitter">${MG.icon('x')}</button></div>
        <div class="fl-score" aria-live="off">0</div>
        <div class="fl-msg" aria-hidden="true"></div>
        <div class="fl-ready">
          <img class="fl-logo" src="${MG.asset('logo_flap.webp')}" alt="Milo Flap" draggable="false">
          <div class="fl-tap">${svg('tap')}Tap to play</div>
          <p class="fl-hint">Touche l'écran pour battre des ailes et passe entre les poteaux.</p>
          <div class="fl-rec"></div>
        </div>
        <div class="fl-pauseov"><h3>Pause</h3><p>Touche l'écran pour reprendre le vol.</p>
          <div class="fl-pacts"><button class="gbtn" data-fl="resume">${MG.icon('play')}Reprendre</button><button class="gbtn light" data-fl="quit">Quitter la partie</button></div></div>`;
      frame.insertBefore(root, frame.firstChild);
      cv = root.querySelector('.fl-cv'); ctx = cv.getContext('2d', { alpha: false });
      UI = { score: root.querySelector('.fl-score'), msg: root.querySelector('.fl-msg'), best: root.querySelector('#flBest'), rec: root.querySelector('.fl-rec') };
      loadImgs();
      V.cw = V.ch = 0; L = {};
      newRun(false);
      layout();
      try { ro = new ResizeObserver(() => { clearTimeout(rTimer); rTimer = setTimeout(layout, 90); }); ro.observe(root); } catch (e) { window.addEventListener('resize', layout); }
      root.addEventListener('pointerdown', onDown);
      root.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('blur', onBlur);
      last = 0; raf = requestAnimationFrame(loop);
    },
    unmount() {
      cancelAnimationFrame(raf); clearTimeout(rTimer);
      try { ro && ro.disconnect(); } catch (e) {} ro = null;
      window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      if (st && (st.state === 'play' || st.state === 'paused')) finishRun(); else flushSave();
      root = null; cv = null; ctx = null; L = {}; parts.length = 0; UI = {};
    },
    card(d) {
      const s = d.stats || {}, b = d.best || 0, nxt = nextMedal(b);
      return {
        desc: 'Tapote pour faire voler Milo entre les poteaux. Facile à prendre en main, redoutable à maîtriser.',
        art: `<img class="fl-cmilo" src="${MG.asset(SPRITES.heureux.src)}" alt="" draggable="false">`,
        stats: [['Record', MG.fmt(b), 'crown'], ['Parties', MG.fmt(s.games || 0), 'pad'], ['Passages', MG.fmt(s.passes || 0), 'flame']],
        progress: nxt ? b / nxt.at : 1,
        progressLabel: nxt ? `Prochaine médaille : ${nxt.name} à ${nxt.at} passages` : 'Toutes les médailles débloquées',
        cta: b ? 'Battre mon record' : 'Prendre mon envol'
      };
    },
    homeLine(d) { return `Milo Flap record ${MG.fmt(d.best || 0)}`; },
    _debug: { state: () => st, M, V, L: () => L, tap: () => tap(), diff, speedAt, SPRITES, IMG }
  });

  /* ---------- Styles ---------- */
  const css = `
  .gscreen.flap{background:linear-gradient(180deg,#74a9ff,#a7c5ff 45%,#d0c6ff 80%,#b49df6)}
  .fl-root{position:absolute;inset:0;overflow:hidden;z-index:1;touch-action:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .fl-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
  .fl-hud{position:absolute;left:0;right:0;top:0;z-index:6;display:flex;align-items:center;gap:8px;padding:12px 14px 6px;pointer-events:none}
  .fl-hud button{pointer-events:auto}
  .fl-best{display:inline-flex;align-items:center;gap:6px;padding:6px 13px 6px 9px;border-radius:22px;background:rgba(255,255,255,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#5530d4;font-weight:900;font-size:17px;box-shadow:0 4px 14px rgba(60,40,150,.16);font-variant-numeric:tabular-nums}
  .fl-best .gi{width:21px;height:21px;fill:#ffcf3a;stroke:#e19c00;stroke-width:1.6}
  .fl-pause .gi{fill:currentColor;stroke:none;width:18px;height:18px}
  .fl-root:not([data-state=play]) .fl-pause{visibility:hidden}
  .fl-score{position:absolute;left:0;right:0;top:58px;z-index:4;text-align:center;font-size:64px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:1;-webkit-text-stroke:3px #5a2fd0;paint-order:stroke fill;text-shadow:0 5px 0 #4420a8,0 10px 20px rgba(40,10,110,.3);font-variant-numeric:tabular-nums;pointer-events:none;transition:opacity .25s}
  .fl-root[data-state=ready] .fl-score{opacity:0}
  .fl-score.bump{animation:flbump .32s cubic-bezier(.34,1.7,.5,1)}
  @keyframes flbump{0%{transform:scale(1)}40%{transform:scale(1.3)}100%{transform:scale(1)}}
  .fl-msg{position:absolute;left:50%;top:21%;z-index:4;transform:translateX(-50%);white-space:nowrap;font-size:28px;font-weight:900;letter-spacing:-.4px;color:#fff;-webkit-text-stroke:2.5px #6a2fd8;paint-order:stroke fill;text-shadow:0 4px 0 #4a1fa8,0 8px 16px rgba(40,10,110,.35);opacity:0;pointer-events:none}
  .fl-msg.show{animation:flmsg 1.4s cubic-bezier(.3,1.4,.5,1) forwards}
  .fl-msg.gold{color:#ffe066;-webkit-text-stroke-color:#b25f00;text-shadow:0 4px 0 #8a4600,0 8px 18px rgba(120,60,0,.35);font-size:32px}
  .fl-msg.warn{color:#fff3c4;-webkit-text-stroke-color:#e0560f;text-shadow:0 4px 0 #a93c0b,0 8px 16px rgba(120,40,0,.3)}
  @keyframes flmsg{0%{opacity:0;transform:translate(-50%,12px) scale(.55)}14%{opacity:1;transform:translate(-50%,0) scale(1.1)}24%{transform:translate(-50%,0) scale(1)}78%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-16px)}}
  .fl-ready{position:absolute;inset:0;z-index:3;pointer-events:none;transition:opacity .3s ease,transform .35s ease}
  .fl-root:not([data-state=ready]) .fl-ready{opacity:0;transform:scale(1.05)}
  .fl-logo{position:absolute;left:50%;top:8%;height:min(29%,250px);width:auto;max-width:82%;object-fit:contain;transform:translateX(-50%);filter:drop-shadow(0 10px 18px rgba(40,20,120,.28));animation:fllogo 3.2s ease-in-out infinite}
  .fl-root.replay .fl-logo{display:none}
  @keyframes fllogo{50%{transform:translateX(-50%) translateY(-7px) rotate(-1.2deg)}}
  .fl-tap{position:absolute;left:50%;top:58%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:10px;padding:13px 26px 13px 18px;border-radius:40px;background:linear-gradient(180deg,#fff,#f1eaff);color:#5530d4;font-size:24px;font-weight:900;letter-spacing:-.3px;white-space:nowrap;box-shadow:0 10px 26px rgba(60,30,150,.3),inset 0 -3px 0 rgba(110,70,230,.16);animation:fltap 1.25s ease-in-out infinite}
  .fl-tap .gi{width:28px;height:28px;stroke:#7a4cf0;stroke-width:2.2;animation:flhand 1.25s ease-in-out infinite}
  @keyframes fltap{50%{transform:translateX(-50%) scale(1.06)}}
  @keyframes flhand{0%,100%{transform:translateY(0)}45%{transform:translateY(3px) scale(.92)}}
  .fl-hint{position:absolute;left:8%;right:8%;top:67.5%;text-align:center;margin:0;font-size:14px;font-weight:800;line-height:1.35;color:#fff;text-shadow:0 1px 3px rgba(50,20,120,.55),0 0 12px rgba(80,50,180,.35)}
  .fl-rec{position:absolute;left:50%;top:75%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;padding:6px 14px 6px 10px;border-radius:20px;background:rgba(255,255,255,.82);color:#5530d4;font-size:14px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(60,40,150,.16)}
  .fl-rec b{font-weight:900}.fl-rec .gi{width:18px;height:18px;fill:#ffcf3a;stroke:#e19c00;stroke-width:1.6}
  .fl-pauseov{position:absolute;inset:0;z-index:7;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;background:rgba(30,16,90,.38);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);color:#fff;text-align:center}
  .fl-root[data-state=paused] .fl-pauseov{display:flex;animation:fade .2s}
  .fl-pauseov h3{font-size:40px;font-weight:900;margin:0;letter-spacing:-.8px;-webkit-text-stroke:2.5px #5a2fd0;paint-order:stroke fill;text-shadow:0 4px 0 #4420a8}
  .fl-pauseov p{margin:0 0 14px;font-weight:800;font-size:15px;opacity:.95}
  .fl-pacts{display:flex;flex-direction:column;gap:10px;width:min(100%,280px)}
  .fl-over .gpanel{padding-top:26px}
  .fl-over .mas{width:176px;height:140px;margin:-104px auto 4px}
  .fl-over .mas.rec{animation:flrec 1.6s ease-in-out infinite}
  @keyframes flrec{50%{transform:translateY(-6px) rotate(-3deg)}}
  .fl-sc{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0 10px}
  .fl-sc div{background:#f4efff;border-radius:16px;padding:9px 6px 8px}
  .fl-sc div.hot{background:linear-gradient(160deg,#fff6cf,#ffe7a0)}
  .fl-sc span{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:800;color:var(--muted)}
  .fl-sc span .gi{width:13px;height:13px;fill:#ffcf3a;stroke:#e19c00;stroke-width:1.6}
  .fl-sc b{display:block;font-size:34px;font-weight:900;color:#5530d4;letter-spacing:-1px;line-height:1.1;font-variant-numeric:tabular-nums}
  .fl-medal{display:inline-flex;align-items:center;gap:8px;padding:5px 14px 5px 5px;border-radius:30px;background:#fff;box-shadow:0 4px 14px rgba(60,40,150,.14);font-weight:900;color:#3a2a80;font-size:14px;animation:gpop .5s .15s cubic-bezier(.34,1.6,.5,1) both}
  .fl-medal i{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,var(--m1),var(--m2));box-shadow:inset 0 -2px 0 rgba(0,0,0,.15),0 2px 5px rgba(0,0,0,.18)}
  .fl-medal i .gi{width:16px;height:16px;fill:#fff;stroke:none}
  .fl-next{font-size:12.5px!important;margin:8px 0 0!important;font-weight:700}
  .fl-over .acts{transition:opacity .2s}.fl-over .acts.wait{pointer-events:none;opacity:.55}
  .gcard.flap .gcard-art{background:radial-gradient(circle at 82% 16%,rgba(255,255,255,.85),rgba(255,255,255,0) 32%),linear-gradient(180deg,#78acff,#a9c6ff 48%,#d6ccff 82%,#efe8ff)}
  .gcard.flap .gcard-art:after{content:"";position:absolute;left:0;right:0;bottom:0;height:40px;background:radial-gradient(22px 18px at 4% 100%,#fff 96%,transparent),radial-gradient(30px 26px at 15% 92%,#fff 96%,transparent),radial-gradient(26px 20px at 27% 100%,#fff 96%,transparent),radial-gradient(34px 26px at 40% 96%,#fff 96%,transparent),radial-gradient(26px 22px at 53% 100%,#fff 96%,transparent),radial-gradient(32px 26px at 66% 94%,#fff 96%,transparent),radial-gradient(26px 20px at 79% 100%,#fff 96%,transparent),radial-gradient(30px 26px at 91% 94%,#fff 96%,transparent),linear-gradient(transparent 70%,#fff 70%);opacity:.95}
  .gcard.flap .gcard-art img{position:relative;z-index:1}
  .gcard.flap .gcard-art img:not(.fl-cmilo){margin-left:30%}
  .gcard.flap .gcard-art img.fl-cmilo{position:absolute;left:4%;top:20%;width:112px;height:auto;max-width:none;z-index:2;filter:drop-shadow(0 8px 12px rgba(40,20,120,.28));animation:flcard 2.8s ease-in-out infinite}
  @keyframes flcard{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-9px) rotate(3deg)}}
  @media (prefers-reduced-motion:reduce){.fl-logo,.fl-tap,.fl-tap .gi,.gcard.flap .gcard-art img.fl-cmilo,.fl-over .mas.rec{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
