/* =====================================================================
   Milo Blocks — puzzle de blocs (glisser-déposer, lignes et colonnes)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames;
  const N = 8, GAP = 3;

  /* ---------- Couleurs des blocs (aux couleurs de Milo) ---------- */
  const COLORS = [
    { a: '#c4a1ff', b: '#7c4dff' }, { a: '#8cbcff', b: '#3d6df3' }, { a: '#8ff3ff', b: '#12b5d6' },
    { a: '#ffa8d6', b: '#ec4899' }, { a: '#ffe48a', b: '#f2a20c' }, { a: '#8ff5c0', b: '#1fb36d' }, { a: '#ffbe8a', b: '#f2711c' }
  ];

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
    let forms = [b.c]; if (b.mirror) forms.push(b.c.map(([r, c]) => [r, -c]));
    forms.forEach((f) => { let cur = f; for (let i = 0; i < 4; i++) { const n = norm(cur), k = JSON.stringify(n); if (!seen.has(k)) { seen.add(k); variants.push(n); } cur = cur.map(([r, c]) => [c, -r]); } });
    variants.forEach((v) => SHAPES.push({ c: v, w: b.w / variants.length, t: b.t }));
  });

  /* ---------- État ---------- */
  let api = null, root = null, st = null;
  const UI = { cs: 40, busy: false, drag: null, cells: [], raf: 0, shown: 0 };

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

  /* ---------- Rendu ---------- */
  const paint = (el, col) => { el.style.setProperty('--a', COLORS[col].a); el.style.setProperty('--b', COLORS[col].b); };
  function build() {
    const best = api.data.best || 0;
    root.innerHTML = `<div class="gtop"><div class="b-best">${MG.icon('crown')}<b id="bBest">${MG.fmt(best)}</b></div><div class="grow"></div><button class="gclose" aria-label="Quitter">${MG.icon('x')}</button></div>
      <div class="b-scorewrap"><div class="b-score" id="bScore">${MG.fmt(st.score)}</div><div class="b-combo" id="bCombo"></div></div>
      <div class="b-boardwrap" id="bWrap"><div class="b-board" id="bBoard"></div></div>
      <div class="b-tray" id="bTray"></div>`;
    root.querySelector('.gclose').onclick = () => { persist(); api.close(); };
    layout(); drawBoard(); drawTray(); UI.shown = st.score;
  }
  function layout() {
    const f = root.getBoundingClientRect();
    const avW = f.width - 28, avH = f.height - 300;
    UI.cs = Math.max(28, Math.floor(Math.min((avW - GAP * (N - 1) - 16) / N, (avH - GAP * (N - 1)) / N, 54)));
  }
  function drawBoard() {
    const b = root.querySelector('#bBoard');
    b.style.gridTemplateColumns = `repeat(${N},${UI.cs}px)`; b.style.gridAutoRows = UI.cs + 'px'; b.style.gap = GAP + 'px';
    b.innerHTML = ''; UI.cells = [];
    for (let i = 0; i < N * N; i++) { const el = document.createElement('div'); el.className = 'bc'; if (st.grid[i] >= 0) { el.classList.add('f'); paint(el, st.grid[i]); } b.appendChild(el); UI.cells.push(el); }
    UI.board = b;
  }
  function pieceEl(p, size) {
    const h = Math.max(...p.s.map((x) => x[0])) + 1, w = Math.max(...p.s.map((x) => x[1])) + 1, g = Math.max(2, Math.round(size * 0.07));
    const el = document.createElement('div'); el.className = 'bp';
    el.style.width = w * size + (w - 1) * g + 'px'; el.style.height = h * size + (h - 1) * g + 'px';
    p.s.forEach(([r, c]) => { const q = document.createElement('i'); q.className = 'bcell f'; paint(q, p.col); q.style.cssText += `width:${size}px;height:${size}px;left:${c * (size + g)}px;top:${r * (size + g)}px`; el.appendChild(q); });
    return el;
  }
  function drawTray(animate) {
    const t = root.querySelector('#bTray'); t.innerHTML = '';
    const ts = Math.max(16, Math.round(UI.cs * 0.52));
    st.tray.forEach((p, i) => {
      const slot = document.createElement('div'); slot.className = 'bslot'; slot.dataset.i = i;
      if (p) { const el = pieceEl(p, ts); slot.appendChild(el); if (!fitsAnywhere(p.s)) slot.classList.add('nofit'); if (animate) { el.style.animationDelay = i * 70 + 'ms'; el.classList.add('in'); } }
      t.appendChild(slot); bindSlot(slot);
    });
  }
  function setScore() {
    const el = root && root.querySelector('#bScore'); if (!el) return;
    const from = UI.shown, to = st.score, t0 = performance.now(), dur = Math.min(600, 200 + (to - from) * 2);
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); el.textContent = MG.fmt(v); if (k < 1 && root) requestAnimationFrame(step); };
    UI.shown = to; requestAnimationFrame(step);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    const best = api.data.best || 0;
    if (st.score > best) { root.querySelector('#bBest').textContent = MG.fmt(st.score); root.querySelector('.b-best').classList.add('rec');
      if (!st.recordShown && best > 0) { st.recordShown = true; api.react({ face: 'clin', text: 'Nouveau record !', size: 'sm' }); } }
  }

  /* ---------- Glisser-déposer ---------- */
  function bindSlot(slot) {
    slot.addEventListener('pointerdown', (e) => {
      const i = +slot.dataset.i, p = st.tray[i];
      if (UI.busy || st.over || !p || UI.drag) return;
      e.preventDefault(); try { slot.setPointerCapture(e.pointerId); } catch (_) {}
      const frame = root.parentNode, fr = frame.getBoundingClientRect();
      const inner = pieceEl(p, UI.cs); inner.classList.add('grab');
      const el = document.createElement('div'); el.className = 'dragw'; el.appendChild(inner);
      const w = parseFloat(inner.style.width), h = parseFloat(inner.style.height);
      frame.appendChild(el);
      const lift = e.pointerType === 'mouse' ? h / 2 + 10 : h + UI.cs * 0.9;
      UI.drag = { i, p, el, w, h, fr, lift, x: e.clientX, y: e.clientY, anchor: null, slot };
      slot.classList.add('lifted');
      moveDrag(e.clientX, e.clientY, true);
    });
    slot.addEventListener('pointermove', (e) => { if (UI.drag && UI.drag.slot === slot) { UI.drag.x = e.clientX; UI.drag.y = e.clientY; if (!UI.raf) UI.raf = requestAnimationFrame(() => { UI.raf = 0; if (UI.drag) moveDrag(UI.drag.x, UI.drag.y); }); } });
    const end = () => { if (UI.drag && UI.drag.slot === slot) drop(); };
    slot.addEventListener('pointerup', end); slot.addEventListener('pointercancel', () => { if (UI.drag && UI.drag.slot === slot) { UI.drag.anchor = null; drop(); } });
  }
  function moveDrag(x, y, first) {
    const d = UI.drag, left = x - d.fr.left - d.w / 2, top = y - d.fr.top - d.lift;
    d.el.style.transform = `translate3d(${left}px,${top}px,0)`;
    const b = UI.board.getBoundingClientRect(), step = UI.cs + GAP;
    const c0 = Math.round((x - d.w / 2 - b.left) / step), r0 = Math.round((y - d.lift - b.top) / step);
    const ok = fits(d.p.s, r0, c0);
    d.anchor = ok ? [r0, c0] : null;
    preview(ok ? d.p : null, r0, c0);
  }
  function preview(p, r0, c0) {
    UI.cells.forEach((el) => { el.classList.remove('g', 'w'); });
    if (!p) return;
    const g = st.grid.slice(); p.s.forEach(([r, c]) => (g[(r0 + r) * N + c0 + c] = p.col));
    p.s.forEach(([r, c]) => { const el = UI.cells[(r0 + r) * N + c0 + c]; el.classList.add('g'); paint(el, p.col); });
    lines(g).forEach((i) => UI.cells[i].classList.add('w'));
  }
  function lines(g) {
    const out = new Set();
    for (let r = 0; r < N; r++) if ([...Array(N).keys()].every((c) => g[r * N + c] >= 0)) for (let c = 0; c < N; c++) out.add(r * N + c);
    for (let c = 0; c < N; c++) if ([...Array(N).keys()].every((r) => g[r * N + c] >= 0)) for (let r = 0; r < N; r++) out.add(r * N + c);
    return out;
  }
  function countLines(g) { let n = 0; for (let r = 0; r < N; r++) if ([...Array(N).keys()].every((c) => g[r * N + c] >= 0)) n++; for (let c = 0; c < N; c++) if ([...Array(N).keys()].every((r) => g[r * N + c] >= 0)) n++; return n; }
  function drop() {
    const d = UI.drag; UI.drag = null; preview(null);
    if (!d.anchor) {
      const sr = d.slot.getBoundingClientRect();
      d.el.classList.add('back'); d.el.style.transform = `translate3d(${sr.left - d.fr.left + sr.width / 2 - d.w / 2}px,${sr.top - d.fr.top + sr.height / 2 - d.h / 2}px,0)`;
      setTimeout(() => { d.el.remove(); d.slot.classList.remove('lifted'); }, 200);
      return;
    }
    d.el.remove(); place(d.i, d.anchor[0], d.anchor[1]);
  }

  /* ---------- Placement, lignes, combos ---------- */
  const MSG = { 2: ['Excellent !', 'heureux', 'md'], 3: ['Incroyable combo !', 'surpris', 'lg'], 4: ['Tu es imbattable !', 'bravo', 'lg'] };
  async function place(i, r0, c0) {
    UI.busy = true;
    const p = st.tray[i]; st.tray[i] = null;
    p.s.forEach(([r, c], k) => { const idx = (r0 + r) * N + c0 + c; st.grid[idx] = p.col; const el = UI.cells[idx]; el.className = 'bc f pin'; el.style.animationDelay = k * 18 + 'ms'; paint(el, p.col); });
    st.placed++; st.score += p.s.length;
    const s = api.data.stats; s.pieces = (s.pieces || 0) + 1;
    drawTray();
    const clear = lines(st.grid), n = countLines(st.grid);
    if (n) {
      st.combo++; st.miss = 0; st.lines += n; s.lines = (s.lines || 0) + n;
      const mult = n === 1 ? 1 : n === 2 ? 1.5 : n === 3 ? 2 : 2.5, comboMult = 1 + 0.5 * Math.max(0, st.combo - 1);
      const gain = Math.round(n * N * 10 * mult * comboMult);
      st.score += gain; s.bestCombo = Math.max(s.bestCombo || 0, st.combo);
      const cr = r0 + Math.max(...p.s.map((x) => x[0])) / 2, cc = c0 + Math.max(...p.s.map((x) => x[1])) / 2, bb = UI.board.getBoundingClientRect(), fr = root.parentNode.getBoundingClientRect(), step = UI.cs + GAP;
      let maxDelay = 0;
      clear.forEach((idx) => {
        const r = Math.floor(idx / N), c = idx % N, dist = Math.hypot(r - cr, c - cc), delay = dist * 28, el = UI.cells[idx], col = st.grid[idx];
        maxDelay = Math.max(maxDelay, delay);
        setTimeout(() => {
          el.classList.remove('pin'); el.classList.add('zap');
          api.fx.burst(bb.left - fr.left + c * step + UI.cs / 2, bb.top - fr.top + r * step + UI.cs / 2, [COLORS[col].a, COLORS[col].b, '#ffffff'], 6, { shape: 'sq', speed: 4.5, size: 7 });
        }, delay);
      });
      clear.forEach((idx) => (st.grid[idx] = -1));
      const comboEl = root.querySelector('#bCombo');
      if (st.combo >= 2) { comboEl.innerHTML = `${MG.icon('flame')}Combo ×${st.combo}`; comboEl.classList.remove('show'); void comboEl.offsetWidth; comboEl.classList.add('show'); }
      const boardEmpty = st.grid.every((v) => v < 0);
      if (boardEmpty) { st.score += 300; api.react({ face: 'bravo', text: 'Plateau nettoyé !', size: 'lg', hold: 1300 }); api.fx.confetti(90); s.clears = (s.clears || 0) + 1; }
      else if (n >= 2) { const m = MSG[Math.min(4, n)]; api.react({ face: m[1], text: m[0], size: m[2] }); if (n >= 3) api.fx.confetti(n >= 4 ? 80 : 40); }
      else if (st.combo >= 3) api.react({ face: 'clin', text: st.combo >= 5 ? 'Inarrêtable !' : 'Bien joué !', size: 'sm' });
      setScore();
      await MG.wait(maxDelay + 320);
      clear.forEach((idx) => { const el = UI.cells[idx]; el.className = 'bc'; el.style.removeProperty('--a'); el.style.removeProperty('--b'); });
    } else {
      st.miss++; if (st.miss >= 3) st.combo = 0;
      setScore(); await MG.wait(120);
    }
    if (st.tray.every((x) => !x)) { st.tray = newTray(); drawTray(true); } else drawTray();
    persist();
    if (!st.tray.some((x) => x && fitsAnywhere(x.s))) { await gameOver(); return; }
    UI.busy = false;
  }

  /* ---------- Fin de partie ---------- */
  async function gameOver() {
    st.over = true; UI.busy = true;
    const d = api.data, s = d.stats, prevBest = d.best || 0, record = st.score > prevBest;
    d.best = Math.max(prevBest, st.score); s.totalScore = (s.totalScore || 0) + st.score; s.finished = (s.finished || 0) + 1;
    d.history = [{ score: st.score, lines: st.lines, at: new Date().toISOString() }, ...(d.history || [])].slice(0, 30);
    d.current = null; api.save();
    UI.cells.forEach((el, i) => { if (el.classList.contains('f')) setTimeout(() => el.classList.add('dead'), Math.floor(i / N) * 60); });
    api.react({ face: 'surpris', text: 'Plus de place !', size: 'md' });
    await MG.wait(1300);
    if (!root) return;
    if (record) api.fx.confetti(100);
    const avg = Math.round(s.totalScore / Math.max(1, s.finished));
    const m = document.createElement('div'); m.className = 'gmodal';
    m.innerHTML = `<div class="gpanel"><img class="mas" src="${A(MILO[record ? 'bravo' : 'encour'])}" alt=""><h3>${record ? (prevBest ? 'Nouveau record !' : 'Premier record !') : 'Partie terminée'}</h3>
      <div class="big">${MG.fmt(st.score)}</div><p>${record ? (prevBest ? 'Tu as battu ton ancien record de ' + MG.fmt(prevBest) + '.' : 'Ton premier score est enregistré. À toi de le battre !') : 'Record : ' + MG.fmt(d.best)}</p>
      <div class="bsum"><div><b>${st.lines}</b><span>lignes</span></div><div><b>${st.placed}</b><span>pièces</span></div><div><b>${MG.fmt(avg)}</b><span>moyenne</span></div></div>
      <div class="acts"><button class="gbtn" data-b="again">${MG.icon('redo')}Rejouer</button><button class="gbtn light" data-b="quit">Retour aux jeux</button></div></div>`;
    root.appendChild(m);
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; if (b.dataset.b === 'again') { m.remove(); newGame(); build(); UI.busy = false; } else api.close(); });
  }

  function onResize() { if (!root || UI.drag) return; const old = UI.cs; layout(); if (old !== UI.cs) { drawBoard(); drawTray(); } }

  /* ---------- Module ---------- */
  MG.register({
    id: 'blocks', name: 'Milo Blocks', logo: 'logo_blocks.webp', theme: 'blocks',
    mount(frame, a) {
      api = a; api.data.stats = api.data.stats || {};
      root = document.createElement('div'); root.className = 'blocks-root'; frame.insertBefore(root, frame.firstChild);
      const cur = api.data.current;
      if (cur && cur.grid && cur.tray) { st = { ...cur, grid: cur.grid.slice(), tray: cur.tray.map((p) => p && { ...p }) }; st.over = false; }
      else newGame();
      UI.busy = false; UI.drag = null;
      build();
      window.addEventListener('resize', onResize);
      if (!st.tray.some((x) => x && fitsAnywhere(x.s))) gameOver();
    },
    unmount() { if (st && !st.over) persist(); window.removeEventListener('resize', onResize); if (UI.drag) { UI.drag.el.remove(); UI.drag = null; } root = null; },
    card(d) {
      const s = d.stats || {};
      return { desc: 'Fais glisser les blocs pour compléter lignes et colonnes. Enchaîne les combos et bats ton record.',
        stats: [['Record', MG.fmt(d.best || 0), 'crown'], ['Parties', s.finished || 0, 'grid'], ['Lignes', MG.fmt(s.lines || 0), 'flame']],
        progress: null, cta: d.current ? `Reprendre la partie (${MG.fmt(d.current.score)})` : 'Nouvelle partie' };
    },
    homeLine(d) { return `Milo Blocks record ${MG.fmt(d.best || 0)}`; },
    _debug: { state: () => st, SHAPES, fits, place: (i, r, c) => place(i, r, c), redraw: () => { drawBoard(); drawTray(); }, ui: UI }
  });

  /* ---------- Styles ---------- */
  const css = `
  .gscreen.blocks{background:radial-gradient(circle at 85% 8%,rgba(160,120,255,.55),transparent 45%),radial-gradient(circle at 10% 90%,rgba(80,140,255,.45),transparent 50%),linear-gradient(170deg,#3a33b5,#4a3cc9 50%,#5d42d6)}
  .blocks-root{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;z-index:1;color:#fff}
  .b-best{display:inline-flex;align-items:center;gap:7px;font-size:22px;font-weight:900;color:#ffd84d;text-shadow:0 2px 0 rgba(120,60,0,.35)}
  .b-best .gi{width:30px;height:30px;fill:#ffd84d;stroke:#e8a400;stroke-width:1.5}
  .b-best.rec{animation:cbump .5s}
  .b-scorewrap{text-align:center;padding:2px 0 8px;position:relative}
  .b-score{font-size:52px;font-weight:900;letter-spacing:-1px;line-height:1.05;text-shadow:0 4px 0 rgba(30,15,110,.45);font-variant-numeric:tabular-nums}
  .b-score.bump{animation:cbump .35s cubic-bezier(.34,1.7,.5,1)}
  .b-combo{position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:5px;font-size:14px;font-weight:900;color:#ffe48a;opacity:0;white-space:nowrap}
  .b-combo .gi{width:16px;height:16px;fill:#ffb03b;stroke:#ff8a00}
  .b-combo.show{animation:bcombo 1.4s ease forwards}
  @keyframes bcombo{0%{opacity:0;transform:translate(-50%,6px) scale(.7)}15%{opacity:1;transform:translate(-50%,0) scale(1.15)}75%{opacity:1;transform:translate(-50%,0) scale(1)}100%{opacity:0}}
  .b-boardwrap{display:flex;justify-content:center;padding:6px 12px}
  .b-board{display:grid;padding:8px;border-radius:18px;background:rgba(22,16,78,.62);box-shadow:inset 0 2px 10px rgba(0,0,0,.35),0 10px 30px rgba(20,10,80,.35)}
  .bc{border-radius:7px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);position:relative}
  .bc.f,.bcell.f{background:linear-gradient(150deg,var(--a),var(--b));box-shadow:inset 0 3px 0 rgba(255,255,255,.5),inset 0 -4px 0 rgba(0,0,0,.18),inset 3px 0 0 rgba(255,255,255,.15),0 2px 3px rgba(10,5,50,.35)}
  .bc.g{background:linear-gradient(150deg,var(--a),var(--b));opacity:.45;box-shadow:inset 0 0 0 2px rgba(255,255,255,.6)}
  .bc.w{box-shadow:inset 0 3px 0 rgba(255,255,255,.5),0 0 12px 3px rgba(255,255,255,.75)!important;filter:brightness(1.25)}
  .bc.pin{animation:bpin .3s cubic-bezier(.34,1.8,.5,1) both}
  @keyframes bpin{0%{transform:scale(.6)}100%{transform:none}}
  .bc.zap{animation:bzap .32s ease-in forwards;z-index:2}
  @keyframes bzap{0%{transform:scale(1);filter:brightness(1)}35%{transform:scale(1.18);filter:brightness(2.2)}100%{transform:scale(0) rotate(25deg);opacity:0}}
  .bc.dead{filter:grayscale(1) brightness(.7);transition:filter .4s}
  .b-tray{flex:1;min-height:110px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;padding:6px 10px 18px}
  .bslot{height:100%;min-height:96px;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:grab}
  .bslot.lifted .bp{opacity:0}
  .bslot.nofit .bp{opacity:.35;filter:grayscale(.6)}
  .bp{position:relative;pointer-events:none}
  .bp.in{animation:bin .45s cubic-bezier(.34,1.6,.5,1) both}
  @keyframes bin{0%{transform:translateY(40px) scale(.4);opacity:0}100%{transform:none;opacity:1}}
  .bcell{position:absolute;border-radius:22%}
  .dragw{position:absolute;left:0;top:0;z-index:30;will-change:transform;pointer-events:none;filter:drop-shadow(0 12px 14px rgba(10,5,60,.45))}
  .dragw .bcell{border-radius:7px}
  .bp.grab{animation:bgrab .16s cubic-bezier(.34,1.6,.5,1)}
  @keyframes bgrab{0%{transform:scale(.55)}100%{transform:none}}
  .dragw.back{transition:transform .2s ease-in}.dragw.back .bp{transform:scale(.55);transition:transform .2s ease-in}
  .bsum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 2px}
  .bsum div{background:#f4efff;border-radius:14px;padding:8px 4px}.bsum b{display:block;font-size:20px;font-weight:900;color:#4b2ab8}.bsum span{font-size:11.5px;font-weight:800;color:var(--muted)}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
