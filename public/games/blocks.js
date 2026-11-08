/* =====================================================================
   Milo Blocks V2 — puzzle de blocs « gommes de Milo »
   Glisser-déposer sur une grille 8×8, lignes et colonnes, combos.
   Identité : gommes pastel translucides à symboles, plateau-coussin clair,
   Milo assis sur le plateau qui réagit, sons synthétisés discrets.
   Logique et format de sauvegarde identiques à la V1 (api.data.current).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames;
  const N = 8, GAP = 4;

  /* ---------- Gommes : couleur + symbole (index stables pour les sauvegardes) ---------- */
  const SYM = {
    lune: '<path d="M15.6 3.8a8 8 0 1 0 4.6 13.6A6.6 6.6 0 0 1 15.6 3.8z"/>',
    croix: '<rect x="9.2" y="3.5" width="5.6" height="17" rx="2.2"/><rect x="3.5" y="9.2" width="17" height="5.6" rx="2.2"/>',
    goutte: '<path d="M12 2.8s6.6 7 6.6 11.6a6.6 6.6 0 0 1-13.2 0C5.4 9.8 12 2.8 12 2.8z"/>',
    coeur: '<path d="M12 20.6S3.6 15.5 3.6 9.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.4 2.6c0 5.9-8.4 11-8.4 11z"/>',
    etoile: '<path d="m12 2.6 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>',
    feuille: '<path d="M4.5 19.5C4.5 10.6 10 4.5 20 4.5c0 10-6.1 15.5-15 15.5zm0 0 7-7"/>',
    fleur: '<circle cx="12" cy="6.6" r="3.6"/><circle cx="17.4" cy="10.6" r="3.6"/><circle cx="15.3" cy="16.9" r="3.6"/><circle cx="8.7" cy="16.9" r="3.6"/><circle cx="6.6" cy="10.6" r="3.6"/>'
  };
  const COLORS = [
    { a: '#dccbff', b: '#9464f6', s: 'lune', sh: 'rgba(120,70,230,.38)' },
    { a: '#bfe0ff', b: '#4a8cf6', s: 'croix', sh: 'rgba(60,120,240,.36)' },
    { a: '#c1f5ff', b: '#22b2d6', s: 'goutte', sh: 'rgba(20,160,210,.34)' },
    { a: '#ffd3ea', b: '#ee579f', s: 'coeur', sh: 'rgba(230,70,150,.34)' },
    { a: '#fff3b3', b: '#f2b20f', s: 'etoile', sh: 'rgba(225,160,0,.36)' },
    { a: '#c7f7df', b: '#2db983', s: 'feuille', sh: 'rgba(30,170,110,.34)' },
    { a: '#ffdcc6', b: '#f5834a', s: 'fleur', sh: 'rgba(240,120,60,.34)' }
  ];
  const svgUri = (p) => 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="0" stroke-linecap="round">${p}</svg>`) + '")';

  /* ---------- Expressions de Milo (assets officiels) ---------- */
  const FACE = { idle: 'v3_face', joie: 'v3_heureux', clin: 'v3_clin', wow: 'v3_alerte', bravo: 'v3_felicitations', focus: 'v3_determine', amour: 'v3_amour', dodo: 'v3_sommeil' };
  const faceSrc = (k) => `assets/${FACE[k] || k}.webp`;

  /* ---------- Formes (toutes orientations générées) ---------- */
  const BASE = [
    { c: [[0, 0]], w: 1.1, t: 0 },
    { c: [[0, 0], [0, 1]], w: 2, t: 0 },
    { c: [[0, 0], [0, 1], [0, 2]], w: 2.2, t: 0 },
    { c: [[0, 0], [0, 1], [0, 2], [0, 3]], w: 1.5, t: 1 },
    { c: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], w: 0.9, t: 2 },
    { c: [[0, 0], [0, 1], [1, 0], [1, 1]], w: 2.4, t: 0 },
    { c: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], w: 0.7, t: 2 },
    { c: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], w: 1, t: 1 },
    { c: [[0, 0], [1, 0], [1, 1]], w: 2, t: 0 },
    { c: [[0, 0], [1, 0], [2, 0], [2, 1]], w: 1.4, t: 1, mirror: 1 },
    { c: [[0, 0], [0, 1], [0, 2], [1, 1]], w: 1.2, t: 1 },
    { c: [[0, 1], [0, 2], [1, 0], [1, 1]], w: 1, t: 1, mirror: 1 },
    { c: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], w: 0.8, t: 2 },
    { c: [[0, 0], [1, 1]], w: 0.5, t: 1 }
  ];
  const norm = (cells) => { const mr = Math.min(...cells.map((x) => x[0])), mc = Math.min(...cells.map((x) => x[1])); return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); };
  const SHAPES = [];
  BASE.forEach((b) => {
    const seen = new Set(), variants = [];
    const forms = [b.c]; if (b.mirror) forms.push(b.c.map(([r, c]) => [r, -c]));
    forms.forEach((f) => { let cur = f; for (let i = 0; i < 4; i++) { const n = norm(cur), k = JSON.stringify(n); if (!seen.has(k)) { seen.add(k); variants.push(n); } cur = cur.map(([r, c]) => [c, -r]); } });
    variants.forEach((v) => SHAPES.push({ c: v, w: b.w / variants.length, t: b.t }));
  });

  /* ---------- État ---------- */
  let api = null, root = null, st = null;
  const UI = { cs: 40, busy: false, drag: null, cells: [], raf: 0, shown: 0, face: 'idle', faceT: 0, bubT: 0, dangerAt: -9, lastNear: -9 };

  function pickShape() {
    const d = Math.min(1, st.score / 5000), f = [1.25 - 0.55 * d, 0.85 + 0.45 * d, 0.45 + 0.9 * d];
    const tot = SHAPES.reduce((a, s) => a + s.w * f[s.t], 0); let x = Math.random() * tot;
    for (const s of SHAPES) { x -= s.w * f[s.t]; if (x <= 0) return s.c; }
    return SHAPES[0].c;
  }
  const fits = (cells, r0, c0, grid = st.grid) => cells.every(([r, c]) => { const rr = r0 + r, cc = c0 + c; return rr >= 0 && rr < N && cc >= 0 && cc < N && grid[rr * N + cc] < 0; });
  function fitsAnywhere(cells) { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(cells, r, c)) return true; return false; }
  function newTray() {
    for (let i = 0; i < 30; i++) {
      const tray = [0, 1, 2].map(() => ({ s: pickShape(), col: Math.floor(Math.random() * COLORS.length) }));
      if (tray.some((p) => fitsAnywhere(p.s))) return tray;
    }
    return [0, 1, 2].map(() => ({ s: [[0, 0]], col: Math.floor(Math.random() * COLORS.length) }));
  }
  function newGame() {
    st = { grid: Array(N * N).fill(-1), tray: null, score: 0, combo: 0, miss: 0, lines: 0, placed: 0, recordShown: false };
    st.tray = newTray();
    const s = api.data.stats; s.games = (s.games || 0) + 1;
    persist();
  }
  function persist() { api.data.current = st && !st.over ? { ...st } : null; api.save(); }

  /* ---------- Milo : expressions et bulle ---------- */
  function face(k, ms) {
    const img = root && root.querySelector('#bMilo'); if (!img) return;
    clearTimeout(UI.faceT);
    if (UI.face !== k) { UI.face = k; img.src = faceSrc(k); }
    img.classList.remove('hop'); void img.offsetWidth; img.classList.add('hop');
    UI.faceT = ms ? setTimeout(() => { UI.faceT = 0; if (st && !st.over) face(dangerLevel() > 0.62 ? 'focus' : 'idle'); }, ms) : 0;
  }
  function say(text, kind, ms) {
    const b = root && root.querySelector('#bBub'); if (!b) return;
    clearTimeout(UI.bubT);
    b.textContent = text; b.className = 'b-bub ' + (kind || ''); void b.offsetWidth; b.classList.add('show');
    UI.bubT = setTimeout(() => b.classList.remove('show'), ms || 1500);
  }
  const dangerLevel = () => st.grid.filter((v) => v >= 0).length / (N * N);

  /* ---------- Rendu ---------- */
  const setK = (el, col) => { if (el._k != null) el.classList.remove('k' + el._k); el._k = col; if (col != null && col >= 0) el.classList.add('k' + col); };
  function build() {
    const best = api.data.best || 0;
    root.innerHTML = `<div class="b-amb" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="gtop"><div class="b-best">${MG.icon('crown')}<b id="bBest">${MG.fmt(best)}</b></div><div class="grow"></div>${MG.soundBtn()}<button class="gclose" data-b="quit" aria-label="Quitter">${MG.icon('x')}</button></div>
      <div class="b-scorewrap"><span class="b-lbl">Score</span><div class="b-score" id="bScore">${MG.fmt(st.score)}</div><div class="b-combo" id="bCombo"></div></div>
      <div class="b-boardwrap" id="bWrap"><div class="b-stage"><div class="b-milo"><div class="b-bub" id="bBub"></div><img id="bMilo" src="${faceSrc('idle')}" alt="Milo" draggable="false"></div><div class="b-board" id="bBoard"></div></div></div>
      <div class="b-tray" id="bTray"></div>`;
    UI.face = 'idle';
    layout(); drawBoard(); drawTray(true); UI.shown = st.score;
  }
  function layout() {
    const f = root.getBoundingClientRect();
    const avW = f.width - 28, avH = f.height - 330;
    UI.cs = Math.max(28, Math.floor(Math.min((avW - GAP * (N - 1) - 20) / N, (avH - GAP * (N - 1)) / N, 52)));
  }
  function drawBoard() {
    const b = root.querySelector('#bBoard');
    b.style.gridTemplateColumns = `repeat(${N},${UI.cs}px)`; b.style.gridAutoRows = UI.cs + 'px'; b.style.gap = GAP + 'px';
    b.innerHTML = ''; UI.cells = [];
    for (let i = 0; i < N * N; i++) { const el = document.createElement('div'); el.className = 'bc'; if (st.grid[i] >= 0) { el.classList.add('f', 'gm'); setK(el, st.grid[i]); } b.appendChild(el); UI.cells.push(el); }
    UI.board = b;
  }
  function pieceEl(p, size) {
    const h = Math.max(...p.s.map((x) => x[0])) + 1, w = Math.max(...p.s.map((x) => x[1])) + 1, g = Math.max(2, Math.round(size * 0.09));
    const el = document.createElement('div'); el.className = 'bp';
    el.style.width = w * size + (w - 1) * g + 'px'; el.style.height = h * size + (h - 1) * g + 'px';
    p.s.forEach(([r, c]) => { const q = document.createElement('i'); q.className = 'bcell gm k' + p.col; q.style.cssText = `width:${size}px;height:${size}px;left:${c * (size + g)}px;top:${r * (size + g)}px`; el.appendChild(q); });
    return el;
  }
  function drawTray(animate) {
    const t = root.querySelector('#bTray'); t.innerHTML = '';
    const ts = Math.max(16, Math.round(UI.cs * 0.56));
    st.tray.forEach((p, i) => {
      const slot = document.createElement('div'); slot.className = 'bslot'; slot.dataset.i = i;
      if (p) {
        const fl = document.createElement('div'); fl.className = 'bfl'; fl.style.animationDelay = -i * 0.9 + 's';
        const el = pieceEl(p, ts); fl.appendChild(el); slot.appendChild(fl);
        if (!fitsAnywhere(p.s)) slot.classList.add('nofit');
        if (animate) { el.style.animationDelay = i * 80 + 'ms'; el.classList.add('in'); }
      }
      t.appendChild(slot); bindSlot(slot);
    });
  }
  function setScore() {
    const el = root && root.querySelector('#bScore'); if (!el) return;
    const from = UI.shown, to = st.score, t0 = performance.now(), dur = Math.min(650, 220 + (to - from) * 2);
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); el.textContent = MG.fmt(v); if (k < 1 && root) requestAnimationFrame(step); };
    UI.shown = to; requestAnimationFrame(step);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    const best = api.data.best || 0;
    if (st.score > best) {
      root.querySelector('#bBest').textContent = MG.fmt(st.score); root.querySelector('.b-best').classList.add('rec');
      if (!st.recordShown && best > 0) { st.recordShown = true; setTimeout(() => { if (!root) return; face('bravo', 1800); say('Nouveau record !', 'gold', 1800); MG.sfx.play('record'); try { const [x, y] = api.fx.at(root.querySelector('.b-best')); api.fx.burst(x, y, ['#ffd84d', '#fff3b3', '#ffffff'], 18, { shape: 'star', speed: 4, size: 10 }); } catch (e) {} }, 380); }
    }
  }
  function floatText(text, x, y, big) {
    const f = document.createElement('div'); f.className = 'bfloat' + (big ? ' big' : ''); f.textContent = text;
    const w = root.clientWidth; f.style.left = Math.max(56, Math.min(w - 56, x)) + 'px'; f.style.top = y + 'px'; root.appendChild(f); setTimeout(() => f.remove(), 1000);
  }

  /* ---------- Glisser-déposer ---------- */
  function bindSlot(slot) {
    slot.addEventListener('pointerdown', (e) => {
      const i = +slot.dataset.i, p = st.tray[i];
      if (UI.busy || st.over || !p || UI.drag || root.querySelector('.b-intro')) return;
      e.preventDefault(); try { slot.setPointerCapture(e.pointerId); } catch (_) {}
      const frame = root.parentNode, fr = frame.getBoundingClientRect();
      const inner = pieceEl(p, UI.cs); inner.classList.add('grab');
      const tilt = document.createElement('div'); tilt.className = 'dtilt'; tilt.appendChild(inner);
      const el = document.createElement('div'); el.className = 'dragw'; el.appendChild(tilt);
      const w = parseFloat(inner.style.width), h = parseFloat(inner.style.height);
      frame.appendChild(el);
      const lift = e.pointerType === 'mouse' ? h / 2 + 10 : h + UI.cs * 0.9;
      UI.drag = { i, p, el, tilt, w, h, fr, lift, x: e.clientX, y: e.clientY, lx: e.clientX, lt: performance.now(), rot: 0, anchor: null, slot };
      slot.classList.add('lifted');
      MG.sfx.play('pick');
      moveDrag(e.clientX, e.clientY, true);
    });
    slot.addEventListener('pointermove', (e) => { if (UI.drag && UI.drag.slot === slot) { UI.drag.x = e.clientX; UI.drag.y = e.clientY; if (!UI.raf) UI.raf = requestAnimationFrame(() => { UI.raf = 0; if (UI.drag) moveDrag(UI.drag.x, UI.drag.y); }); } });
    const end = () => { if (UI.drag && UI.drag.slot === slot) drop(); };
    slot.addEventListener('pointerup', end); slot.addEventListener('pointercancel', () => { if (UI.drag && UI.drag.slot === slot) { UI.drag.anchor = null; drop(); } });
  }
  function moveDrag(x, y) {
    const d = UI.drag, left = x - d.fr.left - d.w / 2, top = y - d.fr.top - d.lift;
    const now = performance.now(), dt = Math.max(8, now - d.lt), vx = (x - d.lx) / dt;
    d.rot += (Math.max(-11, Math.min(11, vx * 9)) - d.rot) * 0.35; d.lx = x; d.lt = now;
    d.el.style.transform = `translate3d(${left}px,${top}px,0)`;
    d.tilt.style.transform = `rotate(${d.rot.toFixed(2)}deg)`;
    const b = UI.board.getBoundingClientRect(), step = UI.cs + GAP;
    const c0 = Math.round((x - d.w / 2 - b.left - 10) / step), r0 = Math.round((y - d.lift - b.top - 10) / step);
    const ok = fits(d.p.s, r0, c0);
    const key = ok ? r0 + ':' + c0 : '';
    if (key !== d.key) { d.key = key; d.anchor = ok ? [r0, c0] : null; preview(ok ? d.p : null, r0, c0); }
  }
  function preview(p, r0, c0) {
    UI.cells.forEach((el) => { if (el.classList.contains('g')) { el.classList.remove('g'); if (!el.classList.contains('f')) setK(el, null); } el.classList.remove('w'); });
    if (!p) return;
    const g = st.grid.slice(); p.s.forEach(([r, c]) => (g[(r0 + r) * N + c0 + c] = p.col));
    p.s.forEach(([r, c]) => { const el = UI.cells[(r0 + r) * N + c0 + c]; el.classList.add('g'); setK(el, p.col); });
    lines(g).forEach((i) => UI.cells[i].classList.add('w'));
  }
  function lines(g) {
    const out = new Set();
    for (let r = 0; r < N; r++) if ([...Array(N).keys()].every((c) => g[r * N + c] >= 0)) for (let c = 0; c < N; c++) out.add(r * N + c);
    for (let c = 0; c < N; c++) if ([...Array(N).keys()].every((r) => g[r * N + c] >= 0)) for (let r = 0; r < N; r++) out.add(r * N + c);
    return out;
  }
  function lineList(g) {
    const L = [];
    for (let r = 0; r < N; r++) if ([...Array(N).keys()].every((c) => g[r * N + c] >= 0)) L.push(['r', r]);
    for (let c = 0; c < N; c++) if ([...Array(N).keys()].every((r) => g[r * N + c] >= 0)) L.push(['c', c]);
    return L;
  }
  function drop() {
    const d = UI.drag; UI.drag = null; preview(null);
    if (!d.anchor) {
      const sr = d.slot.getBoundingClientRect();
      d.el.classList.add('back'); d.tilt.style.transform = 'rotate(0deg)';
      d.el.style.transform = `translate3d(${sr.left - d.fr.left + sr.width / 2 - d.w / 2}px,${sr.top - d.fr.top + sr.height / 2 - d.h / 2}px,0)`;
      MG.sfx.play('invalid');
      setTimeout(() => { d.el.remove(); d.slot.classList.remove('lifted'); }, 220);
      return;
    }
    d.el.remove(); place(d.i, d.anchor[0], d.anchor[1]);
  }

  /* ---------- Placement, lignes, combos ---------- */
  const NICE = ['Joli !', 'Bien vu !', 'Super !', 'Top !'];
  async function place(i, r0, c0) {
    UI.busy = true;
    const p = st.tray[i]; st.tray[i] = null;
    const bb = UI.board.getBoundingClientRect(), fr = root.parentNode.getBoundingClientRect(), step = UI.cs + GAP;
    const cx = (c) => bb.left - fr.left + 10 + c * step + UI.cs / 2, cy = (r) => bb.top - fr.top + 10 + r * step + UI.cs / 2;
    p.s.forEach(([r, c], k) => { const idx = (r0 + r) * N + c0 + c; st.grid[idx] = p.col; const el = UI.cells[idx]; el.className = 'bc f gm pin'; el._k = null; setK(el, p.col); el.style.animationDelay = k * 22 + 'ms'; });
    const pr = r0 + (Math.max(...p.s.map((x) => x[0]))) / 2, pc = c0 + (Math.max(...p.s.map((x) => x[1]))) / 2;
    MG.sfx.play('place', { n: p.s.length });
    try { api.fx.burst(cx(pc), cy(pr), ['#ffffff', COLORS[p.col].a], 8, { speed: 2.6, size: 6, up: 0.4, g: 0.06, shape: 'dot' }); } catch (e) {}
    st.placed++; st.score += p.s.length;
    const s = api.data.stats; s.pieces = (s.pieces || 0) + 1;
    drawTray();
    const L = lineList(st.grid), clear = lines(st.grid), n = L.length;
    if (n) {
      st.combo++; st.miss = 0; st.lines += n; s.lines = (s.lines || 0) + n;
      const mult = n === 1 ? 1 : n === 2 ? 1.5 : n === 3 ? 2 : 2.5, comboMult = 1 + 0.5 * Math.max(0, st.combo - 1);
      const gain = Math.round(n * N * 10 * mult * comboMult);
      st.score += gain; s.bestCombo = Math.max(s.bestCombo || 0, st.combo);
      await MG.wait(140);
      if (!root) return;
      MG.sfx.play('clear', { n, up: Math.max(0, st.combo - 1) * 2 });
      // faisceaux lumineux sur chaque ligne
      L.forEach(([t, k], j) => {
        const sw = document.createElement('i'); sw.className = 'bsweep ' + t; sw.style.setProperty('--k', k); sw.style.setProperty('--cs', UI.cs + 'px'); sw.style.setProperty('--st', step + 'px'); sw.style.animationDelay = j * 60 + 'ms';
        UI.board.appendChild(sw); setTimeout(() => sw.remove(), 700);
      });
      let maxDelay = 0;
      clear.forEach((idx) => {
        const r = Math.floor(idx / N), c = idx % N, dist = Math.hypot(r - pr, c - pc), delay = 60 + dist * 30, el = UI.cells[idx], col = st.grid[idx];
        maxDelay = Math.max(maxDelay, delay);
        setTimeout(() => {
          el.classList.remove('pin', 'w'); el.style.animationDelay = '0ms'; el.classList.add('zap');
          try { api.fx.burst(cx(c), cy(r), [COLORS[col].a, COLORS[col].b, '#ffffff'], 6, { speed: 4.2, size: 8 }); } catch (e) {}
        }, delay);
      });
      clear.forEach((idx) => (st.grid[idx] = -1));
      floatText('+' + MG.fmt(gain), cx(pc), cy(pr), n >= 2 || st.combo >= 3);
      if (n >= 2) { UI.board.classList.remove('shake2', 'shake3'); void UI.board.offsetWidth; UI.board.classList.add(n >= 3 ? 'shake3' : 'shake2'); }
      const comboEl = root.querySelector('#bCombo');
      if (st.combo >= 2) { comboEl.innerHTML = `${MG.icon('flame')}Combo ×${st.combo}`; comboEl.classList.remove('show'); void comboEl.offsetWidth; comboEl.classList.add('show'); }
      const boardEmpty = st.grid.every((v) => v < 0);
      if (boardEmpty) {
        st.score += 300; s.clears = (s.clears || 0) + 1;
        setTimeout(() => { if (!root) return; MG.sfx.play('bigclear'); api.react({ face: 'v3_felicitations', text: 'Plateau nettoyé !', size: 'lg', hold: 1300 }); api.fx.confetti(100); face('bravo', 2000); }, maxDelay + 150);
      } else if (n >= 4) { api.react({ face: 'v3_felicitations', text: 'Tu es imbattable !', size: 'lg' }); api.fx.confetti(90); face('bravo', 1800); }
      else if (n === 3) { api.react({ face: 'v3_alerte', text: 'Incroyable combo !', size: 'lg' }); api.fx.confetti(50); face('wow', 1600); }
      else if (n === 2) { face('joie', 1400); say('Excellent !', 'pop', 1300); }
      else if (st.combo >= 3) { face('amour', 1400); say(st.combo >= 5 ? 'Inarrêtable !' : `Combo ×${st.combo} !`, 'fire', 1300); }
      else { face(Math.random() < 0.5 ? 'joie' : 'clin', 1200); if (Math.random() < 0.55) say(NICE[Math.floor(Math.random() * NICE.length)], '', 1100); }
      setScore();
      await MG.wait(maxDelay + 380);
      if (!root) return;
      clear.forEach((idx) => { const el = UI.cells[idx]; el.className = 'bc'; el._k = null; el.style.animationDelay = ''; });
    } else {
      st.miss++; if (st.miss >= 3) st.combo = 0;
      setScore(); await MG.wait(140);
      if (!root) return;
    }
    if (st.tray.every((x) => !x)) { st.tray = newTray(); drawTray(true); } else drawTray();
    persist();
    if (!st.tray.some((x) => x && fitsAnywhere(x.s))) { await gameOver(); return; }
    // Milo surveille le plateau
    const dl = dangerLevel(), fitN = st.tray.filter((x) => x && fitsAnywhere(x.s)).length, left = st.tray.filter(Boolean).length;
    if (!n && (dl > 0.62 || (left > 1 && fitN === 1)) && st.placed - UI.dangerAt > 5) { UI.dangerAt = st.placed; face('wow', 1500); say('Attention, ça se remplit !', 'warn', 1700); }
    else if (!n && dl > 0.5) face('focus');
    else if (!n && UI.face !== 'idle' && !UI.faceT) face('idle');
    UI.busy = false;
  }

  /* ---------- Fin de partie ---------- */
  async function gameOver() {
    st.over = true; UI.busy = true;
    const d = api.data, s = d.stats, prevBest = d.best || 0, record = st.score > prevBest;
    d.best = Math.max(prevBest, st.score); s.totalScore = (s.totalScore || 0) + st.score; s.finished = (s.finished || 0) + 1;
    d.history = [{ score: st.score, lines: st.lines, at: new Date().toISOString() }, ...(d.history || [])].slice(0, 30);
    d.current = null; api.save();
    UI.cells.forEach((el, i) => { if (el.classList.contains('f')) setTimeout(() => el.classList.add('dead'), Math.floor(i / N) * 70); });
    face('dodo'); say('Plus de place…', '', 2000); MG.sfx.play('over');
    await MG.wait(1400);
    if (!root) return;
    if (record) { api.fx.confetti(110); MG.sfx.play('record'); }
    const avg = Math.round(s.totalScore / Math.max(1, s.finished));
    const m = document.createElement('div'); m.className = 'gmodal';
    m.innerHTML = `<div class="gpanel b-over"><img class="mas" src="${faceSrc(record ? 'bravo' : 'amour')}" alt=""><h3>${record ? (prevBest ? 'Nouveau record !' : 'Premier record !') : 'Partie terminée'}</h3>
      <div class="big">${MG.fmt(st.score)}</div><p>${record ? (prevBest ? 'Tu as battu ton ancien record de ' + MG.fmt(prevBest) + '.' : 'Ton premier score est enregistré. À toi de le battre !') : 'Record : ' + MG.fmt(d.best)}</p>
      <div class="bsum"><div><b>${st.lines}</b><span>lignes</span></div><div><b>${st.placed}</b><span>gommes</span></div><div><b>${MG.fmt(avg)}</b><span>moyenne</span></div></div>
      <div class="acts"><button class="gbtn" data-b="again">${MG.icon('redo')}Rejouer</button><button class="gbtn light" data-b="quit">Retour aux jeux</button></div></div>`;
    root.appendChild(m);
  }

  /* ---------- Écran d’accueil (fiche du jeu) ---------- */
  function intro() {
    const d = api.data, s = d.stats || {}, cur = d.current;
    const demo = (col, sym) => `<i class="bdemo gm k${col}"></i>`;
    const el = document.createElement('div'); el.className = 'b-intro gscroll';
    el.innerHTML = `<div class="gtop b-itop"><div class="grow"></div>${MG.soundBtn()}<button class="gclose" data-b="quit" aria-label="Quitter">${MG.icon('x')}</button></div><div class="b-introin">
      <img class="b-ilogo" src="${MG.asset('logo_blocks.webp')}" alt="Milo Blocks" draggable="false">
      <div class="b-icard">
        <img class="b-imilo" src="${faceSrc('joie')}" alt="" draggable="false">
        <ul class="b-how">
          <li><span>${demo(1)}${demo(1)}</span>Glisse les gommes sur le plateau</li>
          <li><span>${demo(3)}${demo(4)}${demo(5)}</span>Complète une ligne ou une colonne</li>
          <li><span>${demo(0)}${MG.icon('flame')}</span>Enchaîne pour faire grimper le combo</li>
        </ul>
        <div class="b-istats"><div><span>${MG.icon('crown')}Record</span><b>${MG.fmt(d.best || 0)}</b></div><div><span>Parties</span><b>${MG.fmt(s.finished || 0)}</b></div><div><span>${MG.icon('flame')}Combo max</span><b>×${s.bestCombo || 0}</b></div></div>
        <div class="b-iacts">${cur ? `<button class="gbtn" data-b="resume">${MG.icon('play')}Reprendre (${MG.fmt(cur.score)})</button><button class="gbtn light" data-b="fresh">Nouvelle partie</button>` : `<button class="gbtn" data-b="go">${MG.icon('play')}Jouer</button>`}</div>
      </div></div>`;
    root.appendChild(el);
  }
  function closeIntro(fresh) {
    const el = root.querySelector('.b-intro'); if (!el) return;
    if (fresh) { newGame(); build(); }
    el.classList.add('out'); setTimeout(() => el.remove(), 320);
    UI.busy = false;
    setTimeout(() => { if (!root) return; face('joie', 1300); say(st.placed ? 'On reprend !' : 'À toi de jouer !', '', 1300); }, 260);
  }

  function onClick(e) {
    const b = e.target.closest('[data-b]'); if (!b) return;
    const a = b.dataset.b;
    if (a === 'quit') { if (st && !st.over) persist(); api.close(); }
    else if (a === 'go' || a === 'resume') { MG.sfx.play('tap'); closeIntro(false); }
    else if (a === 'fresh') { MG.sfx.play('tap'); api.data.current = null; closeIntro(true); }
    else if (a === 'again') { const m = b.closest('.gmodal'); m && m.remove(); newGame(); build(); UI.busy = false; setTimeout(() => { if (root) { face('joie', 1200); say('Nouvelle partie !', '', 1200); } }, 250); }
  }
  function onResize() { if (!root || UI.drag) return; const old = UI.cs; layout(); if (old !== UI.cs) { drawBoard(); drawTray(); } }

  /* ---------- Module ---------- */
  MG.register({
    id: 'blocks', name: 'Milo Blocks', logo: 'logo_blocks.webp', theme: 'blocks',
    mount(frame, a) {
      api = a; api.data.stats = api.data.stats || {};
      root = document.createElement('div'); root.className = 'blocks-root'; frame.insertBefore(root, frame.firstChild);
      Object.values(FACE).forEach((f) => { const im = new Image(); im.src = `assets/${f}.webp`; });
      const cur = api.data.current;
      if (cur && cur.grid && cur.tray) { st = { ...cur, grid: cur.grid.slice(), tray: cur.tray.map((p) => p && { ...p }) }; st.over = false; }
      else { st = { grid: Array(N * N).fill(-1), tray: null, score: 0, combo: 0, miss: 0, lines: 0, placed: 0, recordShown: false }; st.tray = newTray(); api.data.stats.games = (api.data.stats.games || 0) + 1; }
      UI.busy = true; UI.drag = null; UI.dangerAt = -9;
      build(); intro();
      root.addEventListener('click', onClick);
      window.addEventListener('resize', onResize);
      if (!st.tray.some((x) => x && fitsAnywhere(x.s))) { root.querySelector('.b-intro').remove(); gameOver(); }
    },
    unmount() { clearTimeout(UI.faceT); clearTimeout(UI.bubT); if (st && !st.over && st.placed) persist(); window.removeEventListener('resize', onResize); if (UI.drag) { UI.drag.el.remove(); UI.drag = null; } root = null; },
    card(d) {
      const s = d.stats || {};
      return { desc: 'Glisse les gommes de Milo pour compléter lignes et colonnes. Enchaîne les combos et bats ton record.',
        stats: [['Record', MG.fmt(d.best || 0), 'crown'], ['Parties', s.finished || 0, 'grid'], ['Lignes', MG.fmt(s.lines || 0), 'flame']],
        progress: null, cta: d.current && d.current.placed ? `Reprendre la partie (${MG.fmt(d.current.score)})` : 'Nouvelle partie' };
    },
    homeLine(d) { return `Milo Blocks record ${MG.fmt(d.best || 0)}`; },
    _debug: { state: () => st, SHAPES, fits, place: (i, r, c) => place(i, r, c), redraw: () => { drawBoard(); drawTray(); }, ui: UI, start: () => closeIntro(false) }
  });

  /* ---------- Styles ---------- */
  const kcss = COLORS.map((c, i) => `.k${i}{--a:${c.a};--b:${c.b};--sh:${c.sh};--sym:${svgUri(SYM[c.s])}}`).join('');
  const css = `${kcss}
  .gscreen.blocks{background:radial-gradient(circle at 15% 8%,rgba(255,255,255,.9),transparent 38%),radial-gradient(circle at 92% 30%,rgba(255,200,236,.75),transparent 42%),radial-gradient(circle at 10% 85%,rgba(176,214,255,.8),transparent 45%),linear-gradient(170deg,#e9dfff,#f6e8ff 45%,#ece6ff)}
  .blocks-root{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;z-index:1;color:#2a1f6b}
  .b-amb{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:-1}
  .b-amb i{position:absolute;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.95),rgba(255,255,255,.25) 45%,rgba(255,255,255,0) 70%);animation:bamb 14s ease-in-out infinite}
  .b-amb i:nth-child(1){width:90px;height:90px;left:-20px;top:22%}
  .b-amb i:nth-child(2){width:54px;height:54px;right:8%;top:12%;animation-delay:-4s}
  .b-amb i:nth-child(3){width:120px;height:120px;right:-40px;bottom:18%;animation-delay:-8s}
  .b-amb i:nth-child(4){width:40px;height:40px;left:12%;bottom:8%;animation-delay:-11s}
  @keyframes bamb{50%{transform:translate(14px,-22px) scale(1.08)}}
  .blocks-root .gclose{background:rgba(255,255,255,.75);color:#5a33d6;box-shadow:0 4px 12px rgba(90,60,180,.14)}
  .blocks-root .gtop{gap:8px}
  .b-best{display:inline-flex;align-items:center;gap:7px;padding:6px 14px 6px 10px;border-radius:22px;background:rgba(255,255,255,.8);box-shadow:0 4px 12px rgba(90,60,180,.12);font-size:18px;font-weight:900;color:#5a33d6;font-variant-numeric:tabular-nums}
  .b-best .gi{width:22px;height:22px;fill:#ffcf3a;stroke:#e19c00;stroke-width:1.5}
  .b-best.rec{animation:bbump .5s cubic-bezier(.34,1.7,.5,1);background:linear-gradient(160deg,#fff7cf,#ffe58f)}
  .b-scorewrap{text-align:center;padding:0 0 6px;position:relative;line-height:1}
  .b-lbl{display:block;font-size:12px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#8c7bd0}
  .b-score{font-size:50px;font-weight:900;letter-spacing:-1.5px;line-height:1.05;background:linear-gradient(180deg,#7b4df2,#4e3ad6);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 rgba(255,255,255,.9)) drop-shadow(0 6px 10px rgba(90,60,200,.22));font-variant-numeric:tabular-nums;display:inline-block}
  .b-score.bump{animation:bbump .38s cubic-bezier(.34,1.7,.5,1)}
  @keyframes bbump{0%{transform:scale(1)}40%{transform:scale(1.16)}100%{transform:scale(1)}}
  .b-combo{position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:5px;padding:3px 10px 3px 7px;border-radius:14px;background:linear-gradient(135deg,#ff9a4d,#ff4f8b);color:#fff;font-size:13px;font-weight:900;opacity:0;white-space:nowrap;box-shadow:0 4px 12px rgba(255,90,120,.4)}
  .b-combo .gi{width:15px;height:15px;fill:#fff3b3;stroke:#fff}
  .b-combo.show{animation:bcombo 1.6s ease forwards}
  @keyframes bcombo{0%{opacity:0;transform:translate(-50%,8px) scale(.6)}14%{opacity:1;transform:translate(-50%,0) scale(1.15)}24%{transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-6px)}}
  .b-boardwrap{display:flex;justify-content:center;padding:44px 12px 6px}
  .b-stage{position:relative}
  .b-board{position:relative;display:grid;padding:10px;border-radius:28px;background:linear-gradient(180deg,#ffffff,#f5f0ff);box-shadow:0 18px 40px rgba(108,72,214,.24),inset 0 2px 0 #fff,inset 0 -5px 0 rgba(150,120,230,.16)}
  .b-board.shake2{animation:bshake .38s ease}.b-board.shake3{animation:bshake3 .5s ease}
  @keyframes bshake{20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-3px,1px)}80%{transform:translate(2px,0)}}
  @keyframes bshake3{15%{transform:translate(-7px,3px) rotate(-.6deg)}30%{transform:translate(7px,-3px) rotate(.6deg)}45%{transform:translate(-5px,2px)}60%{transform:translate(5px,-1px)}80%{transform:translate(-2px,0)}}
  .b-milo{position:absolute;right:14px;top:-58px;width:70px;height:70px;z-index:3;pointer-events:none}
  .b-milo img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 6px 8px rgba(80,50,180,.25));animation:bmilo 3.2s ease-in-out infinite;transform-origin:50% 100%}
  .b-milo img.hop{animation:bhop .45s cubic-bezier(.34,1.7,.5,1),bmilo 3.2s .45s ease-in-out infinite}
  @keyframes bmilo{50%{transform:translateY(-3px) scale(1.02,.98)}}
  @keyframes bhop{0%{transform:scale(.8,1.15)}50%{transform:translateY(-10px) scale(1.06,.95)}100%{transform:none}}
  .b-bub{position:absolute;right:76px;top:6px;padding:7px 12px;border-radius:16px 16px 4px 16px;background:#fff;color:#4b2fc9;font-size:14px;font-weight:900;white-space:nowrap;box-shadow:0 6px 16px rgba(80,50,180,.18);opacity:0;transform:scale(.6) translateY(6px);transform-origin:100% 100%;transition:opacity .18s,transform .25s cubic-bezier(.34,1.7,.5,1)}
  .b-bub.show{opacity:1;transform:none}
  .b-bub.gold{background:linear-gradient(160deg,#fff6c9,#ffe07a);color:#8a4b00}
  .b-bub.warn{background:#fff1e6;color:#c2410c}
  .b-bub.fire{background:linear-gradient(135deg,#ff9a4d,#ff4f8b);color:#fff}
  .b-bub.pop{background:linear-gradient(135deg,#8f6bff,#4f7bff);color:#fff}
  .bc{position:relative;border-radius:31%;background:rgba(124,92,230,.075);box-shadow:inset 0 2px 3px rgba(90,60,180,.13),inset 0 -1px 0 rgba(255,255,255,.95)}
  .gm{background:radial-gradient(95% 75% at 30% 16%,rgba(255,255,255,.78),rgba(255,255,255,0) 52%),linear-gradient(165deg,var(--a),var(--b) 88%);box-shadow:inset 0 -3px 0 rgba(40,10,90,.13),inset 0 2px 1px rgba(255,255,255,.75),0 3px 7px var(--sh)}
  .gm:after{content:"";position:absolute;inset:0;background:var(--sym) 50% 54%/46% no-repeat;opacity:.5}
  .gm:before{content:"";position:absolute;left:17%;top:11%;width:26%;height:15%;border-radius:50%;background:rgba(255,255,255,.9);transform:rotate(-24deg)}
  .bc.g{background:linear-gradient(165deg,var(--a),var(--b));opacity:.5;box-shadow:inset 0 0 0 2px rgba(255,255,255,.95)}
  .bc.g:after{content:"";position:absolute;inset:0;background:var(--sym) 50% 54%/46% no-repeat;opacity:.7}
  .bc.w{z-index:1;animation:bwp .55s ease-in-out infinite alternate;filter:brightness(1.1) saturate(1.15);box-shadow:0 0 0 2.5px #ffd84d,0 0 16px 4px rgba(255,190,40,.7),inset 0 2px 1px rgba(255,255,255,.75)!important}
  @keyframes bwp{to{transform:scale(1.07)}}
  .bc.pin{animation:bjelly .46s cubic-bezier(.3,1.5,.5,1) both}
  @keyframes bjelly{0%{transform:translateY(-10px) scale(.5)}45%{transform:scale(1.2,.84)}68%{transform:scale(.93,1.08)}85%{transform:scale(1.03,.98)}100%{transform:none}}
  .bc.zap{z-index:2;animation:bzap .42s cubic-bezier(.4,0,.6,1) forwards}
  @keyframes bzap{0%{transform:scale(1)}28%{transform:scale(1.26) rotate(-8deg)}100%{transform:scale(0) rotate(40deg);opacity:0}}
  .bc.dead{filter:grayscale(1) brightness(.92) opacity(.55);transition:filter .45s}
  .bsweep{position:absolute;z-index:3;pointer-events:none;border-radius:14px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.95),rgba(255,255,255,0));opacity:0;animation:bsweep .5s ease-out both}
  .bsweep.r{left:10px;right:10px;top:calc(10px + var(--k) * var(--st));height:var(--cs);background-size:40% 100%;background-repeat:no-repeat;--from:-40%;--to:140%}
  .bsweep.c{top:10px;bottom:10px;left:calc(10px + var(--k) * var(--st));width:var(--cs);background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.95),rgba(255,255,255,0));background-size:100% 40%;background-repeat:no-repeat}
  .bsweep.r{animation-name:bsweepr}.bsweep.c{animation-name:bsweepc}
  @keyframes bsweepr{0%{opacity:1;background-position:-60% 0}100%{opacity:0;background-position:160% 0}}
  @keyframes bsweepc{0%{opacity:1;background-position:0 -60%}100%{opacity:0;background-position:0 160%}}
  .bfloat{position:absolute;z-index:42;transform:translate(-50%,-50%);font-size:24px;font-weight:900;color:#fff;-webkit-text-stroke:2px #6a3be0;paint-order:stroke fill;text-shadow:0 3px 0 #4a24b8;pointer-events:none;animation:bfloat 1s ease-out forwards;white-space:nowrap}
  .bfloat.big{font-size:32px;color:#fff2a6;-webkit-text-stroke-color:#d9480f;text-shadow:0 3px 0 #a33a0c}
  @keyframes bfloat{0%{opacity:0;transform:translate(-50%,-30%) scale(.5)}20%{opacity:1;transform:translate(-50%,-60%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-190%) scale(1)}}
  .b-tray{flex:1;min-height:118px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;margin:6px 14px max(14px,env(safe-area-inset-bottom,0px));padding:6px;border-radius:26px;background:rgba(255,255,255,.45);box-shadow:inset 0 2px 0 rgba(255,255,255,.7),0 8px 22px rgba(108,72,214,.1)}
  .bslot{height:100%;min-height:100px;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:grab}
  .bfl{animation:bflo 3.4s ease-in-out infinite}
  @keyframes bflo{50%{transform:translateY(-4px)}}
  .bslot.lifted .bp{opacity:0;transition:opacity .08s}
  .bslot.nofit .bp{opacity:.32;filter:grayscale(.7)}
  .bp{position:relative;pointer-events:none}
  .bp.in{animation:bin .5s cubic-bezier(.34,1.6,.5,1) both}
  @keyframes bin{0%{transform:translateY(46px) scale(.3) rotate(-12deg);opacity:0}100%{transform:none;opacity:1}}
  .bcell{position:absolute;border-radius:31%}
  .dragw{position:absolute;left:0;top:0;z-index:30;will-change:transform;pointer-events:none;filter:drop-shadow(0 14px 14px rgba(70,40,170,.32))}
  .dtilt{transform-origin:50% 30%}
  .dragw .bcell{border-radius:31%}
  .bp.grab{animation:bgrab .2s cubic-bezier(.34,1.6,.5,1)}
  @keyframes bgrab{0%{transform:scale(.55)}70%{transform:scale(1.08)}100%{transform:none}}
  .dragw.back{transition:transform .22s ease-in}.dragw.back .bp{transform:scale(.56);transition:transform .22s ease-in}
  .bsum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 2px}
  .bsum div{background:#f4efff;border-radius:14px;padding:8px 4px}.bsum b{display:block;font-size:20px;font-weight:900;color:#4b2ab8}.bsum span{font-size:11.5px;font-weight:800;color:var(--muted)}
  .b-intro{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.95),transparent 45%),linear-gradient(170deg,rgba(233,223,255,.97),rgba(246,232,255,.97));animation:fade .25s;overflow:auto}
  .b-intro.out{opacity:0;transform:scale(1.04);transition:opacity .3s,transform .3s}
  .b-introin{width:min(100%,380px);display:flex;flex-direction:column;align-items:center;margin:auto}
  .b-itop{position:absolute;left:0;right:0;top:0}
  .b-intro .gclose{background:rgba(255,255,255,.75);color:#5a33d6;box-shadow:0 4px 12px rgba(90,60,180,.14)}
  .b-ilogo{width:min(62%,230px);height:auto;filter:drop-shadow(0 12px 18px rgba(70,40,170,.25));animation:gpop .6s cubic-bezier(.34,1.6,.5,1) both;margin-bottom:-12px;position:relative;z-index:1}
  .b-icard{width:100%;border-radius:28px;background:#fff;padding:26px 18px 18px;box-shadow:0 20px 46px rgba(90,60,190,.2);position:relative;animation:gpop .5s .08s cubic-bezier(.34,1.6,.5,1) both}
  .b-imilo{position:absolute;right:-8px;top:-46px;width:78px;height:78px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(80,50,180,.25));animation:bmilo 3s ease-in-out infinite}
  .b-how{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
  .b-how li{display:flex;align-items:center;gap:12px;font-weight:800;font-size:14px;color:#3a2f74}
  .b-how li>span{display:flex;align-items:center;gap:3px;width:62px;flex:none;justify-content:center}
  .b-how .gi{width:20px;height:20px;color:#ff6b3d;fill:#ffd36b}
  .bdemo{position:relative;display:inline-block;width:20px;height:20px;border-radius:31%}
  .b-istats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0 14px}
  .b-istats div{background:#f6f2ff;border-radius:16px;padding:8px 6px;text-align:center}
  .b-istats span{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:800;color:var(--muted);white-space:nowrap}
  .b-istats span .gi{width:12px;height:12px;fill:#ffcf3a;stroke:#e19c00}
  .b-istats b{display:block;font-size:20px;font-weight:900;color:#4b2ab8;margin-top:2px}
  .b-iacts{display:flex;flex-direction:column;gap:10px}
  .b-over .mas{width:118px;height:118px}
  @media (prefers-reduced-motion:reduce){.b-amb i,.bfl,.b-milo img,.bc.w{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
