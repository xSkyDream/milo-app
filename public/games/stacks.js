/* =====================================================================
   Milo Stacks — puzzle de pièces qui tombent, à la façon Milo
   - Grille 10 × 20, 7 pièces, sac aléatoire, rotation avec décalages
   - Contrôles : glisser (déplacer), toucher (tourner), maintenir (accélérer),
     glisser vite vers le bas (poser d'un coup)
   - Modes : Classique (sans fin, reprise de partie), Défis (étoiles), Records
   - Sauvegarde : api.data (persistance Milo, synchronisée avec le compte)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames;
  if (!MG) return;

  /* ---------- Constantes de jeu ---------- */
  const COLS = 10, ROWS = 20, HID = 2, TOT = ROWS + HID;
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const MAT = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]]
  };
  // Palette Milo : cyan, soleil, violet, turquoise, rose, bleu glacier, pêche + « nuage » (défis)
  const PAL = [
    { a: '#c4f8ff', b: '#33cdea', d: '#0b78a0' },
    { a: '#fff3b0', b: '#f6c43c', d: '#bd7a06' },
    { a: '#e6ccff', b: '#a565f7', d: '#6528c2' },
    { a: '#bff8ea', b: '#22bfa6', d: '#0a7468' },
    { a: '#ffd6ec', b: '#ee62aa', d: '#ad2a70' },
    { a: '#d5e6ff', b: '#4f8ff6', d: '#2450c2' },
    { a: '#ffdcc2', b: '#fb9252', d: '#c0521b' },
    { a: '#ece8ff', b: '#aaa1d8', d: '#655d9c' }
  ];
  const CLOUD = 7;
  const ROT = {};
  TYPES.forEach((t) => {
    let m = MAT[t]; ROT[t] = [];
    for (let s = 0; s < 4; s++) {
      const cells = []; m.forEach((row, r) => row.forEach((v, c) => { if (v) cells.push([r, c]); })); ROT[t].push(cells);
      const n = m.length; m = [...Array(n)].map((_, r) => [...Array(n)].map((__, c) => m[n - 1 - c][r]));
    }
  });
  // Décalages de rotation (x vers la droite, y vers le haut)
  const KJ = { '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]] };
  const KI = { '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]] };
  const gravity = (lv) => Math.max(0.045, 0.85 * Math.pow(0.8, lv - 1)); // secondes par ligne
  const LOCK = 0.5, LOCK_SOFT = 0.2, MAX_RESETS = 14, SOFT_IV = 0.032, CLEAR_DUR = 0.34;
  const LINE_PTS = [0, 100, 300, 500, 800];
  const LINE_NAME = ['', '', 'Double !', 'Triple !', 'Milo Stack !'];

  /* ---------- Défis ---------- */
  const CH = [
    { id: 'c1', name: 'Échauffement', goal: 'lines', n: 10, lv: 1, t: [150, 95], desc: 'Fais 10 lignes, à ton rythme.' },
    { id: 'c2', name: 'Contre la montre', goal: 'lines', n: 15, lv: 2, limit: 150, t: [115, 85], desc: '15 lignes en moins de 2 min 30.' },
    { id: 'c3', name: 'Fouille', goal: 'dig', garbage: 5, lv: 1, t: [110, 70], desc: 'Efface les 5 lignes de nuages.' },
    { id: 'c4', name: 'Score éclair', goal: 'score', n: 2500, lv: 3, limit: 120, t: [90, 60], desc: '2 500 points en 2 minutes.' },
    { id: 'c5', name: 'Grand ménage', goal: 'quads', n: 2, lv: 1, t: [220, 150], desc: 'Efface 4 lignes d’un coup, deux fois.' },
    { id: 'c6', name: 'Grande vitesse', goal: 'lines', n: 15, lv: 6, t: [110, 80], desc: '15 lignes en partant du niveau 6.' },
    { id: 'c7', name: 'Fouille profonde', goal: 'dig', garbage: 9, lv: 2, t: [200, 130], desc: 'Efface les 9 lignes de nuages.' },
    { id: 'c8', name: 'Marathon', goal: 'lines', n: 40, lv: 1, t: [420, 320], desc: '40 lignes, sans limite de temps.' },
    { id: 'c9', name: 'Maître Milo', goal: 'lines', n: 25, lv: 8, limit: 240, t: [190, 150], desc: '25 lignes en 4 min, dès le niveau 8.' }
  ];
  const chById = (id) => CH.find((c) => c.id === id);

  /* ---------- Milo ---------- */
  const FACE = { idle: 'v3_face', joie: 'v3_heureux', clin: 'v3_clin', wow: 'v3_alerte', bravo: 'v3_felicitations', focus: 'v3_determine', amour: 'v3_amour', dodo: 'v3_sommeil' };
  const faceSrc = (k) => `assets/${FACE[k] || k}.webp`;
  const LOSE_LINES = ['Oups, la pile a touché le plafond !', 'Même Milo a perdu l’équilibre !', 'Petite pause, puis revanche ?', 'La tour était trop belle pour tenir !'];

  /* ---------- Icônes locales ---------- */
  const IC = {
    back: '<path d="m15 18-6-6 6-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    swipe: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
    tap: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8" opacity=".45"/>',
    hold: '<path d="M12 4v13M7 12l5 5 5-5"/><path d="M6 20h12"/>',
    flick: '<path d="M12 3v15M6 13l6 6 6-6"/><path d="M8 3h8" opacity=".5"/>'
  };
  const ico = (n, cls) => IC[n] ? `<svg class="gi ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>` : MG.icon(n, cls);
  const fmtT = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- État ---------- */
  let api = null, root = null, st = null, cv = null, ctx = null, ncv = null, nctx = null, raf = 0, last = 0, ro = null, rTimer = 0;
  const UI = { cs: 28, dpr: 1, spr: [], gh: [], wh: null, bg: null, vx: 0, vy: 0, rot: 0, spawnT: 1, land: null, trail: null, fall: null, shake: 0, dead: -1, ptr: null, holdT: 0, warnAt: -99, face: 'idle', faceT: 0, bubT: 0, hud: {}, shown: 0, scoreRaf: 0, screen: 'home', clock: 0 };

  function blank(mode, ch) {
    const d = api.data;
    return { mode, ch: ch ? ch.id : null, grid: Array(TOT * COLS).fill(-1), piece: null, next: null, bag: [], score: 0, lines: 0, level: ch ? ch.lv : 1, startLv: ch ? ch.lv : 1,
      chain: 0, maxChain: 0, quads: 0, b2b: false, pieces: 0, time: 0, acc: 0, lockT: 0, resets: 0, lowY: 0, soft: false, clearing: null,
      over: false, won: false, paused: false, best0: d.best || 0, nearShown: false, recShown: false };
  }
  const CHD = () => (st && st.ch ? chById(st.ch) : null);

  /* =====================================================================
     MOTEUR
     ===================================================================== */
  const cellsOf = (t, s, x, y) => ROT[t][s].map(([r, c]) => [y + r, x + c]);
  function fits(t, s, x, y, g) {
    g = g || st.grid;
    for (const [r, c] of ROT[t][s]) { const rr = y + r, cc = x + c; if (cc < 0 || cc >= COLS || rr >= TOT) return false; if (rr >= 0 && g[rr * COLS + cc] >= 0) return false; }
    return true;
  }
  function nextType() {
    if (!st.bag.length) { const b = TYPES.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } st.bag = b; }
    return st.bag.pop();
  }
  function ghostY(p) { let y = p.y; while (fits(p.t, p.s, p.x, y + 1)) y++; return y; }
  const grounded = (p) => !fits(p.t, p.s, p.x, p.y + 1);

  function spawn() {
    if (!st.next) st.next = nextType();
    const t = st.next; st.next = nextType();
    const n = MAT[t].length, x = Math.floor((COLS - n) / 2);
    let y = HID - Math.min(...ROT[t][0].map((q) => q[0]));
    if (!fits(t, 0, x, y)) { y--; if (!fits(t, 0, x, y)) { st.piece = null; gameOver(); return; } }
    st.piece = { t, s: 0, x, y }; st.acc = 0; st.lockT = 0; st.resets = 0; st.lowY = y; st.soft = false;
    UI.vx = x; UI.vy = y; UI.spawnT = 0; UI.rot = 0;
    if (UI.ptr) { UI.ptr.soft = false; UI.ptr.lx = UI.ptr.cx; UI.ptr.used = true; }
    drawNext(); dangerCheck();
  }
  function afterMove(p) {
    if (grounded(p) && st.resets < MAX_RESETS) { st.lockT = 0; st.resets++; }
    if (p.y > st.lowY) { st.lowY = p.y; st.resets = 0; }
  }
  function move(dx) {
    const p = st.piece; if (!p || !playing()) return false;
    if (!fits(p.t, p.s, p.x + dx, p.y)) return false;
    p.x += dx; afterMove(p); return true;
  }
  function rotate(dir) {
    const p = st.piece; if (!p || !playing()) return false;
    if (p.t === 'O') { UI.rot = 0.35 * dir; MG.sfx.play('tap'); return true; }
    const ns = (p.s + (dir > 0 ? 1 : 3)) % 4, kicks = (p.t === 'I' ? KI : KJ)['' + p.s + ns];
    for (const [kx, ky] of kicks) {
      if (fits(p.t, ns, p.x + kx, p.y - ky)) { p.x += kx; p.y -= ky; p.s = ns; UI.rot = dir; MG.sfx.play('tap'); afterMove(p); return true; }
    }
    MG.sfx.play('invalid'); return false;
  }
  function hardDrop() {
    const p = st.piece; if (!p || !playing()) return;
    const y0 = p.y; p.y = ghostY(p); const d = p.y - y0;
    if (d > 0) { addScore(d * 2); UI.trail = { t: 0, cells: cellsOf(p.t, p.s, p.x, p.y), d, col: TYPES.indexOf(p.t) }; }
    UI.vy = p.y; UI.vx = p.x; UI.shake = Math.min(1, 0.35 + d / 18);
    MG.sfx.play('drop'); lock();
  }
  function lock() {
    const p = st.piece; if (!p) return;
    const cells = cellsOf(p.t, p.s, p.x, p.y), col = TYPES.indexOf(p.t);
    let out = false;
    cells.forEach(([r, c]) => { if (r < HID) out = true; if (r >= 0) st.grid[r * COLS + c] = col; });
    st.piece = null; st.pieces++;
    UI.land = { set: new Set(cells.filter(([r]) => r >= 0).map(([r, c]) => r * COLS + c)), t: 0 };
    MG.sfx.play('place', { n: 4 });
    try { const xs = cells.map((q) => q[1]), by = Math.max(...cells.map((q) => q[0])); const [x, y] = boardXY((Math.min(...xs) + Math.max(...xs)) / 2, by + 0.5); api.fx.burst(x, y, ['#ffffff', PAL[col].a], 5, { speed: 1.8, size: 5, up: 0.6, g: 0.05, shape: 'dot' }); } catch (e) {}
    if (out) { gameOver(); return; }
    const full = [];
    for (let r = 0; r < TOT; r++) { let f = true; for (let c = 0; c < COLS; c++) if (st.grid[r * COLS + c] < 0) { f = false; break; } if (f) full.push(r); }
    if (full.length) clearLines(full);
    else { st.chain = 0; if (checkGoal()) return; spawn(); }
    if (st.mode === 'classic' && st.pieces % 4 === 0) persist();
  }
  function clearLines(rows) {
    const n = rows.length, lvB = st.level;
    st.chain++; st.maxChain = Math.max(st.maxChain, st.chain); st.lines += n;
    let pts = LINE_PTS[Math.min(4, n)] * lvB;
    if (n === 4) { if (st.b2b) pts = Math.round(pts * 1.5); st.b2b = true; st.quads++; } else st.b2b = false;
    if (st.chain > 1) pts += 50 * (st.chain - 1) * lvB;
    // plateau vide après la suppression ?
    const remain = st.grid.filter((v, i) => v >= 0 && !rows.includes(Math.floor(i / COLS))).length;
    if (!remain) pts += 1000 * lvB;
    st.level = st.startLv + Math.floor(st.lines / 10);
    st.clearing = { rows, t: 0 };
    addScore(pts);
    // ----- effets
    MG.sfx.play('clear', { n, up: Math.min(7, st.chain - 1) });
    if (n === 4) setTimeout(() => MG.sfx.play('bigclear'), 120);
    try {
      rows.forEach((r) => { for (let c = 1; c < COLS; c += 2) { const v = st.grid[r * COLS + c], [x, y] = boardXY(c, r); api.fx.burst(x, y, [PAL[v] ? PAL[v].a : '#fff', PAL[v] ? PAL[v].b : '#fff', '#ffffff'], n >= 3 ? 4 : 3, { speed: n >= 3 ? 4.6 : 3.4, size: 7 }); } });
      if (n >= 3 || st.chain >= 3) { const [x, y] = boardXY(4.5, rows[Math.floor(rows.length / 2)]); api.fx.ring(x, y, n === 4 ? '#ffd84d' : '#ffffff', n === 4 ? 5 : 3); }
    } catch (e) {}
    if (n >= 3) UI.shake = Math.max(UI.shake, n === 4 ? 1 : 0.6);
    vibrate(n === 4 ? 30 : n >= 2 ? 15 : 8);
    const midR = rows.reduce((a, b) => a + b, 0) / n;
    floatText('+' + MG.fmt(pts), 4.5, midR, n >= 2 || st.chain >= 2);
    if (n >= 2) setTimeout(() => root && floatText(LINE_NAME[n], 4.5, midR - 1.4, true, n === 4 ? 'gold' : 'name'), 90);
    // ----- Milo (ponctuel)
    if (!remain) { api.react({ face: 'v3_felicitations', text: 'Plateau vide !', size: 'lg', hold: 1300 }); api.fx.confetti(70); face('bravo', 1800); }
    else if (n === 4) { api.react({ face: 'v3_felicitations', text: 'Tu es imbattable !', size: 'lg' }); api.fx.confetti(60); face('bravo', 1800); }
    else if (st.chain >= 3) { face('amour', 1400); say(st.chain >= 5 ? 'Inarrêtable !' : 'Quel combo !', 'fire', 1300); }
    else if (n === 3) { face('wow', 1400); say('Incroyable !', 'pop', 1300); }
    else if (n === 2) { face('joie', 1200); say('Bien joué !', '', 1100); }
    else if (Math.random() < 0.2) { face(Math.random() < 0.5 ? 'joie' : 'clin', 1000); }
    if (st.chain >= 2) showChain();
    if (st.level > lvB) levelUp();
    hud();
  }
  function finishClear() {
    const rows = st.clearing.rows, keep = [];
    for (let r = 0; r < TOT; r++) if (!rows.includes(r)) keep.push(r);
    const g = Array(TOT * COLS).fill(-1), off = Array(TOT).fill(0);
    let dst = TOT - 1;
    for (let i = keep.length - 1; i >= 0; i--, dst--) { const src = keep[i]; for (let c = 0; c < COLS; c++) g[dst * COLS + c] = st.grid[src * COLS + c]; off[dst] = dst - src; }
    st.grid = g; st.clearing = null; UI.fall = { off, t: 0 };
    if (checkGoal()) return;
    spawn();
  }
  function addScore(n) {
    if (!n) return; st.score += n; UI.scoreDirty = true;
    if (st.mode !== 'classic') return;
    const best = st.best0;
    if (best > 0 && !st.nearShown && st.score >= best * 0.9 && st.score <= best) { st.nearShown = true; face('wow', 1400); say('Le record est tout proche !', 'gold', 1600); }
    if (best > 0 && !st.recShown && st.score > best) {
      st.recShown = true; MG.sfx.play('record');
      setTimeout(() => { if (!root || st.over) return; face('bravo', 1800); say('Nouveau record !', 'gold', 1800); const b = root.querySelector('.st-best'); b && b.classList.add('rec'); }, 200);
    }
  }
  function levelUp() {
    MG.sfx.play('unlock'); say(`Niveau ${st.level} !`, 'pop', 1300); face('clin', 1100);
    const el = root.querySelector('[data-k="level"]'); if (el) { el.classList.remove('up'); void el.offsetWidth; el.classList.add('up'); }
    UI.lvGlow = 1; vibrate(12);
  }
  function update(dt) {
    if (!st || st.over || st.won || st.paused) return;
    st.time += dt;
    const ch = CHD();
    if (ch && ch.limit && st.time >= ch.limit) { failChallenge('time'); return; }
    if (st.clearing) { st.clearing.t += dt; if (st.clearing.t >= CLEAR_DUR) finishClear(); return; }
    const p = st.piece; if (!p) return;
    UI.spawnT += dt;
    if (grounded(p)) {
      st.acc = 0; st.lockT += dt;
      if (st.lockT >= (st.soft ? LOCK_SOFT : LOCK)) lock();
      return;
    }
    st.lockT = 0;
    const iv = st.soft ? Math.min(SOFT_IV, gravity(st.level)) : gravity(st.level);
    st.acc += dt;
    while (st.acc >= iv) {
      st.acc -= iv;
      if (fits(p.t, p.s, p.x, p.y + 1)) { p.y++; if (st.soft) addScore(1); if (p.y > st.lowY) { st.lowY = p.y; st.resets = 0; } }
      else { st.acc = 0; break; }
    }
  }
  const playing = () => st && !st.over && !st.won && !st.paused && UI.screen === 'game';
  function stackTop() { for (let r = 0; r < TOT; r++) for (let c = 0; c < COLS; c++) if (st.grid[r * COLS + c] >= 0) return r; return TOT; }
  function dangerCheck() {
    const top = stackTop() - HID;
    if (top < 5 && st.time - UI.warnAt > 10) { UI.warnAt = st.time; face('wow', 1400); say('Attention, ça monte !', 'warn', 1500); MG.sfx.play('warn'); }
    else if (top < 8 && UI.face === 'idle' && !UI.faceT) face('focus');
    else if (top >= 10 && UI.face === 'focus' && !UI.faceT) face('idle');
  }
  function vibrate(ms) { try { if ((api.data.prefs || {}).haptics !== false && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  /* ---------- Objectifs des défis ---------- */
  function cloudRows() { let n = 0; for (let r = 0; r < TOT; r++) for (let c = 0; c < COLS; c++) if (st.grid[r * COLS + c] === CLOUD) { n++; break; } return n; }
  function goalProgress() {
    const ch = CHD(); if (!ch) return null;
    if (ch.goal === 'lines') return { v: Math.min(st.lines, ch.n), n: ch.n, label: 'Lignes' };
    if (ch.goal === 'score') return { v: Math.min(st.score, ch.n), n: ch.n, label: 'Points', fmt: true };
    if (ch.goal === 'quads') return { v: Math.min(st.quads, ch.n), n: ch.n, label: 'Stacks ×4' };
    if (ch.goal === 'dig') { const left = cloudRows(); return { v: ch.garbage - left, n: ch.garbage, label: 'Nuages' }; }
    return null;
  }
  function checkGoal() {
    const g = goalProgress(); if (!g) return false;
    if (g.v >= g.n) { winChallenge(); return true; }
    return false;
  }
  function addGarbage(k) {
    let prev = -1;
    for (let i = 0; i < k; i++) {
      const r = TOT - 1 - i; let hole = Math.floor(Math.random() * COLS); if (hole === prev) hole = (hole + 3) % COLS; prev = hole;
      for (let c = 0; c < COLS; c++) st.grid[r * COLS + c] = c === hole ? -1 : CLOUD;
    }
  }

  /* =====================================================================
     RENDU (canvas)
     ===================================================================== */
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function blockSprite(p, S) {
    const k = document.createElement('canvas'); k.width = k.height = S; const c = k.getContext('2d');
    const g = Math.max(1, Math.round(S * 0.05)), w = S - g * 2, r = w * 0.24, lw = Math.max(1, S * 0.025);
    // tranche (profondeur)
    rr(c, g, g + w * 0.06, w, w * 0.94, r); c.fillStyle = p.d; c.fill();
    // corps
    rr(c, g, g, w, w * 0.9, r);
    let lg = c.createLinearGradient(0, g, 0, g + w * 0.9); lg.addColorStop(0, p.a); lg.addColorStop(0.5, p.b); lg.addColorStop(1, p.b); c.fillStyle = lg; c.fill();
    // face bombée
    const i = w * 0.15;
    rr(c, g + i, g + i * 0.85, w - 2 * i, w * 0.9 - 2 * i, r * 0.6);
    lg = c.createLinearGradient(0, g + i, 0, g + w * 0.9 - i); lg.addColorStop(0, hexA(p.a, 0.85)); lg.addColorStop(1, hexA(p.b, 0.15)); c.fillStyle = lg; c.fill();
    // reflet
    c.save(); rr(c, g, g, w, w * 0.9, r); c.clip();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(g + w * 0.3, g + w * 0.2, w * 0.2, w * 0.09, -0.35, 0, Math.PI * 2); c.fill();
    c.restore();
    // contours fins
    rr(c, g + lw / 2, g + lw / 2, w - lw, w * 0.9 - lw, r); c.lineWidth = lw; c.strokeStyle = 'rgba(255,255,255,.45)'; c.stroke();
    rr(c, g, g, w, w * 0.96, r); c.lineWidth = lw; c.strokeStyle = hexA(p.d, 0.7); c.stroke();
    return k;
  }
  function ghostSprite(p, S) {
    const k = document.createElement('canvas'); k.width = k.height = S; const c = k.getContext('2d');
    const g = Math.max(1, Math.round(S * 0.08)), w = S - g * 2, lw = Math.max(1.5, S * 0.06);
    rr(c, g, g, w, w, w * 0.24); c.fillStyle = hexA(p.b, 0.26); c.fill(); c.lineWidth = lw; c.strokeStyle = hexA(p.a, 0.95); c.stroke();
    return k;
  }
  function whiteSprite(S) {
    const k = document.createElement('canvas'); k.width = k.height = S; const c = k.getContext('2d');
    const g = Math.max(1, Math.round(S * 0.05)), w = S - g * 2; rr(c, g, g, w, w, w * 0.24); c.fillStyle = '#fff'; c.fill(); return k;
  }
  function buildSprites() {
    const S = Math.round(UI.cs * UI.dpr);
    UI.spr = PAL.map((p) => blockSprite(p, S)); UI.gh = PAL.map((p) => ghostSprite(p, S)); UI.wh = whiteSprite(S);
    // fond du plateau : alvéoles
    const W = UI.cs * COLS * UI.dpr, H = UI.cs * ROWS * UI.dpr, k = document.createElement('canvas'); k.width = W; k.height = H; const c = k.getContext('2d');
    const lg = c.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, '#231a66'); lg.addColorStop(1, '#151046'); c.fillStyle = lg; c.fillRect(0, 0, W, H);
    const g = Math.max(1, Math.round(S * 0.07)), w = S - g * 2;
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
      rr(c, col * S + g, r * S + g, w, w, w * 0.22); c.fillStyle = 'rgba(190,170,255,.055)'; c.fill();
      c.strokeStyle = 'rgba(190,170,255,.07)'; c.lineWidth = 1; c.stroke();
    }
    UI.bg = k;
  }
  function boardXY(c, r) {
    const b = cv.getBoundingClientRect(), f = root.parentNode.getBoundingClientRect();
    return [b.left - f.left + (c + 0.5) * UI.cs, b.top - f.top + (r - HID + 0.5) * UI.cs];
  }
  function drawCell(c, spr, x, y, s, sy, alpha, bottom) {
    const cs = UI.cs;
    if (alpha != null && alpha < 1) c.globalAlpha = Math.max(0, alpha);
    if (s === 1 && sy === 1) c.drawImage(spr, x, y, cs, cs);
    else { const w = cs * s, h = cs * sy; c.drawImage(spr, x + (cs - w) / 2, y + (cs - h) / (bottom ? 1 : 2), w, h); }
    if (alpha != null && alpha < 1) c.globalAlpha = 1;
  }
  function draw(dt) {
    if (!ctx || !st) return;
    const c = ctx, cs = UI.cs, W = cs * COLS, H = cs * ROWS;
    c.setTransform(UI.dpr, 0, 0, UI.dpr, 0, 0); c.clearRect(0, 0, W, H);
    // secousse
    if (UI.shake > 0.01) { UI.shake *= Math.pow(0.0008, dt); c.translate(0, Math.sin(performance.now() / 22) * UI.shake * 3.2); }
    c.drawImage(UI.bg, 0, 0, W, H);
    // lueur de danger
    const top = stackTop() - HID;
    if (!st.over && top < 6) { const a = (0.18 + 0.1 * Math.sin(performance.now() / 180)) * (1 - top / 6); const lg = c.createLinearGradient(0, 0, 0, cs * 4); lg.addColorStop(0, `rgba(255,90,150,${a})`); lg.addColorStop(1, 'rgba(255,90,150,0)'); c.fillStyle = lg; c.fillRect(0, 0, W, cs * 4); }
    if (UI.lvGlow > 0.01) { UI.lvGlow *= Math.pow(0.05, dt); const lg = c.createLinearGradient(0, H, 0, H * 0.4); lg.addColorStop(0, `rgba(160,120,255,${0.35 * UI.lvGlow})`); lg.addColorStop(1, 'rgba(160,120,255,0)'); c.fillStyle = lg; c.fillRect(0, 0, W, H); }
    // blocs posés
    const fall = UI.fall; let fe = 1; if (fall) { fall.t += dt; fe = ease(Math.min(1, fall.t / 0.16)); if (fe >= 1) UI.fall = null; }
    const land = UI.land; let lk = 1; if (land) { land.t += dt; lk = Math.min(1, land.t / 0.26); if (lk >= 1) UI.land = null; }
    const clr = st.clearing, ck = clr ? clr.t / CLEAR_DUR : 0;
    const dead = UI.dead;
    for (let r = HID; r < TOT; r++) {
      const isClr = clr && clr.rows.includes(r);
      const yoff = fall && fall.off[r] ? -fall.off[r] * (1 - fe) : 0, y = (r - HID + yoff) * cs;
      for (let col = 0; col < COLS; col++) {
        const v = st.grid[r * COLS + col]; if (v < 0) continue;
        const x = col * cs;
        if (isClr) {
          const delay = Math.abs(col - 4.5) / 4.5 * 0.35, k = clamp((ck - 0.18 - delay * 0.45) / 0.5, 0, 1), s = 1 - k * k;
          if (s > 0.02) drawCell(c, UI.spr[v], x, y, s, s, 1 - k * 0.6);
          const wa = ck < 0.2 ? 0.9 : Math.max(0, 0.9 - (ck - 0.2) * 2.4);
          if (wa > 0 && s > 0.02) drawCell(c, UI.wh, x, y, s, s, wa);
          continue;
        }
        let spr = UI.spr[v];
        if (dead >= 0 && (TOT - 1 - r) < dead * 26) spr = UI.spr[CLOUD];
        if (land && lk < 1 && land.set.has(r * COLS + col)) {
          const q = Math.sin(Math.PI * lk) * 0.13;
          drawCell(c, spr, x, y, 1 + q * 0.55, 1 - q, 1, true);
          drawCell(c, UI.wh, x, y, 1 + q * 0.55, 1 - q, (1 - lk) * 0.35, true);
        } else c.drawImage(spr, x, y, cs, cs);
      }
      if (isClr && ck < 0.55) { const a = 0.6 * (1 - ck / 0.55); const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, `rgba(255,255,255,0)`); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, `rgba(255,255,255,0)`); c.fillStyle = g; rr(c, 0, y - cs * 0.08, W, cs * 1.16, cs * 0.4); c.fill(); }
    }
    // traînée de chute
    const tr = UI.trail;
    if (tr) {
      tr.t += dt; const a = 1 - tr.t / 0.28; if (a <= 0) UI.trail = null;
      else { const tops = {}; tr.cells.forEach(([r, col]) => { if (tops[col] == null || r < tops[col]) tops[col] = r; });
        Object.keys(tops).forEach((col) => { const r = tops[col], y1 = (r - HID) * cs, y0 = Math.max(0, y1 - tr.d * cs), g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, hexA(PAL[tr.col].a, 0)); g.addColorStop(1, hexA(PAL[tr.col].a, 0.42 * a)); c.fillStyle = g; c.fillRect(col * cs + cs * 0.14, y0, cs * 0.72, y1 - y0); }); }
    }
    // pièce active + fantôme
    const p = st.piece;
    if (p && !st.over) {
      const kx = 1 - Math.exp(-dt * 38), ky = 1 - Math.exp(-dt * 30);
      UI.vx += (p.x - UI.vx) * kx; UI.vy += (p.y - UI.vy) * ky; if (Math.abs(p.x - UI.vx) < 0.01) UI.vx = p.x; if (Math.abs(p.y - UI.vy) < 0.01) UI.vy = p.y;
      const col = TYPES.indexOf(p.t), gy = ghostY(p);
      if (gy > p.y) ROT[p.t][p.s].forEach(([r, cc]) => { const rr2 = gy + r; if (rr2 >= HID) c.drawImage(UI.gh[col], (p.x + cc) * cs, (rr2 - HID) * cs, cs, cs); });
      const n = MAT[p.t].length, sk = Math.min(1, UI.spawnT / 0.14), sc = 0.7 + 0.3 * ease(sk);
      if (Math.abs(UI.rot) > 0.01) UI.rot *= Math.pow(1e-8, dt); else UI.rot = 0;
      const cx = (UI.vx + n / 2) * cs, cy = (UI.vy - HID + n / 2) * cs;
      c.save(); c.translate(cx, cy); if (UI.rot) c.rotate(-UI.rot * Math.PI / 2); if (sc < 1) c.scale(sc, sc); c.translate(-cx, -cy);
      if (sk < 1) c.globalAlpha = sk;
      c.shadowColor = hexA(PAL[col].b, 0.55); c.shadowBlur = cs * 0.45 * UI.dpr;
      ROT[p.t][p.s].forEach(([r, cc]) => { const yy = (UI.vy + r - HID) * cs; if (yy > -cs) c.drawImage(UI.spr[col], (UI.vx + cc) * cs, yy, cs, cs); });
      c.restore();
    }
  }
  function drawNext() {
    if (!nctx || !st || !st.next) return;
    const t = st.next, cells = ROT[t][0], d = UI.dpr, w = ncv.width / d, h = ncv.height / d;
    const minC = Math.min(...cells.map((q) => q[1])), maxC = Math.max(...cells.map((q) => q[1])), minR = Math.min(...cells.map((q) => q[0])), maxR = Math.max(...cells.map((q) => q[0]));
    const s = Math.min(14, Math.floor(Math.min(w / (maxC - minC + 1.4), h / (maxR - minR + 1.4)))), ox = (w - (maxC - minC + 1) * s) / 2, oy = (h - (maxR - minR + 1) * s) / 2;
    nctx.setTransform(d, 0, 0, d, 0, 0); nctx.clearRect(0, 0, w, h);
    const spr = UI.spr[TYPES.indexOf(t)]; if (!spr) return;
    cells.forEach(([r, c]) => nctx.drawImage(spr, ox + (c - minC) * s, oy + (r - minR) * s, s, s));
    const box = root.querySelector('.st-next'); if (box) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }

  /* ---------- Boucle ---------- */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = last ? (now - last) / 1000 : 0; last = now; if (dt > 0.05) dt = 0.05;
    if (UI.screen !== 'game') return;
    update(dt);
    if (UI.dead >= 0) UI.dead += dt;
    draw(dt);
    UI.clock += dt; if (UI.clock > 0.2 || UI.scoreDirty) { UI.clock = 0; hud(); }
  }
  function startLoop() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  /* =====================================================================
     INTERFACE
     ===================================================================== */
  function face(k, ms) {
    const img = root && root.querySelector('.st-milo img'); if (!img) return;
    clearTimeout(UI.faceT);
    if (UI.face !== k) { UI.face = k; img.src = faceSrc(k); }
    img.classList.remove('hop'); void img.offsetWidth; img.classList.add('hop');
    UI.faceT = ms ? setTimeout(() => { UI.faceT = 0; if (st && !st.over) face(stackTop() - HID < 8 ? 'focus' : 'idle'); }, ms) : 0;
  }
  function say(text, kind, ms) {
    const b = root && root.querySelector('.st-bub'); if (!b) return;
    clearTimeout(UI.bubT); b.textContent = text; b.className = 'st-bub ' + (kind || ''); void b.offsetWidth; b.classList.add('show');
    UI.bubT = setTimeout(() => b.classList.remove('show'), ms || 1400);
  }
  function floatText(text, col, row, big, kind) {
    if (!root || !cv) return;
    const [x, y] = boardXY(col, row), f = document.createElement('div');
    f.className = 'st-float' + (big ? ' big' : '') + (kind ? ' ' + kind : ''); f.textContent = text;
    f.style.left = clamp(x, 70, root.clientWidth - 70) + 'px'; f.style.top = y + 'px';
    root.parentNode.appendChild(f); setTimeout(() => f.remove(), 1050);
  }
  function showChain() {
    const el = root.querySelector('.st-chain'); if (!el) return;
    el.innerHTML = `${MG.icon('flame')}Combo ×${st.chain}`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function setHud(k, v) { const el = UI.hud[k]; if (el && el._v !== v) { el._v = v; el.textContent = v; } }
  function hud() {
    if (!root || !st) return;
    if (UI.scoreDirty) { UI.scoreDirty = false; tweenScore(); }
    setHud('level', String(st.level));
    const ch = CHD();
    if (ch) {
      const g = goalProgress(); setHud('goal', g.fmt ? `${MG.fmt(g.v)} / ${MG.fmt(g.n)}` : `${g.v} / ${g.n}`); setHud('goalLbl', g.label);
      const left = ch.limit ? ch.limit - st.time : null; setHud('time', fmtT(left != null ? left : st.time));
      const tEl = UI.hud.time; if (tEl) tEl.parentNode.classList.toggle('hurry', left != null && left <= 15);
      if (left != null && left <= 10 && Math.ceil(left) !== UI.lastTick && !st.paused && UI.screen === 'game') { UI.lastTick = Math.ceil(left); MG.sfx.play('warn'); }
    } else setHud('lines', String(st.lines));
  }
  function tweenScore() {
    const el = UI.hud.score; if (!el) return;
    const from = UI.shown, to = st.score; if (from === to) return;
    cancelAnimationFrame(UI.scoreRaf); const t0 = performance.now(), dur = Math.min(600, 180 + (to - from) * 0.6);
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), v = Math.round(from + (to - from) * ease(k)); el.textContent = MG.fmt(v); if (k < 1 && root) UI.scoreRaf = requestAnimationFrame(step); };
    UI.shown = to; UI.scoreRaf = requestAnimationFrame(step);
    if (to - from >= 50) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  function gameHTML() {
    const ch = CHD(), d = api.data;
    const info = ch
      ? `<div class="st-pill"><span data-k="goalLbl">Objectif</span><b data-k="goal">0</b></div><div class="st-pill"><span>${ch.limit ? 'Restant' : 'Temps'}</span><b data-k="time">0:00</b></div><div class="st-pill"><span>Niveau</span><b data-k="level">1</b></div>`
      : `<div class="st-pill"><span>Niveau</span><b data-k="level">1</b></div><div class="st-pill"><span>Lignes</span><b data-k="lines">0</b></div><div class="st-pill st-best${st.score > st.best0 && st.best0 ? ' rec' : ''}"><span>${MG.icon('crown')}Record</span><b>${MG.fmt(d.best || 0)}</b></div>`;
    return `<div class="st-game">
      <div class="st-top"><button class="gclose" data-st="pause" aria-label="Pause">${MG.icon('pause')}</button>
        <div class="st-score"><small>${ch ? ch.name : 'Score'}</small><b data-k="score">${MG.fmt(st.score)}</b><div class="st-chain"></div></div>
        <div class="st-next" aria-label="Pièce suivante"><span>Suivante</span><canvas></canvas></div></div>
      <div class="st-info">${info}</div>
      <div class="st-wrap"><div class="st-board"><canvas class="st-cv" role="img" aria-label="Plateau de Milo Stacks"></canvas>
        <div class="st-milo"><div class="st-bub"></div><img src="${faceSrc('idle')}" alt="" draggable="false"></div></div></div>
    </div>`;
  }
  function buildGame() {
    root.querySelectorAll('.st-game').forEach((e) => e.remove());
    root.insertAdjacentHTML('afterbegin', gameHTML());
    cv = root.querySelector('.st-cv'); ctx = cv.getContext('2d');
    ncv = root.querySelector('.st-next canvas'); nctx = ncv.getContext('2d');
    UI.hud = {}; root.querySelectorAll('[data-k]').forEach((e) => (UI.hud[e.dataset.k] = e));
    UI.face = 'idle'; UI.shown = st.score;
    layout(); drawNext(); hud();
  }
  function layout() {
    if (!cv) return;
    const wrap = root.querySelector('.st-wrap'); if (!wrap) return;
    const r = wrap.getBoundingClientRect(), cs0 = UI.cs;
    UI.dpr = Math.min(2, window.devicePixelRatio || 1);
    UI.cs = Math.max(14, Math.floor(Math.min((r.width - 28) / COLS, (r.height - 56) / ROWS)));
    cv.width = UI.cs * COLS * UI.dpr; cv.height = UI.cs * ROWS * UI.dpr; cv.style.width = UI.cs * COLS + 'px'; cv.style.height = UI.cs * ROWS + 'px';
    ncv.width = 52 * UI.dpr; ncv.height = 34 * UI.dpr; ncv.style.width = '52px'; ncv.style.height = '34px';
    if (cs0 !== UI.cs || !UI.bg || UI.bgDpr !== UI.dpr) { UI.bgDpr = UI.dpr; buildSprites(); }
    drawNext(); draw(0);
  }

  /* ---------- Démarrage, pause, fin ---------- */
  function startGame(mode, ch, resume) {
    closeScreens(); closeModal();
    const d = api.data;
    if (resume && d.current) { st = Object.assign(blank('classic', null), d.current, { paused: false, over: false, won: false, clearing: null, best0: d.best || 0 }); }
    else {
      st = blank(mode, ch);
      if (ch && ch.goal === 'dig') addGarbage(ch.garbage);
      if (mode === 'classic') d.current = null;
    }
    UI.screen = 'game'; UI.dead = -1; UI.fall = null; UI.land = null; UI.trail = null; UI.shake = 0; UI.warnAt = -99; UI.lastTick = null;
    buildGame();
    if (!st.piece) spawn(); else { UI.vx = st.piece.x; UI.vy = st.piece.y; UI.spawnT = 1; }
    startLoop();
    if (!d.seenHelp) { st.paused = true; showHelp(); }
    else if (ch) { st.paused = true; showChIntro(ch); }
    else setTimeout(() => { if (root && st && !st.over) { face('joie', 1200); say(resume ? 'On reprend !' : 'C’est parti !', '', 1200); } }, 250);
    d.stats.games = (d.stats.games || 0) + (resume ? 0 : 1); api.save();
  }
  function persist() {
    const d = api.data; if (!st || st.mode !== 'classic') return;
    if (st.over) { d.current = null; api.save(); return; }
    if (!st.piece && !st.clearing) return;
    const keep = ['grid', 'piece', 'next', 'bag', 'score', 'lines', 'level', 'startLv', 'chain', 'maxChain', 'quads', 'b2b', 'pieces', 'time', 'mode', 'nearShown', 'recShown'];
    const cur = {}; keep.forEach((k) => (cur[k] = st[k])); cur.grid = st.grid.slice(); cur.piece = st.piece ? { ...st.piece } : null;
    if (st.clearing) { // on enregistre l'état après la suppression
      const rows = st.clearing.rows, g = Array(TOT * COLS).fill(-1); let dst = TOT - 1;
      for (let r = TOT - 1; r >= 0; r--) { if (rows.includes(r)) continue; for (let c = 0; c < COLS; c++) g[dst * COLS + c] = st.grid[r * COLS + c]; dst--; }
      cur.grid = g; cur.piece = null;
    }
    cur.at = new Date().toISOString(); d.current = cur; api.save();
  }
  function pause() {
    if (!st || st.over || st.won || st.paused || UI.screen !== 'game') return;
    st.paused = true; endPtr(); persist(); MG.sfx.play('tap');
    modal(`<div class="gpanel st-panel"><img class="mas" src="${faceSrc('clin')}" alt=""><h3>Pause</h3>
      <p>${CHD() ? CHD().name + ' · ' + fmtT(st.time) : 'Score : <b>' + MG.fmt(st.score) + '</b> · niveau ' + st.level}</p>
      <div class="acts"><button class="gbtn" data-st="resume">${MG.icon('play')}Reprendre</button>
      <button class="gbtn light" data-st="restart">${MG.icon('redo')}Recommencer</button>
      <button class="gbtn light" data-st="quit">Quitter la partie</button>
      <div class="st-prow">${MG.soundBtn()}<span>Son</span></div></div></div>`);
  }
  function resume() { if (!st) return; closeModal(); st.paused = false; last = 0; }
  function modal(html) { closeModal(); const m = document.createElement('div'); m.className = 'gmodal st-modal'; m.innerHTML = html; root.appendChild(m); return m; }
  function closeModal() { root && root.querySelectorAll('.st-modal').forEach((m) => m.remove()); }

  function recordGame(won) {
    const d = api.data, s = d.stats;
    s.lines = (s.lines || 0) + st.lines; s.bestCombo = Math.max(s.bestCombo || 0, st.maxChain); s.maxLevel = Math.max(s.maxLevel || 0, st.level);
    s.quads = (s.quads || 0) + st.quads; s.pieces = (s.pieces || 0) + st.pieces; s.time = (s.time || 0) + Math.round(st.time); s.finished = (s.finished || 0) + 1;
    const ch = CHD();
    d.history = [{ score: st.score, lines: st.lines, level: st.level, mode: st.mode, ch: ch ? ch.name : null, won: !!won, at: new Date().toISOString() }, ...(d.history || [])].slice(0, 20);
  }
  async function gameOver() {
    if (st.over) return; st.over = true; endPtr();
    const d = api.data, ch = CHD();
    UI.dead = 0; MG.sfx.play('over'); face('dodo'); say(LOSE_LINES[Math.floor(Math.random() * LOSE_LINES.length)], '', 2200); vibrate(40);
    if (ch) { recordGame(false); api.save(); await MG.wait(900); if (root && st && st.over) showChResult(false, 'top'); return; }
    const prev = d.best || 0, record = st.score > prev;
    d.best = Math.max(prev, st.score); d.stats.totalScore = (d.stats.totalScore || 0) + st.score;
    recordGame(false); d.current = null; api.save();
    await MG.wait(1100); if (!root || !st || !st.over || UI.screen !== 'game') return;
    if (record) { api.fx.confetti(100); MG.sfx.play('record'); }
    modal(`<div class="gpanel st-panel"><img class="mas" src="${faceSrc(record ? 'bravo' : 'amour')}" alt=""><h3>${record ? (prev ? 'Nouveau record !' : 'Premier record !') : 'Partie terminée'}</h3>
      <div class="big">${MG.fmt(st.score)}</div><p>${record ? (prev ? 'Ancien record : ' + MG.fmt(prev) : 'À toi de le battre maintenant !') : LOSE_LINES[Math.floor(Math.random() * LOSE_LINES.length)] + ' Record : ' + MG.fmt(d.best)}</p>
      <div class="st-sum"><div><b>${st.lines}</b><span>lignes</span></div><div><b>${st.level}</b><span>niveau</span></div><div><b>×${st.maxChain}</b><span>combo max</span></div></div>
      <div class="acts"><button class="gbtn" data-st="again">${MG.icon('redo')}Rejouer</button><button class="gbtn light" data-st="home">Accueil Milo Stacks</button></div></div>`);
  }
  function starsFor(ch, t) { return 1 + (t <= ch.t[0] ? 1 : 0) + (t <= ch.t[1] ? 1 : 0); }
  function winChallenge() {
    const ch = CHD(); if (!ch || st.won) return; st.won = true; endPtr();
    const d = api.data, rec = (d.challenges = d.challenges || {})[ch.id] || {}, stars = starsFor(ch, st.time);
    const better = !rec.best || st.time < rec.best;
    d.challenges[ch.id] = { stars: Math.max(rec.stars || 0, stars), best: better ? Math.round(st.time) : rec.best, done: (rec.done || 0) + 1 };
    recordGame(true); api.save();
    MG.sfx.play('record'); api.fx.confetti(90); face('bravo', 2000);
    setTimeout(() => { if (root && st && st.won) showChResult(true, null, stars, better); }, 700);
  }
  function failChallenge(why) { if (st.over || st.won) return; st.over = true; endPtr(); recordGame(false); api.save(); MG.sfx.play('over'); face('dodo'); say(why === 'time' ? 'Le temps est écoulé…' : 'Oups !', '', 1800); setTimeout(() => { if (root && st && st.over) showChResult(false, why); }, 800); }
  function showChResult(win, why, stars, better) {
    const ch = CHD(), i = CH.indexOf(ch), nx = CH[i + 1], g = goalProgress();
    const starRow = [0, 1, 2].map((k) => `<i class="${win && k < stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.28}s">${MG.icon('star')}</i>`).join('');
    const m = modal(`<div class="gpanel st-panel"><img class="mas" src="${faceSrc(win ? 'bravo' : 'dodo')}" alt=""><h3>${win ? 'Défi réussi !' : 'Défi raté'}</h3>
      <p class="st-chname">${ch.name}</p>
      ${win ? `<div class="st-stars">${starRow}</div><p>Temps : <b>${fmtT(st.time)}</b>${better ? ' · meilleur temps !' : ''}</p><p class="tiny">★★ en moins de ${fmtT(ch.t[0])} · ★★★ en moins de ${fmtT(ch.t[1])}</p>`
        : `<p>${why === 'time' ? 'Le temps est écoulé.' : 'La pile a touché le plafond.'} ${g ? `${g.label} : ${g.fmt ? MG.fmt(g.v) : g.v} / ${g.fmt ? MG.fmt(g.n) : g.n}` : ''}</p>`}
      <div class="acts">${win && nx ? `<button class="gbtn" data-st="ch" data-id="${nx.id}">${MG.icon('play')}Défi suivant</button>` : ''}
        <button class="gbtn ${win && nx ? 'light' : ''}" data-st="ch" data-id="${ch.id}">${MG.icon('redo')}${win ? 'Rejouer' : 'Réessayer'}</button>
        <button class="gbtn light" data-st="defis">Tous les défis</button></div></div>`);
    if (win) m.querySelectorAll('.st-stars i.on').forEach((el, k) => setTimeout(() => MG.sfx.play('star'), 250 + k * 280));
  }
  function showHelp() {
    const m = modal(`<div class="gpanel st-panel st-help"><img class="mas" src="${faceSrc('joie')}" alt=""><h3>Comment jouer</h3>
      <ul class="st-how">
        <li><span>${ico('swipe')}</span><div><b>Glisse</b> à gauche ou à droite pour déplacer la pièce</div></li>
        <li><span>${ico('tap')}</span><div><b>Touche</b> l’écran pour la faire tourner</div></li>
        <li><span>${ico('hold')}</span><div><b>Maintiens</b> ton doigt pour la faire descendre plus vite</div></li>
        <li><span>${ico('flick')}</span><div><b>Glisse vite vers le bas</b> pour la poser d’un coup</div></li>
      </ul><p>Complète des lignes pour les faire disparaître. Enchaîne-les pour les combos !</p>
      <div class="acts"><button class="gbtn" data-st="helpok">${MG.icon('play')}C’est compris !</button></div></div>`);
    return m;
  }
  function showChIntro(ch) {
    modal(`<div class="gpanel st-panel"><img class="mas" src="${faceSrc('focus')}" alt=""><h3>${ch.name}</h3><p>${ch.desc}</p>
      <div class="st-sum"><div><b>${ch.limit ? fmtT(ch.limit) : '∞'}</b><span>temps</span></div><div><b>${ch.lv}</b><span>niveau</span></div><div><b>${fmtT(ch.t[1])}</b><span>pour ★★★</span></div></div>
      <div class="acts"><button class="gbtn" data-st="go">${MG.icon('play')}C’est parti !</button><button class="gbtn light" data-st="defis">Retour</button></div></div>`);
  }

  /* ---------- Écrans : accueil, défis, records ---------- */
  function totalStars() { const c = api.data.challenges || {}; return CH.reduce((s, ch) => s + ((c[ch.id] || {}).stars || 0), 0); }
  function screen(name) {
    stopLoop(); closeModal(); endPtr();
    if (st && UI.screen === 'game' && !st.over && !st.won && st.mode === 'classic') persist();
    UI.screen = name;
    root.querySelectorAll('.st-scr').forEach((e) => e.remove());
    const d = api.data, s = d.stats || {}, cur = d.current;
    const el = document.createElement('div'); el.className = 'st-scr gscroll st-' + name;
    const topbar = (back) => `<div class="gtop st-stop">${back ? `<button class="gclose" data-st="home" aria-label="Retour">${ico('back')}</button>` : ''}<div class="grow"></div>${MG.soundBtn()}<button class="gclose" data-st="exit" aria-label="Fermer Milo Stacks">${MG.icon('x')}</button></div>`;
    if (name === 'home') {
      el.innerHTML = `${topbar(false)}<div class="st-in">
        <img class="st-logo" src="${MG.asset('logo_stacks.webp')}" alt="Milo Stacks" draggable="false">
        <div class="st-card">
          <div class="st-bestrow"><span>${MG.icon('crown')}Meilleur score</span><b>${MG.fmt(d.best || 0)}</b></div>
          <div class="st-acts">${cur ? `<button class="gbtn" data-st="resume-saved">${MG.icon('play')}Reprendre (${MG.fmt(cur.score)})</button><button class="gbtn light" data-st="classic">Nouvelle partie</button>` : `<button class="gbtn st-play" data-st="classic">${MG.icon('play')}Jouer</button>`}</div>
          <div class="st-modes">
            <button class="st-mode" data-st="defis"><span class="st-mi">${ico('target')}</span><b>Défis</b><em>${totalStars()} / ${CH.length * 3} ${MG.icon('star')}</em></button>
            <button class="st-mode" data-st="records"><span class="st-mi">${ico('chart')}</span><b>Records</b><em>${MG.fmt(s.lines || 0)} lignes</em></button>
            <button class="st-mode" data-st="help"><span class="st-mi">${MG.icon('help')}</span><b>Règles</b><em>4 gestes</em></button>
          </div>
        </div>
        <img class="st-hmilo" src="${faceSrc('clin')}" alt="" draggable="false"></div>`;
    } else if (name === 'defis') {
      const c = d.challenges || {};
      el.innerHTML = `${topbar(true)}<div class="st-in"><h2 class="st-h">Défis <span>${totalStars()} / ${CH.length * 3} ${MG.icon('star')}</span></h2>
        <div class="st-chlist">${CH.map((ch, i) => {
          const r = c[ch.id] || {}, open = i === 0 || (c[CH[i - 1].id] || {}).stars > 0;
          return `<button class="st-ch${open ? '' : ' locked'}${r.stars ? ' done' : ''}" ${open ? `data-st="ch" data-id="${ch.id}"` : 'disabled'}>
            <span class="st-chn">${open ? i + 1 : MG.icon('lock')}</span><span class="st-cht"><b>${ch.name}</b><em>${open ? ch.desc : 'Termine le défi précédent'}</em>
            ${r.best ? `<small>${ico('clock')}${fmtT(r.best)}</small>` : ch.limit ? `<small>${ico('clock')}${fmtT(ch.limit)} max</small>` : ''}</span>
            <span class="st-chs">${[0, 1, 2].map((k) => `<i class="${k < (r.stars || 0) ? 'on' : ''}">${MG.icon('star')}</i>`).join('')}</span></button>`;
        }).join('')}</div></div>`;
    } else if (name === 'records') {
      const h = d.history || [];
      const tile = (l, v, i) => `<div><span>${i}${l}</span><b>${v}</b></div>`;
      el.innerHTML = `${topbar(true)}<div class="st-in"><h2 class="st-h">Records</h2>
        <div class="st-rgrid">${tile('Meilleur score', MG.fmt(d.best || 0), MG.icon('crown'))}${tile('Lignes au total', MG.fmt(s.lines || 0), '')}${tile('Meilleur combo', '×' + (s.bestCombo || 0), MG.icon('flame'))}${tile('Niveau max', s.maxLevel || 0, '')}${tile('Parties', MG.fmt(s.finished || 0), '')}${tile('Étoiles', totalStars() + ' / ' + CH.length * 3, MG.icon('star'))}</div>
        <h3 class="st-h3">${MG.icon('trophy')}Dernières parties</h3>
        ${h.length ? `<div class="st-hist">${h.slice(0, 12).map((g) => `<div><span class="st-hm ${g.mode === 'classic' ? '' : g.won ? 'w' : 'l'}">${g.mode === 'classic' ? 'Classique' : g.ch}</span><b>${MG.fmt(g.score)}</b><em>${g.lines} l. · niv. ${g.level}</em><time>${new Date(g.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</time></div>`).join('')}</div>` : '<p class="st-empty">Joue ta première partie pour remplir cet historique.</p>'}</div>`;
    }
    root.appendChild(el);
    root.querySelectorAll('.st-game').forEach((e) => e.classList.toggle('hidden', true));
  }
  function closeScreens() { root.querySelectorAll('.st-scr').forEach((e) => { e.classList.add('out'); setTimeout(() => e.remove(), 260); }); }

  /* ---------- Contrôles tactiles ---------- */
  function endPtr() { clearTimeout(UI.holdT); if (st) st.soft = false; UI.ptr = null; }
  function onDown(e) {
    if (UI.screen !== 'game' || e.target.closest('button, .gmodal, .st-scr') || e.button > 0) return;
    if (!playing()) return;
    e.preventDefault(); try { root.setPointerCapture(e.pointerId); } catch (_) {}
    const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, cx: e.clientX, cy: e.clientY, t0: performance.now(), lt: performance.now(), ly: e.clientY, vy: 0, moved: false, soft: false, done: false, used: false };
    UI.ptr = p; clearTimeout(UI.holdT);
    UI.holdT = setTimeout(() => { if (UI.ptr === p && !p.moved && !p.done && playing()) { p.soft = true; st.soft = true; } }, 190);
  }
  function onMove(e) {
    const p = UI.ptr; if (!p || e.pointerId !== p.id) return;
    const now = performance.now(), x = e.clientX, y = e.clientY;
    p.vy = p.vy * 0.4 + ((y - p.ly) / Math.max(1, now - p.lt)) * 0.6; p.ly = y; p.lt = now; p.cx = x; p.cy = y;
    if (p.done || !playing()) return;
    const step = Math.max(14, UI.cs * 0.82);
    let dx = x - p.lx;
    while (dx >= step) { if (move(1)) { p.lx += step; dx -= step; p.moved = true; } else { p.lx = x; break; } }
    while (dx <= -step) { if (move(-1)) { p.lx -= step; dx += step; p.moved = true; } else { p.lx = x; break; } }
    const dy = y - p.y0, adx = Math.abs(x - p.x0);
    if (Math.abs(dx) > 6) p.moved = true;
    if (dy > UI.cs * 1.4 && p.vy > 1.0 && adx < dy * 0.7) { p.done = true; p.moved = true; st.soft = false; hardDrop(); return; }
    if (dy > UI.cs * 0.9 && adx < dy) { p.moved = true; if (!p.soft) { p.soft = true; st.soft = true; } }
  }
  function onUp(e) {
    const p = UI.ptr; if (!p || e.pointerId !== p.id) return;
    clearTimeout(UI.holdT);
    const dt = performance.now() - p.t0, dist = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
    if (st) st.soft = false;
    if (!p.moved && !p.soft && !p.done && !p.used && dt < 280 && dist < 14 && playing()) rotate(1);
    UI.ptr = null;
  }
  function onTouch(e) { if (UI.screen === 'game' && e.cancelable && !e.target.closest('button, .gmodal, .st-scr')) e.preventDefault(); }
  function onKey(e) {
    if (UI.screen !== 'game' || !st) return;
    const k = e.code, down = e.type === 'keydown';
    if (!down) { if (k === 'ArrowDown') st.soft = false; return; }
    if (k === 'KeyP' || k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (st.paused) resume(); else pause(); return; }
    if (!playing()) return;
    if (k === 'ArrowLeft') { e.preventDefault(); move(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); move(1); }
    else if (k === 'ArrowUp' || k === 'KeyX') { e.preventDefault(); if (!e.repeat) rotate(1); }
    else if (k === 'KeyZ') { e.preventDefault(); if (!e.repeat) rotate(-1); }
    else if (k === 'ArrowDown') { e.preventDefault(); st.soft = true; }
    else if (k === 'Space') { e.preventDefault(); if (!e.repeat) hardDrop(); }
  }
  function onVis() { if (document.hidden) pause(); }

  function onClick(e) {
    const b = e.target.closest('[data-st]'); if (!b) return;
    const a = b.dataset.st;
    if (a !== 'pause') MG.sfx.play('tap');
    if (a === 'pause') pause();
    else if (a === 'resume') resume();
    else if (a === 'restart') { const ch = CHD(); if (st.mode === 'classic') { api.data.current = null; } startGame(st.mode, ch, false); }
    else if (a === 'quit') { persist(); screen(CHD() ? 'defis' : 'home'); }
    else if (a === 'again' || a === 'classic') startGame('classic', null, false);
    else if (a === 'resume-saved') startGame('classic', null, true);
    else if (a === 'home') screen('home');
    else if (a === 'defis') screen('defis');
    else if (a === 'records') screen('records');
    else if (a === 'help') { modal(''); const m = showHelp(); m.querySelector('[data-st="helpok"]').dataset.st = 'helpclose'; }
    else if (a === 'helpclose') closeModal();
    else if (a === 'ch') { const ch = chById(b.dataset.id); if (ch) startGame('challenge', ch, false); }
    else if (a === 'helpok') { api.data.seenHelp = true; api.save(); closeModal(); const ch = CHD(); if (ch) showChIntro(ch); else { st.paused = false; last = 0; face('joie', 1200); say('C’est parti !', '', 1200); } }
    else if (a === 'go') { closeModal(); st.paused = false; last = 0; face('focus'); say('À toi de jouer !', '', 1100); }
    else if (a === 'exit') { if (st && UI.screen === 'game') persist(); api.close(); }
  }
  function onResize() { clearTimeout(rTimer); rTimer = setTimeout(() => { if (root && UI.screen === 'game') layout(); }, 80); }

  /* =====================================================================
     MODULE
     ===================================================================== */
  MG.register({
    id: 'stacks', name: 'Milo Stacks', logo: 'logo_stacks.webp', theme: 'stacks',
    mount(frame, a) {
      api = a; const d = api.data; d.stats = d.stats || {}; d.challenges = d.challenges || {};
      Object.values(FACE).forEach((f) => { const im = new Image(); im.src = `assets/${f}.webp`; });
      root = document.createElement('div'); root.className = 'st-root';
      root.innerHTML = '<div class="st-amb" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
      frame.insertBefore(root, frame.firstChild);
      st = null; UI.screen = 'home'; UI.bg = null;
      root.addEventListener('click', onClick);
      root.addEventListener('pointerdown', onDown); root.addEventListener('pointermove', onMove); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp);
      root.addEventListener('touchstart', onTouch, { passive: false });
      document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKey, true); document.addEventListener('visibilitychange', onVis);
      try { ro = new ResizeObserver(onResize); ro.observe(root); } catch (e) { window.addEventListener('resize', onResize); }
      screen('home');
    },
    unmount() {
      stopLoop(); clearTimeout(UI.faceT); clearTimeout(UI.bubT); clearTimeout(UI.holdT); clearTimeout(rTimer); cancelAnimationFrame(UI.scoreRaf);
      if (st && UI.screen === 'game' && !st.over && !st.won) persist();
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKey, true); document.removeEventListener('visibilitychange', onVis);
      try { ro && ro.disconnect(); } catch (e) {} ro = null; window.removeEventListener('resize', onResize);
      root = null; cv = null; ctx = null; ncv = null; nctx = null; st = null; UI.ptr = null; UI.screen = 'home';
    },
    card(d) {
      const s = d.stats || {}, c = d.challenges || {}, stars = CH.reduce((n, ch) => n + ((c[ch.id] || {}).stars || 0), 0);
      return { desc: 'Empile les pièces qui tombent, complète des lignes et grimpe de niveau. Mode classique, défis à étoiles et records.',
        stats: [['Record', MG.fmt(d.best || 0), 'crown'], ['Lignes', MG.fmt(s.lines || 0), 'grid'], ['Étoiles', `${stars}/${CH.length * 3}`, 'star']],
        progress: null, cta: d.current ? `Reprendre la partie (${MG.fmt(d.current.score)})` : 'Jouer' };
    },
    homeLine(d) { return `Milo Stacks record ${MG.fmt(d.best || 0)}`; },
    _debug: { state: () => st, ui: UI, CH, ROT, fits: (...a) => fits(...a), move, rotate, hardDrop, spawn, start: (m, id) => startGame(m, id ? chById(id) : null, false), screen, gravity, lock, layout }
  });

  /* =====================================================================
     STYLES
     ===================================================================== */
  const css = `
  .gscreen.stacks{background:radial-gradient(circle at 10% 0%,rgba(124,92,255,.55),transparent 42%),radial-gradient(circle at 100% 28%,rgba(59,130,246,.4),transparent 46%),radial-gradient(circle at 15% 100%,rgba(236,72,153,.26),transparent 46%),linear-gradient(170deg,#1c1560,#130e40 55%,#0c0a2b)}
  .gcard.stacks .gcard-art{background:radial-gradient(circle at 20% 18%,rgba(255,126,215,.55),transparent 46%),radial-gradient(circle at 85% 85%,rgba(56,189,248,.55),transparent 50%),linear-gradient(160deg,#3b2aa8,#6c4cf1 55%,#9b5cf6)}
  .st-root{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;z-index:1;color:#fff;touch-action:none}
  .st-amb{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:-1}
  .st-amb i{position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 12px 3px rgba(190,160,255,.8);opacity:.0;animation:stTw 5s ease-in-out infinite}
  .st-amb i:nth-child(1){left:8%;top:18%}.st-amb i:nth-child(2){left:88%;top:12%;animation-delay:-1.4s;width:4px;height:4px}.st-amb i:nth-child(3){left:93%;top:58%;animation-delay:-2.6s}.st-amb i:nth-child(4){left:4%;top:70%;animation-delay:-3.4s;width:4px;height:4px}.st-amb i:nth-child(5){left:52%;top:5%;animation-delay:-.7s;width:3px;height:3px}
  @keyframes stTw{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:.75;transform:scale(1)}}
  .st-root .gclose{background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
  .st-game{flex:1;display:flex;flex-direction:column;min-height:0}.st-game.hidden{visibility:hidden}
  .st-top{display:flex;align-items:center;gap:10px;padding:12px 14px 2px}
  .st-score{flex:1;text-align:center;line-height:1;position:relative;min-width:0}
  .st-score small{display:block;font-size:11px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;color:#b9a8ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .st-score b{display:inline-block;margin-top:3px;font-size:34px;font-weight:900;letter-spacing:-1px;background:linear-gradient(180deg,#fff,#cdbdff);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums;filter:drop-shadow(0 4px 12px rgba(140,100,255,.45))}
  .st-score b.bump{animation:stBump .36s cubic-bezier(.34,1.7,.5,1)}
  @keyframes stBump{40%{transform:scale(1.14)}}
  .st-chain{position:absolute;left:50%;bottom:-20px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:4px;padding:2px 9px 2px 6px;border-radius:12px;background:linear-gradient(135deg,#ff9a4d,#ff4f8b);font-size:12px;font-weight:900;white-space:nowrap;opacity:0;pointer-events:none;box-shadow:0 4px 12px rgba(255,90,120,.45)}
  .st-chain .gi{width:13px;height:13px;fill:#fff3b3;stroke:#fff}
  .st-chain.show{animation:stChain 1.5s ease forwards}
  @keyframes stChain{0%{opacity:0;transform:translate(-50%,6px) scale(.6)}15%{opacity:1;transform:translate(-50%,0) scale(1.12)}25%{transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0}}
  .st-next{width:64px;height:52px;flex:none;border-radius:16px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
  .st-next span{font-size:8.5px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#b9a8ff}
  .st-next.pop canvas{animation:stPop .3s cubic-bezier(.34,1.7,.5,1)}
  @keyframes stPop{0%{transform:scale(.5);opacity:.3}100%{transform:none;opacity:1}}
  .st-info{display:flex;justify-content:center;gap:8px;padding:10px 14px 0}
  .st-pill{min-width:74px;padding:5px 10px 6px;border-radius:14px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);text-align:center;line-height:1.1}
  .st-pill span{display:flex;align-items:center;justify-content:center;gap:3px;font-size:9.5px;font-weight:900;letter-spacing:.9px;text-transform:uppercase;color:#a99cf0;white-space:nowrap}
  .st-pill span .gi{width:11px;height:11px;fill:#ffcf3a;stroke:#e19c00}
  .st-pill b{display:inline-block;font-size:16px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
  .st-pill b.up{animation:stBump .5s cubic-bezier(.34,1.7,.5,1)}
  .st-pill.rec{background:linear-gradient(160deg,rgba(255,216,77,.3),rgba(255,160,40,.2));box-shadow:inset 0 0 0 1px rgba(255,216,77,.5)}
  .st-pill.hurry{background:rgba(255,80,130,.25);box-shadow:inset 0 0 0 1px rgba(255,120,160,.6);animation:stHurry 1s ease-in-out infinite}
  @keyframes stHurry{50%{transform:scale(1.06)}}
  .st-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:30px 0 max(12px,env(safe-area-inset-bottom,0px))}
  .st-board{position:relative;padding:6px;border-radius:20px;background:linear-gradient(180deg,rgba(52,38,140,.85),rgba(24,17,74,.9));box-shadow:0 0 0 1.5px rgba(167,139,250,.38),0 0 34px rgba(124,92,255,.35),0 22px 44px rgba(5,0,30,.55),inset 0 1px 0 rgba(255,255,255,.18)}
  .st-cv{display:block;border-radius:14px;touch-action:none}
  .st-milo{position:absolute;right:-12px;top:-50px;width:54px;height:54px;z-index:3;pointer-events:none}
  .st-milo img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(10,0,50,.45));animation:stMilo 3.2s ease-in-out infinite;transform-origin:50% 100%}
  .st-milo img.hop{animation:stHop .45s cubic-bezier(.34,1.7,.5,1),stMilo 3.2s .45s ease-in-out infinite}
  @keyframes stMilo{50%{transform:translateY(-3px) scale(1.02,.98)}}
  @keyframes stHop{0%{transform:scale(.8,1.15)}50%{transform:translateY(-10px) scale(1.06,.95)}100%{transform:none}}
  .st-bub{position:absolute;right:58px;top:8px;padding:6px 11px;border-radius:14px 14px 4px 14px;background:#fff;color:#4b2fc9;font-size:13px;font-weight:900;white-space:nowrap;box-shadow:0 6px 16px rgba(10,0,60,.35);opacity:0;transform:scale(.6) translateY(6px);transform-origin:100% 100%;transition:opacity .18s,transform .25s cubic-bezier(.34,1.7,.5,1)}
  .st-bub.show{opacity:1;transform:none}
  .st-bub.gold{background:linear-gradient(160deg,#fff6c9,#ffe07a);color:#8a4b00}.st-bub.warn{background:#ffe9f1;color:#c2185b}.st-bub.fire{background:linear-gradient(135deg,#ff9a4d,#ff4f8b);color:#fff}.st-bub.pop{background:linear-gradient(135deg,#8f6bff,#4f7bff);color:#fff}
  .st-float{position:absolute;z-index:42;transform:translate(-50%,-50%);font-size:22px;font-weight:900;color:#fff;-webkit-text-stroke:2px #6a3be0;paint-order:stroke fill;text-shadow:0 3px 0 #3d1f9c;pointer-events:none;animation:stFloat 1s ease-out forwards;white-space:nowrap}
  .st-float.big{font-size:28px}.st-float.name{color:#e9ddff;font-size:24px}.st-float.gold{font-size:32px;color:#fff2a6;-webkit-text-stroke-color:#d9480f;text-shadow:0 3px 0 #a33a0c}
  @keyframes stFloat{0%{opacity:0;transform:translate(-50%,-30%) scale(.5)}20%{opacity:1;transform:translate(-50%,-60%) scale(1.12)}100%{opacity:0;transform:translate(-50%,-180%) scale(1)}}
  .st-panel{color:#2a1f6b}.st-panel .tiny{font-size:12px;color:var(--muted);margin-top:2px}
  .st-prow{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:4px;font-weight:800;color:#6c5bb0;font-size:14px}
  .st-prow .gclose{background:#f1ebff;color:#5a33d6;box-shadow:none}
  .st-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 2px}
  .st-sum div{background:#f4efff;border-radius:14px;padding:8px 4px}.st-sum b{display:block;font-size:19px;font-weight:900;color:#4b2ab8}.st-sum span{font-size:11.5px;font-weight:800;color:var(--muted)}
  .st-chname{font-weight:900;color:#6c3ff0!important;margin-top:-2px!important}
  .st-stars{display:flex;justify-content:center;gap:6px;margin:6px 0 8px}
  .st-stars i{width:46px;height:46px;display:grid;place-items:center}
  .st-stars .gi{width:44px;height:44px;fill:#e7e0fb;stroke:#d6ccf5;stroke-width:1.2}
  .st-stars i.on{animation:stStar .5s cubic-bezier(.34,1.7,.5,1) both}.st-stars i.on .gi{fill:#ffcf3a;stroke:#e19c00}
  @keyframes stStar{0%{transform:scale(0) rotate(-40deg)}100%{transform:none}}
  .st-how{list-style:none;margin:6px 0 10px;padding:0;display:flex;flex-direction:column;gap:9px;text-align:left}
  .st-how li{display:flex;align-items:center;gap:12px;font-size:14px;color:#3a2f74;font-weight:600;line-height:1.3}
  .st-how li b{font-weight:900;color:#5a33d6}
  .st-how li>span{width:40px;height:40px;flex:none;border-radius:13px;display:grid;place-items:center;background:linear-gradient(160deg,#efe7ff,#e2d6ff);color:#6c3ff0}
  .st-how .gi{width:22px;height:22px;stroke-width:2.2}
  /* écrans */
  .st-scr{position:absolute;inset:0;z-index:20;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;animation:stIn .3s cubic-bezier(.22,1,.36,1)}
  .st-scr.out{opacity:0;transform:scale(1.03);transition:opacity .25s,transform .25s;pointer-events:none}
  @keyframes stIn{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:none}}
  .st-stop{position:sticky;top:0}
  .st-in{width:min(100%,420px);margin:0 auto;padding:0 16px max(24px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:center;position:relative}
  .st-logo{width:min(64%,250px);height:auto;margin-top:-6px;filter:drop-shadow(0 14px 26px rgba(10,0,60,.5));animation:gpop .6s cubic-bezier(.34,1.6,.5,1) both,stFloatLogo 4s 1s ease-in-out infinite}
  @keyframes stFloatLogo{50%{transform:translateY(-6px)}}
  .st-card{width:100%;margin-top:6px;border-radius:28px;padding:18px 16px 16px;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.07));box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 20px 44px rgba(5,0,30,.4);backdrop-filter:blur(10px);animation:gpop .5s .08s cubic-bezier(.34,1.6,.5,1) both}
  .st-bestrow{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 14px}
  .st-bestrow span{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:900;letter-spacing:.4px;text-transform:uppercase;color:#cbbcff}
  .st-bestrow .gi{width:18px;height:18px;fill:#ffcf3a;stroke:#e19c00}
  .st-bestrow b{font-size:26px;font-weight:900;font-variant-numeric:tabular-nums}
  .st-acts{display:flex;flex-direction:column;gap:10px}
  .st-acts .gbtn{width:100%}.st-play{font-size:19px!important;padding:17px 22px!important}
  .st-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
  .st-mode{border:0;border-radius:18px;padding:12px 6px 10px;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);color:#fff;display:flex;flex-direction:column;align-items:center;gap:3px;font:inherit;transition:transform .15s}
  .st-mode:active{transform:scale(.95)}
  .st-mi{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(150deg,#8f6bff,#4f7bff);box-shadow:0 6px 14px rgba(80,60,240,.45)}
  .st-mi .gi{width:20px;height:20px;color:#fff}
  .st-mode b{font-size:14px;font-weight:900;margin-top:3px}.st-mode em{display:flex;align-items:center;gap:3px;font-style:normal;font-size:11px;font-weight:800;color:#cbbcff;white-space:nowrap}
  .st-mode em .gi{width:11px;height:11px;fill:#ffcf3a;stroke:#e19c00}
  .st-hmilo{position:absolute;right:2px;top:calc(min(64vw,250px) * .7);width:58px;height:58px;object-fit:contain;filter:drop-shadow(0 8px 12px rgba(10,0,50,.5));animation:stMilo 3s ease-in-out infinite;pointer-events:none}
  .st-h{align-self:stretch;display:flex;align-items:center;justify-content:space-between;font-size:26px;font-weight:900;letter-spacing:-.5px;margin:4px 2px 12px}
  .st-h span{display:flex;align-items:center;gap:4px;font-size:15px;color:#cbbcff}.st-h span .gi{width:16px;height:16px;fill:#ffcf3a;stroke:#e19c00}
  .st-h3{align-self:stretch;display:flex;align-items:center;gap:7px;font-size:17px;font-weight:900;margin:18px 2px 10px}.st-h3 .gi{width:18px;height:18px;color:#ffcf3a}
  .st-chlist{align-self:stretch;display:flex;flex-direction:column;gap:9px}
  .st-ch{display:flex;align-items:center;gap:12px;width:100%;border:0;border-radius:20px;padding:12px 12px 12px 12px;text-align:left;font:inherit;color:#fff;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);transition:transform .15s}
  .st-ch:active{transform:scale(.98)}
  .st-ch.done{background:linear-gradient(120deg,rgba(143,107,255,.32),rgba(79,123,255,.2))}
  .st-ch.locked{opacity:.5}
  .st-chn{width:38px;height:38px;flex:none;border-radius:13px;display:grid;place-items:center;font-size:17px;font-weight:900;background:linear-gradient(150deg,#8f6bff,#4f7bff);box-shadow:0 5px 12px rgba(80,60,240,.4)}
  .st-ch.locked .st-chn{background:rgba(255,255,255,.14);box-shadow:none}.st-chn .gi{width:16px;height:16px}
  .st-cht{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .st-cht b{font-size:15px;font-weight:900}.st-cht em{font-style:normal;font-size:12.5px;color:#cbbcff;line-height:1.3}
  .st-cht small{display:flex;align-items:center;gap:4px;font-size:11.5px;font-weight:800;color:#9fe7ff}.st-cht small .gi{width:12px;height:12px}
  .st-chs{display:flex;gap:1px;flex:none}.st-chs .gi{width:17px;height:17px;fill:rgba(255,255,255,.15);stroke:rgba(255,255,255,.3);stroke-width:1.2}.st-chs i.on .gi{fill:#ffcf3a;stroke:#e19c00}
  .st-rgrid{align-self:stretch;display:grid;grid-template-columns:repeat(2,1fr);gap:9px}
  .st-rgrid div{border-radius:18px;padding:12px 12px 11px;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
  .st-rgrid span{display:flex;align-items:center;gap:4px;font-size:11.5px;font-weight:900;letter-spacing:.3px;text-transform:uppercase;color:#cbbcff}
  .st-rgrid span .gi{width:13px;height:13px;fill:#ffcf3a;stroke:#e19c00}
  .st-rgrid b{display:block;font-size:24px;font-weight:900;margin-top:3px;font-variant-numeric:tabular-nums}
  .st-hist{align-self:stretch;display:flex;flex-direction:column;gap:7px}
  .st-hist div{display:grid;grid-template-columns:1fr auto;grid-template-areas:"m s" "e t";align-items:center;gap:2px 10px;border-radius:16px;padding:9px 13px;background:rgba(255,255,255,.08)}
  .st-hm{grid-area:m;font-size:12px;font-weight:900;color:#cbbcff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.st-hm.w{color:#8ff0c9}.st-hm.l{color:#ffa8c8}
  .st-hist b{grid-area:s;font-size:18px;font-weight:900;font-variant-numeric:tabular-nums;text-align:right}
  .st-hist em{grid-area:e;font-style:normal;font-size:12px;color:#a99cf0}.st-hist time{grid-area:t;font-size:12px;color:#a99cf0;text-align:right}
  .st-empty{color:#cbbcff;font-size:14px;text-align:center;margin:8px 0}
  @media (prefers-reduced-motion:reduce){.st-amb i,.st-milo img,.st-logo,.st-hmilo,.st-pill.hurry{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
