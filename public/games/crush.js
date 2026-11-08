/* =====================================================================
   Milo Crush — match-3 à niveaux infinis (génération procédurale)
   Pour remplacer ou ajouter des bonbons : modifier PIECES (fichier PNG/WebP + couleur des particules).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames;

  /* ---------- Bonbons Milo (assets/games/) ---------- */
  const PIECES = [
    { id: 'rose', img: 'candy_rose.webp', color: '#ff7eb3', name: 'roses' },
    { id: 'jaune', img: 'candy_jaune.webp', color: '#ffcf33', name: 'jaunes' },
    { id: 'bleu', img: 'candy_bleu.webp', color: '#4fb3ff', name: 'bleus' },
    { id: 'violet', img: 'candy_violet.webp', color: '#9b5cf6', name: 'violets' },
    { id: 'menthe', img: 'candy_menthe.webp', color: '#4ade80', name: 'menthe' },
    { id: 'lavande', img: 'candy_lavande.webp', color: '#c4b5fd', name: 'lavande' },
    { id: 'turquoise', img: 'candy_turquoise.webp', color: '#2dd4bf', name: 'turquoise' }
  ];
  const RAINBOW_IMG = () => A(MILO.face || 'v3_face');

  /* ---------- Formes de grille ---------- */
  const MASKS = {
    plein: ['########', '########', '########', '########', '########', '########', '########', '########'],
    coins: ['.######.', '########', '########', '########', '########', '########', '########', '.######.'],
    coeur: ['.##..##.', '########', '########', '########', '########', '.######.', '..####..', '...##...'],
    losange: ['...##...', '..####..', '.######.', '########', '########', '.######.', '..####..', '...##...'],
    croix: ['..####..', '..####..', '########', '########', '########', '########', '..####..', '..####..'],
    donut: ['########', '########', '########', '###..###', '###..###', '########', '########', '########'],
    sablier: ['########', '########', '.######.', '..####..', '..####..', '.######.', '########', '########'],
    ailes: ['###..###', '########', '########', '########', '########', '########', '########', '###..###']
  };
  const N = 8;
  const key = (r, c) => r * N + c, rcOf = (k) => [Math.floor(k / N), k % N];
  const round50 = (x) => Math.max(50, Math.round(x / 50) * 50);

  /* ---------- Génération procédurale d’un niveau ---------- */
  function makeLevel(L) {
    const R = MG.rng(L * 7919 + 101);
    const shapes = Object.keys(MASKS);
    const shape = L <= 2 ? 'plein' : L === 3 ? 'coins' : shapes[1 + Math.floor(R() * (shapes.length - 1))];
    const mask = MASKS[shape].map((s) => [...s].map((ch) => ch === '#'));
    const active = []; mask.forEach((row, r) => row.forEach((v, c) => v && active.push([r, c])));
    const fill = active.length / 64;
    const colors = L <= 5 ? 5 : 6;
    let goal;
    if (L === 1) goal = 'score'; else if (L <= 3) goal = 'collect'; else if (L === 4) goal = 'jelly'; else if (L === 7) goal = 'ice';
    else { const pool = ['score', 'collect', 'collect', 'jelly']; if (L >= 7) pool.push('ice', 'ice'); if (L >= 12) pool.push('jelly'); goal = pool[Math.floor(R() * pool.length)]; }
    const diff = Math.min(0.35, (L - 1) * 0.012), ease = L <= 6 ? 0.8 : 1;
    const cfg = { L, shape, mask, colors, goal, collect: [], jelly: [], ice: [], iceHp: 1 };
    let moves = Math.round(20 + R() * 6);
    const symPick = (k, avoidTop) => {
      const half = active.filter(([r, c]) => c < N / 2 && !(avoidTop && r === 0));
      const out = new Set();
      while (out.size < k && half.length) { const i = Math.floor(R() * half.length); const [r, c] = half.splice(i, 1)[0]; out.add(key(r, c)); if (mask[r][N - 1 - c]) out.add(key(r, N - 1 - c)); }
      return [...out];
    };
    if (goal === 'score') cfg.target = round50(moves * Math.min(175, 80 + L * 2) * (0.55 + 0.45 * fill) * ease);
    if (goal === 'collect') {
      const n2 = L >= 10 && R() < 0.5 ? 2 : 1, pool = [...Array(colors).keys()], cols = [];
      while (cols.length < n2) cols.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
      cfg.collect = cols.map((c) => ({ c, n: Math.round(moves * (n2 === 1 ? 1.05 : 0.68) * (1 + diff) * (0.45 + 0.55 * fill) * ease) }));
    }
    if (goal === 'jelly') { const k = Math.min(active.length - 6, Math.round(12 + Math.min(20, L * 0.8))); cfg.jelly = symPick(k); moves = Math.max(18, Math.round(cfg.jelly.length * 0.8 + 10 - diff * 8)); }
    if (goal === 'ice') { const k = Math.min(18, 6 + Math.floor(L / 2)); cfg.iceHp = L >= 14 && R() < 0.5 ? 2 : 1; cfg.ice = symPick(k, true); moves = Math.max(16, Math.round(cfg.ice.length * cfg.iceHp * 0.75 + 12 - diff * 6)); }
    if (L >= 10 && goal !== 'ice' && R() < 0.45) { cfg.ice = symPick(4 + Math.floor(R() * 3), true); cfg.obstacles = true; }
    cfg.moves = moves;
    const base = round50(moves * 62 * (0.55 + 0.45 * fill));
    cfg.stars = goal === 'score' ? [cfg.target, round50(cfg.target * 1.45), round50(cfg.target * 2)] : [base, round50(base * 1.7), round50(base * 2.5)];
    return cfg;
  }

  function goalText(cfg) {
    if (cfg.goal === 'score') return `Marque ${MG.fmt(cfg.target)} points en ${cfg.moves} coups`;
    if (cfg.goal === 'collect') return 'Récupère ' + cfg.collect.map((g) => `${g.n} Milo ${PIECES[g.c].name}`).join(' et ') + ` en ${cfg.moves} coups`;
    if (cfg.goal === 'jelly') return `Fais fondre toute la gelée (${cfg.jelly.length} cases) en ${cfg.moves} coups`;
    return `Brise les ${cfg.ice.length} glaçons${cfg.iceHp > 1 ? ' (2 coups chacun)' : ''} en ${cfg.moves} coups`;
  }

  /* ---------- État ---------- */
  let api = null, root = null, st = null;
  const UI = { alive: false, busy: false, cs: 40, els: new Map(), iceEls: new Map(), sel: null, down: null, hintT: 0, uid: 0 };

  const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
  const isCell = (r, c) => inB(r, c) && st.mask[r][c];
  const tAt = (r, c) => (isCell(r, c) && !st.ice[key(r, c)] ? st.cells[r][c] : null);
  const newTile = (c, sp) => ({ id: ++UI.uid, c: c == null ? Math.floor(Math.random() * st.cfg.colors) : c, sp: sp || null });

  function freshState(cfg) {
    const s = { cfg, L: cfg.L, mask: cfg.mask, cells: [], ice: {}, jelly: {}, moves: cfg.moves, score: 0, got: {}, extra: false, jellyStart: cfg.jelly.length };
    cfg.ice.forEach((k) => (s.ice[k] = cfg.iceHp));
    cfg.jelly.forEach((k) => (s.jelly[k] = 1));
    st = s;
    for (let tries = 0; tries < 30; tries++) {
      s.cells = [...Array(N)].map(() => Array(N).fill(null));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!s.mask[r][c] || s.ice[key(r, c)]) continue;
        let col, guard = 0;
        do { col = Math.floor(Math.random() * cfg.colors); guard++; }
        while (guard < 20 && ((c >= 2 && s.cells[r][c - 1]?.c === col && s.cells[r][c - 2]?.c === col) || (r >= 2 && s.cells[r - 1][c]?.c === col && s.cells[r - 2][c]?.c === col)));
        s.cells[r][c] = newTile(col);
      }
      if (findMove()) break;
    }
    return s;
  }
  function snapshot() {
    return { L: st.L, cells: st.cells.map((row) => row.map((t) => (t ? [t.c, t.sp || 0] : 0))), ice: st.ice, jelly: st.jelly, moves: st.moves, score: st.score, got: st.got, extra: st.extra, jellyStart: st.jellyStart };
  }
  function restore(cfg, snap) {
    st = { cfg, L: cfg.L, mask: cfg.mask, ice: { ...snap.ice }, jelly: { ...snap.jelly }, moves: snap.moves, score: snap.score, got: { ...snap.got }, extra: !!snap.extra, jellyStart: snap.jellyStart || cfg.jelly.length };
    st.cells = snap.cells.map((row) => row.map((v) => (v ? newTile(v[0], v[1] || null) : null)));
  }
  function persist() { api.data.current = st && !st.done ? snapshot() : null; api.save(); }

  /* ---------- Correspondances ---------- */
  function findGroups() {
    const runs = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N;) {
      const t = tAt(r, c); if (!t || t.c < 0) { c++; continue; }
      let e = c + 1; while (e < N && tAt(r, e) && tAt(r, e).c === t.c) e++;
      if (e - c >= 3) runs.push({ h: 1, color: t.c, cells: [...Array(e - c)].map((_, i) => key(r, c + i)) });
      c = e;
    }
    for (let c = 0; c < N; c++) for (let r = 0; r < N;) {
      const t = tAt(r, c); if (!t || t.c < 0) { r++; continue; }
      let e = r + 1; while (e < N && tAt(e, c) && tAt(e, c).c === t.c) e++;
      if (e - r >= 3) runs.push({ h: 0, color: t.c, cells: [...Array(e - r)].map((_, i) => key(r + i, c)) });
      r = e;
    }
    // fusion des alignements qui se croisent (L, T)
    const parent = runs.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = {};
    runs.forEach((run, i) => run.cells.forEach((k) => { if (owner[k] != null) parent[find(i)] = find(owner[k]); else owner[k] = i; }));
    const groups = {};
    runs.forEach((run, i) => { const g = (groups[find(i)] = groups[find(i)] || { cells: new Set(), runs: [], color: run.color }); run.cells.forEach((k) => g.cells.add(k)); g.runs.push(run); });
    return Object.values(groups).map((g) => {
      g.hasH = g.runs.some((r) => r.h); g.hasV = g.runs.some((r) => !r.h);
      g.long = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      g.sp = g.long.cells.length >= 5 ? 'rainbow' : g.hasH && g.hasV ? 'bomb' : g.long.cells.length === 4 ? (g.long.h ? 'row' : 'col') : null;
      return g;
    });
  }
  function placeOf(g) {
    if (UI.lastSwap) for (const k of UI.lastSwap) if (g.cells.has(k)) return k;
    if (g.sp === 'bomb') { const hs = new Set(g.runs.filter((r) => r.h).flatMap((r) => r.cells)); for (const r of g.runs) if (!r.h) for (const k of r.cells) if (hs.has(k)) return k; }
    return g.long.cells[Math.floor(g.long.cells.length / 2)];
  }
  function lineLen(r, c, col, dr, dc) { let n = 0, rr = r + dr, cc = c + dc; while (tAt(rr, cc) && tAt(rr, cc).c === col) { n++; rr += dr; cc += dc; } return n; }
  function matchAt(r, c) { const t = tAt(r, c); if (!t || t.c < 0) return false; return lineLen(r, c, t.c, 0, 1) + lineLen(r, c, t.c, 0, -1) >= 2 || lineLen(r, c, t.c, 1, 0) + lineLen(r, c, t.c, -1, 0) >= 2; }
  function findMove() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const a = tAt(r, c); if (!a) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const b = tAt(r + dr, c + dc); if (!b) continue;
        if (a.sp === 'rainbow' || b.sp === 'rainbow' || (a.sp && b.sp)) return [[r, c], [r + dr, c + dc]];
        st.cells[r][c] = b; st.cells[r + dr][c + dc] = a;
        const ok = matchAt(r, c) || matchAt(r + dr, c + dc);
        st.cells[r][c] = a; st.cells[r + dr][c + dc] = b;
        if (ok) return [[r, c], [r + dr, c + dc]];
      }
    }
    return null;
  }

  /* ---------- Rendu ---------- */
  const pos = (r, c) => `translate3d(${c * UI.cs}px,${r * UI.cs}px,0)`;
  function tileHTML(t) {
    const img = t.sp === 'rainbow' ? RAINBOW_IMG() : MG.asset(PIECES[t.c].img);
    return `<div class="ci sp-${t.sp || 'none'}"><img src="${img}" alt="" draggable="false">${t.sp === 'row' || t.sp === 'col' ? '<i class="stripes"></i>' : ''}</div>`;
  }
  function makeEl(t, r, c, cls, fromRow) {
    const el = document.createElement('div');
    el.className = 'ct' + (cls ? ' ' + cls : '');
    el.style.width = el.style.height = UI.cs + 'px';
    el.style.transform = fromRow != null ? `translate3d(${c * UI.cs}px,${fromRow * UI.cs}px,0)` : pos(r, c);
    el.innerHTML = tileHTML(t);
    UI.board.appendChild(el); UI.els.set(t.id, el);
    return el;
  }
  function refreshEl(t) { const el = UI.els.get(t.id); if (el) el.innerHTML = tileHTML(t); }
  function moveEl(t, r, c, dur) { const el = UI.els.get(t.id); if (!el) return; el.style.setProperty('--d', (dur || 160) + 'ms'); el.style.transform = pos(r, c); }
  function drawBoard() {
    const b = UI.board; b.innerHTML = ''; UI.els.clear(); UI.iceEls.clear();
    b.style.width = N * UI.cs + 'px'; b.style.height = N * UI.cs + 'px';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!st.mask[r][c]) continue;
      const cell = document.createElement('div');
      cell.className = 'cc' + ((r + c) % 2 ? ' alt' : '') + (st.jelly[key(r, c)] ? ' jelly' : '');
      cell.dataset.k = key(r, c);
      cell.style.cssText = `width:${UI.cs}px;height:${UI.cs}px;transform:${pos(r, c)}`;
      b.appendChild(cell);
    }
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = st.cells[r][c]; if (t && !st.ice[key(r, c)]) makeEl(t, r, c); }
    Object.keys(st.ice).forEach((k) => { if (st.ice[k] > 0) drawIce(+k); });
  }
  function drawIce(k) {
    const [r, c] = rcOf(k), el = document.createElement('div');
    el.className = 'cice hp' + st.ice[k];
    el.style.cssText = `width:${UI.cs}px;height:${UI.cs}px;transform:${pos(r, c)}`;
    el.innerHTML = '<i></i>';
    UI.board.appendChild(el); UI.iceEls.set(k, el);
  }
  function center(r, c) { const b = UI.board.getBoundingClientRect(), f = root.parentNode.getBoundingClientRect(); return [b.left - f.left + (c + 0.5) * UI.cs, b.top - f.top + (r + 0.5) * UI.cs]; }

  /* ---------- HUD ---------- */
  function goalsLeft() {
    const cfg = st.cfg;
    if (cfg.goal === 'score') return [{ kind: 'score', left: Math.max(0, cfg.target - st.score) }];
    if (cfg.goal === 'collect') return cfg.collect.map((g) => ({ kind: 'collect', c: g.c, left: Math.max(0, g.n - (st.got[g.c] || 0)) }));
    if (cfg.goal === 'jelly') return [{ kind: 'jelly', left: Object.values(st.jelly).filter(Boolean).length }];
    return [{ kind: 'ice', left: Object.values(st.ice).filter((v) => v > 0).length }];
  }
  const goalDone = () => goalsLeft().every((g) => g.left <= 0);
  function starsOf(score) { return st.cfg.stars.filter((s) => score >= s).length; }
  function hud(bump) {
    if (!root) return;
    const $ = (id) => root.querySelector('#' + id);
    $('cMoves').textContent = st.moves;
    $('cMovesBox').classList.toggle('low', st.moves <= 5);
    $('cScore').textContent = MG.fmt(st.score);
    $('cGoal').innerHTML = goalsLeft().map((g) => {
      const ico = g.kind === 'collect' ? `<img src="${MG.asset(PIECES[g.c].img)}" alt="">` : g.kind === 'jelly' ? '<i class="gj"></i>' : g.kind === 'ice' ? '<i class="gice"></i>' : MG.icon('star');
      const val = g.kind === 'score' ? MG.fmt(st.score) + ' / ' + MG.fmt(st.cfg.target) : g.left;
      return `<span class="gpill ${g.left <= 0 ? 'ok' : ''}">${ico}<b>${g.left <= 0 ? MG.icon('star') : val}</b></span>`;
    }).join('');
    const top = st.cfg.stars[2];
    $('cStarFill').style.width = Math.min(100, (st.score / top) * 100) + '%';
    root.querySelectorAll('.cstar').forEach((s, i) => s.classList.toggle('on', st.score >= st.cfg.stars[i]));
    if (bump) { const s = $('cScoreBox'); s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
  }
  function miloFace(face) { const m = root && root.querySelector('#cMilo'); if (!m) return; m.querySelector('img').src = A(MILO[face] || face); m.classList.remove('jump'); void m.offsetWidth; m.classList.add('jump'); }

  /* ---------- Effacement, spéciaux, gravité ---------- */
  function effectArea(t, r, c) {
    const out = [];
    if (t.sp === 'row') for (let cc = 0; cc < N; cc++) { if (isCell(r, cc)) out.push(key(r, cc)); }
    else if (t.sp === 'col') for (let rr = 0; rr < N; rr++) { if (isCell(rr, c)) out.push(key(rr, c)); }
    else if (t.sp === 'bomb') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (isCell(r + dr, c + dc)) out.push(key(r + dr, c + dc)); }
    else if (t.sp === 'rainbow') {
      const count = {}; allTiles().forEach(([u]) => { if (u.c >= 0) count[u.c] = (count[u.c] || 0) + 1; });
      const col = +Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      allTiles().forEach(([u, rr, cc]) => { if (u.c === col) out.push(key(rr, cc)); });
    }
    return out;
  }
  function allTiles() { const o = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = tAt(r, c); if (t) o.push([t, r, c]); } return o; }
  function beam(r, c, dir) {
    const b = document.createElement('div'); b.className = 'cbeam ' + dir;
    if (dir === 'h') b.style.cssText = `top:${r * UI.cs}px;height:${UI.cs}px;left:0;right:0`; else b.style.cssText = `left:${c * UI.cs}px;width:${UI.cs}px;top:0;bottom:0`;
    UI.board.appendChild(b); setTimeout(() => b.remove(), 520);
  }
  function specialFx(t, r, c) {
    const [x, y] = center(r, c), col = t.c >= 0 ? PIECES[t.c].color : '#ffffff';
    if (t.sp === 'row') beam(r, c, 'h'); else if (t.sp === 'col') beam(r, c, 'v');
    else if (t.sp === 'bomb') { api.fx.ring(x, y, col, 5); api.fx.burst(x, y, [col, '#fff'], 22, { speed: 7 }); UI.board.classList.remove('shake'); void UI.board.offsetWidth; UI.board.classList.add('shake'); }
    else if (t.sp === 'rainbow') { api.fx.ring(x, y, '#ffffff', 6); api.fx.burst(x, y, PIECES.map((p) => p.color), 30, { speed: 8 }); }
  }
  async function clearStep(groups, cascade, forced) {
    const clear = new Set(), creates = [], iceHit = new Set(), triggered = [];
    for (const g of groups) {
      g.cells.forEach((k) => clear.add(k));
      if (g.sp) creates.push({ k: placeOf(g), sp: g.sp, c: g.sp === 'rainbow' ? -1 : g.color });
      g.cells.forEach((k) => { const [r, c] = rcOf(k); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const nk = key(r + dr, c + dc); if (inB(r + dr, c + dc) && st.ice[nk] > 0) iceHit.add(nk); }); });
    }
    if (forced) forced.forEach((k) => (st.ice[k] > 0 ? iceHit.add(k) : clear.add(k)));
    const seen = new Set(), queue = [...clear];
    while (queue.length) {
      const k = queue.pop(), [r, c] = rcOf(k), t = tAt(r, c);
      if (!t || !t.sp || seen.has(t.id)) continue;
      seen.add(t.id); triggered.push([t, r, c]);
      for (const a of effectArea(t, r, c)) { if (st.ice[a] > 0) iceHit.add(a); else if (!clear.has(a)) { clear.add(a); queue.push(a); } }
    }
    triggered.forEach(([t, r, c]) => specialFx(t, r, c));
    let n = 0;
    for (const k of clear) {
      const [r, c] = rcOf(k), t = tAt(r, c);
      if (st.jelly[k]) { st.jelly[k] = 0; const cell = UI.board.querySelector(`.cc[data-k="${k}"]`); if (cell) { cell.classList.remove('jelly'); cell.classList.add('unjelly'); } }
      if (!t) continue;
      n++; if (t.c >= 0) st.got[t.c] = (st.got[t.c] || 0) + 1;
      const el = UI.els.get(t.id); if (el) el.classList.add('pop');
      const [x, y] = center(r, c); api.fx.burst(x, y, t.c >= 0 ? [PIECES[t.c].color, '#ffffff'] : ['#ffffff'], clear.size > 12 ? 4 : 8, { speed: 3.6, size: 6 });
    }
    for (const k of iceHit) {
      st.ice[k] = Math.max(0, (st.ice[k] || 0) - 1);
      const el = UI.iceEls.get(k), [r, c] = rcOf(k), [x, y] = center(r, c);
      api.fx.burst(x, y, ['#dff4ff', '#a5d8ff', '#ffffff'], 10, { shape: 'sq', speed: 4, size: 6 });
      if (el) { if (st.ice[k] <= 0) { el.classList.add('break'); setTimeout(() => el.remove(), 300); UI.iceEls.delete(k); } else el.className = 'cice hp' + st.ice[k]; }
    }
    const gain = n * 20 * cascade + creates.length * 60 + triggered.length * 40;
    st.score += gain;
    const s = api.data.stats; s.tiles = (s.tiles || 0) + n; s.specials = (s.specials || 0) + creates.length;
    if (gain) { const [x, y] = groups[0] ? center(...rcOf([...groups[0].cells][0])) : center(3.5, 3.5); floatScore(x, y, gain); }
    hud(true);
    await MG.wait(240);
    for (const k of clear) { const [r, c] = rcOf(k), t = st.cells[r][c]; if (t) { const el = UI.els.get(t.id); if (el) el.remove(); UI.els.delete(t.id); st.cells[r][c] = null; } }
    for (const cr of creates) {
      const [r, c] = rcOf(cr.k); const t = newTile(cr.c, cr.sp); st.cells[r][c] = t; makeEl(t, r, c, 'born');
      if (cr.sp === 'rainbow') { api.react({ face: 'surpris', text: 'Milo arc-en-ciel !', size: 'sm', hold: 900 }); miloFace('surpris'); }
    }
    return { cleared: n, created: creates.length };
  }
  function floatScore(x, y, v) {
    const f = document.createElement('div'); f.className = 'cfloat'; f.textContent = '+' + v; f.style.left = x + 'px'; f.style.top = y + 'px';
    root.parentNode.appendChild(f); setTimeout(() => f.remove(), 900);
  }
  async function gravity() {
    let maxDur = 0; const landed = [];
    for (let c = 0; c < N; c++) {
      const slots = []; for (let r = 0; r < N; r++) if (st.mask[r][c] && !st.ice[key(r, c)]) slots.push(r);
      if (!slots.length) continue;
      const tiles = []; for (let i = slots.length - 1; i >= 0; i--) { const t = st.cells[slots[i]][c]; if (t) tiles.push([t, slots[i]]); st.cells[slots[i]][c] = null; }
      const fresh = slots.length - tiles.length; let k = 0, spawned = 0;
      for (let i = slots.length - 1; i >= 0; i--) {
        const r = slots[i];
        if (k < tiles.length) {
          const [t, from] = tiles[k++]; st.cells[r][c] = t;
          if (from !== r) { const d = 90 + 75 * Math.sqrt(r - from); moveEl(t, r, c, d); maxDur = Math.max(maxDur, d); landed.push([t, d]); }
        } else {
          const t = newTile(); st.cells[r][c] = t; spawned++;
          makeEl(t, r, c, '', Math.min(-1, r - fresh - 1.2));
          const d = 120 + 75 * Math.sqrt(fresh + 1.2);
          requestAnimationFrame(() => requestAnimationFrame(() => moveEl(t, r, c, d)));
          maxDur = Math.max(maxDur, d + 30); landed.push([t, d + 30]);
        }
      }
    }
    landed.forEach(([t, d]) => setTimeout(() => { const el = UI.els.get(t.id); if (el) { el.classList.remove('land'); void el.offsetWidth; el.classList.add('land'); } }, d));
    await MG.wait(maxDur + 40);
  }
  const CASCADE_MSG = ['', '', 'Super !', 'Génial !', 'Fabuleux !', 'Milo-tastique !'];
  async function resolve(first, startCascade) {
    let cascade = startCascade || 0, groups = first || findGroups();
    while (groups.length) {
      cascade++;
      await clearStep(groups, cascade);
      UI.lastSwap = null;
      await gravity();
      groups = findGroups();
    }
    const s = api.data.stats; s.bestCascade = Math.max(s.bestCascade || 0, cascade);
    if (cascade >= 2) {
      const msg = CASCADE_MSG[Math.min(cascade, 5)], face = cascade >= 5 ? 'bravo' : cascade >= 4 ? 'n_rire' : cascade >= 3 ? 'clin' : 'heureux';
      api.react({ face, text: msg, size: cascade >= 4 ? 'lg' : 'md' }); miloFace(face);
      if (cascade >= 4) api.fx.confetti(40);
    }
    if (!findMove()) await shuffle();
  }
  async function shuffle() {
    api.react({ face: 'surpris', text: 'Mélange !', size: 'sm' });
    for (let tries = 0; tries < 40; tries++) {
      const list = allTiles(); const tiles = list.map(([t]) => t).sort(() => Math.random() - 0.5);
      list.forEach(([, r, c], i) => (st.cells[r][c] = tiles[i]));
      if (!findGroups().length && findMove()) break;
    }
    allTiles().forEach(([t, r, c]) => moveEl(t, r, c, 420));
    await MG.wait(480);
  }

  /* ---------- Échanges ---------- */
  function adjacent(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; }
  async function attemptSwap(r1, c1, r2, c2) {
    if (UI.busy || st.done) return;
    const A1 = tAt(r1, c1), B1 = tAt(r2, c2);
    if (!A1 || !B1) return;
    UI.busy = true; clearHint(); select(null);
    st.cells[r1][c1] = B1; st.cells[r2][c2] = A1;
    moveEl(A1, r2, c2, 170); moveEl(B1, r1, c1, 170);
    await MG.wait(180);
    if (A1.sp === 'rainbow' || B1.sp === 'rainbow' || (A1.sp && B1.sp)) {
      st.moves--; await specialCombo(A1, r2, c2, B1, r1, c1); await afterMove(); return;
    }
    const groups = findGroups();
    if (!groups.length) {
      st.cells[r1][c1] = A1; st.cells[r2][c2] = B1;
      moveEl(A1, r1, c1, 170); moveEl(B1, r2, c2, 170);
      [A1, B1].forEach((t) => { const el = UI.els.get(t.id); if (el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } });
      await MG.wait(200); UI.busy = false; armHint(); return;
    }
    st.moves--; UI.lastSwap = [key(r2, c2), key(r1, c1)];
    hud(); await resolve(groups); await afterMove();
  }
  async function specialCombo(A1, ra, ca, B1, rb, cb) {
    const keys = new Set(), area = (r0, c0, rad) => { for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) if (isCell(r0 + dr, c0 + dc)) keys.add(key(r0 + dr, c0 + dc)); };
    const rows = (r) => { for (let c = 0; c < N; c++) if (isCell(r, c)) keys.add(key(r, c)); }, cols = (c) => { for (let r = 0; r < N; r++) if (isCell(r, c)) keys.add(key(r, c)); };
    const [x, y] = center(ra, ca);
    if (A1.sp === 'rainbow' && B1.sp === 'rainbow') {
      api.react({ face: 'bravo', text: 'Méga Milo !', size: 'lg' }); api.fx.confetti(60);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (isCell(r, c)) keys.add(key(r, c));
      A1.sp = B1.sp = null;
    } else if (A1.sp === 'rainbow' || B1.sp === 'rainbow') {
      const R0 = A1.sp === 'rainbow' ? A1 : B1, O = R0 === A1 ? B1 : A1, [rr, rc] = R0 === A1 ? [ra, ca] : [rb, cb];
      const color = O.c; keys.add(key(rr, rc)); R0.sp = null; R0.c = -2;
      api.fx.ring(...center(rr, rc), '#ffffff', 6);
      const targets = allTiles().filter(([u]) => u.c === color);
      if (O.sp && O.sp !== 'rainbow') {
        targets.forEach(([u]) => { u.sp = O.sp === 'bomb' ? 'bomb' : Math.random() < 0.5 ? 'row' : 'col'; refreshEl(u); const el = UI.els.get(u.id); if (el) el.classList.add('born'); });
        api.react({ face: 'surpris', text: 'Réaction en chaîne !', size: 'md' });
        await MG.wait(450);
      }
      targets.forEach(([u, r, c]) => { keys.add(key(r, c)); api.fx.burst(...center(r, c), [PIECES[color].color, '#fff'], 6, { speed: 3 }); });
    } else {
      const sA = A1.sp, sB = B1.sp, striped = (s) => s === 'row' || s === 'col';
      A1.sp = B1.sp = null;
      if (striped(sA) && striped(sB)) { rows(ra); cols(ca); beam(ra, ca, 'h'); beam(ra, ca, 'v'); api.react({ face: 'clin', text: 'Croisement !', size: 'sm' }); }
      else if (sA === 'bomb' && sB === 'bomb') { area(ra, ca, 2); api.fx.ring(x, y, '#fff', 8); api.react({ face: 'surpris', text: 'Boum !', size: 'md' }); }
      else { for (let d = -1; d <= 1; d++) { if (ra + d >= 0 && ra + d < N) rows(ra + d); if (ca + d >= 0 && ca + d < N) cols(ca + d); } beam(ra, ca, 'h'); beam(ra, ca, 'v'); api.react({ face: 'n_rire', text: 'Super combo !', size: 'md' }); }
      UI.board.classList.remove('shake'); void UI.board.offsetWidth; UI.board.classList.add('shake');
    }
    hud();
    await clearStep([], 1, keys);
    await gravity();
    await resolve(null, 1);
  }
  async function afterMove() {
    persist();
    if (goalDone()) { await win(); return; }
    if (st.moves <= 0) { lose(); return; }
    UI.busy = false; armHint();
  }

  /* ---------- Sélection, indice ---------- */
  function select(p) {
    if (UI.sel) { const t = tAt(...UI.sel), el = t && UI.els.get(t.id); if (el) el.classList.remove('sel'); }
    UI.sel = p;
    if (p) { const t = tAt(...p), el = t && UI.els.get(t.id); if (el) el.classList.add('sel'); }
  }
  function clearHint() { clearTimeout(UI.hintT); root && root.querySelectorAll('.ct.hint').forEach((e) => e.classList.remove('hint')); }
  function armHint() {
    clearHint();
    UI.hintT = setTimeout(() => { if (UI.busy || !root) return; const m = findMove(); if (!m) return; m.forEach(([r, c]) => { const t = tAt(r, c), el = t && UI.els.get(t.id); if (el) el.classList.add('hint'); }); }, 6500);
  }
  function cellAt(e) {
    const b = UI.board.getBoundingClientRect(), c = Math.floor((e.clientX - b.left) / UI.cs), r = Math.floor((e.clientY - b.top) / UI.cs);
    return tAt(r, c) ? [r, c] : null;
  }
  function bindBoard() {
    const b = UI.board;
    b.addEventListener('pointerdown', (e) => {
      if (UI.busy || st.done) return; const p = cellAt(e); if (!p) return;
      UI.down = { p, x: e.clientX, y: e.clientY }; try { b.setPointerCapture(e.pointerId); } catch (_) {}
    });
    b.addEventListener('pointermove', (e) => {
      if (!UI.down) return;
      const dx = e.clientX - UI.down.x, dy = e.clientY - UI.down.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < UI.cs * 0.3) return;
      const [r, c] = UI.down.p; UI.down = null;
      const [dr, dc] = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
      attemptSwap(r, c, r + dr, c + dc);
    });
    const up = () => {
      if (!UI.down) return; const p = UI.down.p; UI.down = null;
      if (UI.sel && adjacent(UI.sel, p)) { const s = UI.sel; attemptSwap(s[0], s[1], p[0], p[1]); }
      else if (UI.sel && UI.sel[0] === p[0] && UI.sel[1] === p[1]) select(null);
      else select(p);
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', () => (UI.down = null));
  }

  /* ---------- Fin de niveau ---------- */
  function modal(html) {
    const m = document.createElement('div'); m.className = 'gmodal'; m.innerHTML = `<div class="gpanel">${html}</div>`;
    root.appendChild(m); return m;
  }
  async function win() {
    UI.busy = true; st.done = true; clearHint();
    api.react({ face: 'bravo', text: 'Niveau réussi !', size: 'lg', hold: 1200 }); api.fx.confetti(80); miloFace('bravo');
    await MG.wait(1100);
    const bonus = Math.min(st.moves, 15);
    if (bonus > 0) {
      const tiles = allTiles();
      for (let i = 0; i < bonus && root; i++) {
        st.moves--; st.score += 150;
        const [t, r, c] = tiles[Math.floor(Math.random() * tiles.length)];
        api.fx.burst(...center(r, c), [t.c >= 0 ? PIECES[t.c].color : '#fff', '#fff', '#ffd23f'], 10, { shape: 'star', speed: 4 });
        hud(true); await MG.wait(110);
      }
    }
    const d = api.data, L = st.L, stars = Math.max(1, starsOf(st.score));
    d.level = Math.max(d.level || 1, L + 1); d.stars = d.stars || {}; d.best = d.best || {};
    const newBest = st.score > (d.best[L] || 0);
    d.stars[L] = Math.max(d.stars[L] || 0, stars); d.best[L] = Math.max(d.best[L] || 0, st.score);
    const s = d.stats; s.won = (s.won || 0) + 1; s.totalScore = (s.totalScore || 0) + st.score; s.bestScore = Math.max(s.bestScore || 0, st.score);
    d.history = [{ L, score: st.score, stars, won: true, at: new Date().toISOString() }, ...(d.history || [])].slice(0, 30);
    d.current = null; api.save();
    if (!root) return;
    const m = modal(`<img class="mas" src="${A(MILO.bravo)}" alt=""><h3>Niveau ${L} réussi !</h3>
      <div class="wstars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.25}s">${MG.icon('star')}</span>`).join('')}</div>
      <div class="big">${MG.fmt(st.score)}</div><p>${newBest ? 'Nouveau record sur ce niveau !' : 'Record : ' + MG.fmt(d.best[L])}</p>
      <div class="acts"><button class="gbtn pink" data-c="next">${MG.icon('play')}Niveau ${L + 1}</button><button class="gbtn light" data-c="map">Carte des niveaux</button></div>`);
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; m.remove(); if (b.dataset.c === 'next') intro(L + 1); else showMap(); });
  }
  function lose() {
    UI.busy = true; clearHint(); miloFace('encour');
    const left = goalsLeft().filter((g) => g.left > 0).map((g) => g.kind === 'collect' ? `${g.left} Milo ${PIECES[g.c].name}` : g.kind === 'jelly' ? `${g.left} cases de gelée` : g.kind === 'ice' ? `${g.left} glaçons` : `${MG.fmt(g.left)} points`).join(' et ');
    const m = modal(`<img class="mas" src="${A(MILO.encour)}" alt=""><h3>Plus de coups !</h3><p>Il te manquait ${left}. Tu y étais presque.</p>
      <div class="acts">${!st.extra ? `<button class="gbtn pink" data-c="extra">+5 coups offerts par Milo</button>` : ''}<button class="gbtn" data-c="retry">${MG.icon('redo')}Réessayer</button><button class="gbtn light" data-c="map">Carte des niveaux</button></div>`);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      if (b.dataset.c === 'extra') { st.extra = true; st.moves += 5; m.remove(); hud(); persist(); UI.busy = false; armHint(); api.react({ face: 'clin', text: '+5 coups', size: 'sm' }); return; }
      const d = api.data; d.stats.lost = (d.stats.lost || 0) + 1;
      d.history = [{ L: st.L, score: st.score, stars: 0, won: false, at: new Date().toISOString() }, ...(d.history || [])].slice(0, 30);
      d.current = null; st.done = true; api.save();
      if (b.dataset.c === 'retry') startLevel(st.L, false); else showMap();
    });
  }

  /* ---------- Écrans ---------- */
  function startLevel(L, resume) {
    const cfg = makeLevel(L), d = api.data;
    if (resume && d.current && d.current.L === L) restore(cfg, d.current);
    else { freshState(cfg); d.stats.played = (d.stats.played || 0) + 1; }
    st.done = false; UI.busy = false; UI.sel = null; UI.lastSwap = null; UI.alive = true;
    root.innerHTML = `<div class="gtop"><button class="gclose" data-c="map" aria-label="Retour à la carte">${MG.icon('x')}</button><div class="c-lvl">Niveau ${L}</div><div class="grow"></div>
        <div class="c-scorebox" id="cScoreBox"><span>Score</span><b id="cScore">0</b></div></div>
      <div class="c-hud">
        <div class="c-moves" id="cMovesBox"><b id="cMoves">0</b><span>coups</span></div>
        <div class="c-goalbox"><div class="c-goal" id="cGoal"></div>
          <div class="c-starbar"><i id="cStarFill"></i>${st.cfg.stars.map((s, i) => `<span class="cstar" style="left:${(s / st.cfg.stars[2]) * 100}%">${MG.icon('star')}</span>`).join('')}</div></div>
        <div class="c-milo" id="cMilo"><img src="${A(MILO.clin)}" alt=""></div>
      </div>
      <div class="c-boardwrap" id="cWrap"><div class="c-board" id="cBoard"></div></div>
      <div class="c-tip">${goalText(st.cfg)}</div>`;
    root.onclick = null;
    UI.board = root.querySelector('#cBoard');
    layout(); drawBoard(); hud(); bindBoard(); persist(); armHint();
    root.querySelector('.gclose').onclick = () => { persist(); showMap(); };
  }
  function layout() {
    const w = root.querySelector('#cWrap').getBoundingClientRect();
    UI.cs = Math.max(30, Math.floor(Math.min((w.width - 20) / N, (w.height - 12) / N, 64)));
  }
  function onResize() { if (!UI.alive || !root || !root.querySelector('#cWrap') || UI.busy) return; const old = UI.cs; layout(); if (UI.cs !== old) drawBoard(); }

  function intro(L) {
    const cfg = makeLevel(L), d = api.data, canResume = d.current && d.current.L === L;
    const goalIcons = cfg.goal === 'collect' ? cfg.collect.map((g) => `<span class="ipill"><img src="${MG.asset(PIECES[g.c].img)}" alt=""><b>${g.n}</b></span>`).join('')
      : cfg.goal === 'jelly' ? `<span class="ipill"><i class="gj"></i><b>${cfg.jelly.length}</b></span>` : cfg.goal === 'ice' ? `<span class="ipill"><i class="gice"></i><b>${cfg.ice.length}</b></span>` : `<span class="ipill">${MG.icon('star')}<b>${MG.fmt(cfg.target)}</b></span>`;
    const tips = { 2: 'Aligne 4 Milo pour créer un Milo rayé qui vide toute une ligne.', 3: 'Un alignement en L ou en T crée un Milo bombe.', 4: 'Nouveau : la gelée. Fais un alignement dessus pour la faire fondre.', 5: '5 Milo alignés créent le Milo arc-en-ciel : échange-le avec une couleur pour toutes les faire disparaître.', 7: 'Nouveau : les glaçons. Fais des alignements juste à côté pour les briser.', 10: 'Échange deux Milo spéciaux entre eux pour un combo dévastateur.' };
    const m = modal(`<img class="mas" src="${A(MILO.clin)}" alt=""><h3>Niveau ${L}</h3><p>${goalText(cfg)}</p><div class="ipills">${goalIcons}<span class="ipill moves"><b>${cfg.moves}</b><small>coups</small></span></div>
      ${tips[L] ? `<p class="itip">${tips[L]}</p>` : ''}
      <div class="acts">${canResume ? `<button class="gbtn pink" data-c="resume">${MG.icon('play')}Reprendre la partie</button><button class="gbtn light" data-c="start">Recommencer le niveau</button>` : `<button class="gbtn pink" data-c="start">${MG.icon('play')}C’est parti</button>`}<button class="gbtn light" data-c="close">Plus tard</button></div>`);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return; e.stopPropagation();
      if (b.dataset.c === 'close') { m.remove(); return; }
      if (b.dataset.c === 'start' && canResume) { d.current = null; api.save(); }
      startLevel(L, b.dataset.c === 'resume');
    });
  }
  function showMap() {
    UI.alive = false; clearHint(); if (!root) return;
    const d = api.data, lvl = d.level || 1, stars = d.stars || {};
    const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);
    const top = lvl + 5, from = Math.max(1, lvl - 24);
    const nodes = [];
    for (let n = top; n >= from; n--) {
      const state = n < lvl ? 'done' : n === lvl ? 'cur' : 'lock';
      const off = Math.round(Math.sin(n * 0.9) * 62);
      nodes.push(`<div class="mnode ${state}" style="--x:${off}">${n % 10 === 0 ? '<div class="mchap">Chapitre ' + (n / 10) + '</div>' : ''}
        <button class="mbtn" data-l="${n}" ${state === 'lock' ? 'disabled' : ''} aria-label="Niveau ${n}">${state === 'lock' ? MG.icon('lock') : n}</button>
        ${state === 'done' ? `<div class="mst">${[0, 1, 2].map((i) => `<i class="${i < (stars[n] || 0) ? 'on' : ''}">${MG.icon('star')}</i>`).join('')}</div>` : ''}
        ${state === 'cur' ? `<img class="mmilo" src="${A(MILO.clin)}" alt="">` : ''}</div>`);
    }
    root.innerHTML = `<div class="gtop"><button class="gclose" data-c="close" aria-label="Quitter">${MG.icon('x')}</button><div class="grow"></div><div class="c-total">${MG.icon('star')}${totalStars}</div></div>
      <img class="c-logo" src="${MG.asset('logo_crush.webp')}" alt="Milo Crush">
      <div class="c-map gscroll">${nodes.join('')}</div>
      <div class="c-mapfoot"><button class="gbtn pink" data-l="${lvl}">${MG.icon('play')}${d.current && d.current.L === lvl ? 'Reprendre' : 'Jouer'} · niveau ${lvl}</button></div>`;
    const cur = root.querySelector('.mnode.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
    root.onclick = (e) => {
      const b = e.target.closest('[data-l],[data-c]'); if (!b || b.closest('.gmodal')) return;
      if (b.dataset.c === 'close') { api.close(); return; }
      if (b.dataset.l) intro(+b.dataset.l);
    };
  }

  /* ---------- Module ---------- */
  MG.register({
    id: 'crush', name: 'Milo Crush', logo: 'logo_crush.webp', theme: 'crush',
    mount(frame, a, opts) {
      api = a; api.data.stats = api.data.stats || {}; api.data.level = api.data.level || 1;
      root = document.createElement('div'); root.className = 'crush-root'; frame.insertBefore(root, frame.firstChild);
      window.addEventListener('resize', onResize);
      if (opts.level) startLevel(opts.level, true); else showMap();
    },
    unmount() { if (st && !st.done && UI.alive) persist(); UI.alive = false; clearHint(); window.removeEventListener('resize', onResize); root = null; st = null; },
    card(d) {
      const lvl = d.level || 1, stars = Object.values(d.stars || {}).reduce((a, b) => a + b, 0), s = d.stats || {};
      return { desc: 'Échange les Milo pour en aligner trois ou plus. Rayés, bombes, arc-en-ciel : des niveaux à l’infini.',
        stats: [['Niveau', lvl, 'flame'], ['Étoiles', stars, 'star'], ['Record', MG.fmt(s.bestScore || 0), 'trophy']],
        progress: ((lvl - 1) % 10) / 10, progressLabel: `Chapitre ${Math.floor((lvl - 1) / 10) + 1} · niveau ${((lvl - 1) % 10) + 1} sur 10`,
        cta: d.current ? `Reprendre le niveau ${d.current.L}` : `Jouer au niveau ${lvl}` };
    },
    homeLine(d) { return `Milo Crush niveau ${d.level || 1}`; },
    _debug: { makeLevel, findGroups: () => findGroups(), findMove: () => findMove(), state: () => st, ui: UI }
  });

  /* ---------- Styles ---------- */
  const css = `
  .gscreen.crush{background:radial-gradient(circle at 15% 10%,#ffd6ee 0,transparent 45%),radial-gradient(circle at 90% 30%,#cdbbff 0,transparent 45%),radial-gradient(circle at 30% 95%,#bfe3ff 0,transparent 50%),linear-gradient(170deg,#fde7f5,#eee4ff 50%,#e2ecff)}
  .crush-root{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;z-index:1}
  .c-lvl{font-size:18px;font-weight:900;color:#5b2bd6;background:rgba(255,255,255,.75);padding:7px 14px;border-radius:20px;box-shadow:0 4px 12px rgba(90,40,170,.12)}
  .c-scorebox{display:flex;flex-direction:column;align-items:flex-end;line-height:1}
  .c-scorebox span{font-size:11px;font-weight:900;color:#8a6bd8;text-transform:uppercase;letter-spacing:.5px}
  .c-scorebox b{font-size:22px;font-weight:900;color:#3b1d93;font-variant-numeric:tabular-nums}
  .c-scorebox.bump b{animation:cbump .35s cubic-bezier(.34,1.7,.5,1)}
  @keyframes cbump{50%{transform:scale(1.25)}}
  .c-hud{margin:4px 12px 0;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,240,250,.85));box-shadow:0 8px 22px rgba(120,60,190,.15),inset 0 1px 0 #fff}
  .c-moves{width:64px;flex:none;text-align:center;line-height:1}
  .c-moves b{display:block;font-size:34px;font-weight:900;color:#e0418f;font-variant-numeric:tabular-nums;text-shadow:0 2px 0 #fff}
  .c-moves span{font-size:11px;font-weight:900;color:#b36b9a;text-transform:uppercase;letter-spacing:.5px}
  .c-moves.low b{animation:clow 1s ease-in-out infinite}
  @keyframes clow{50%{transform:scale(1.15);color:#ff2d6f}}
  .c-goalbox{flex:1;min-width:0;display:flex;flex-direction:column;gap:9px}
  .c-goal{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
  .gpill{display:inline-flex;align-items:center;gap:6px;background:#fff;border-radius:20px;padding:4px 12px 4px 5px;box-shadow:0 2px 8px rgba(120,60,190,.15)}
  .gpill img{width:28px;height:28px;object-fit:contain}
  .gpill b{font-size:17px;font-weight:900;color:#4b2ab8;font-variant-numeric:tabular-nums}
  .gpill .gi{width:22px;height:22px;fill:#ffd23f;stroke:#e8a400}
  .gpill.ok{background:#e7fbef}.gpill.ok b .gi{fill:#35c27f;stroke:#1f9a5f}
  .gj{display:inline-block;width:24px;height:24px;border-radius:7px;background:linear-gradient(145deg,rgba(255,140,200,.9),rgba(240,80,160,.75));box-shadow:inset 0 2px 0 rgba(255,255,255,.6)}
  .gice{display:inline-block;width:24px;height:24px;border-radius:7px;background:linear-gradient(150deg,#e3f5ff,#5aaef0);box-shadow:inset 0 0 0 2px #fff,0 1px 3px rgba(40,100,190,.45)}
  .c-starbar{position:relative;height:9px;border-radius:9px;background:#f3d9ec;margin:0 10px}
  .c-starbar>i{position:absolute;left:0;top:0;bottom:0;border-radius:9px;background:linear-gradient(90deg,#4fb3ff,#9b5cf6,#ff7eb3);transition:width .4s ease}
  .cstar{position:absolute;top:50%;transform:translate(-50%,-50%);width:22px;height:22px;display:grid;place-items:center}
  .cstar .gi{width:22px;height:22px;fill:#e9d6ef;stroke:#fff;stroke-width:1.5}
  .cstar.on .gi{fill:#ffd23f;stroke:#e8a400;animation:cbump .4s}
  .c-milo{width:58px;height:58px;flex:none;border-radius:50%;background:radial-gradient(circle,#fff 55%,#f1e6ff);display:grid;place-items:center;box-shadow:0 4px 12px rgba(120,60,190,.2)}
  .c-milo img{width:54px;height:54px;object-fit:contain}
  .c-milo.jump{animation:cjump .5s cubic-bezier(.34,1.7,.5,1)}
  @keyframes cjump{40%{transform:translateY(-8px) scale(1.1)}}
  .c-boardwrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:8px}
  .c-board{position:relative;touch-action:none;clip-path:inset(-10px -10px -10px -10px round 14px)}
  .c-board.shake{animation:cshake .35s}
  @keyframes cshake{20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-3px,-1px)}80%{transform:translate(2px,1px)}}
  .cc{position:absolute;left:0;top:0;background:rgba(255,255,255,.62);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7);border-radius:10px}
  .cc.alt{background:rgba(245,236,255,.75)}
  .cc.jelly{background:linear-gradient(145deg,#ffb3dc,#f0569f);box-shadow:inset 0 0 0 2px rgba(255,255,255,.85),inset 0 4px 0 rgba(255,255,255,.55),0 0 0 1px rgba(240,86,159,.35)}
  .cc.unjelly{animation:cunjelly .4s}
  @keyframes cunjelly{0%{filter:brightness(1.8)}100%{filter:none}}
  .ct{position:absolute;left:0;top:0;will-change:transform;transition:transform var(--d,160ms) cubic-bezier(.33,0,.4,1);z-index:2}
  .ci{width:100%;height:100%;padding:7%;position:relative;transform-origin:50% 85%}
  .ci img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 3px 3px rgba(90,30,140,.28))}
  .ct.sel{z-index:4}.ct.sel .ci{animation:csel .8s ease-in-out infinite}
  @keyframes csel{0%,100%{transform:scale(1.1)}50%{transform:scale(1.18,1.04)}}
  .ct.land .ci{animation:cland .34s cubic-bezier(.3,1.6,.5,1)}
  @keyframes cland{0%{transform:scale(1.16,.8)}55%{transform:scale(.94,1.07)}100%{transform:none}}
  .ct.pop{z-index:3}.ct.pop .ci{animation:cpop .25s ease-in forwards}
  @keyframes cpop{0%{transform:scale(1)}35%{transform:scale(1.32);filter:brightness(1.7)}100%{transform:scale(0);opacity:0}}
  .ct.born .ci{animation:cborn .5s cubic-bezier(.34,1.8,.5,1)}
  @keyframes cborn{0%{transform:scale(.2) rotate(-20deg)}100%{transform:none}}
  .ct.hint .ci{animation:chint 1.1s ease-in-out 3}
  @keyframes chint{0%,100%{transform:none}25%{transform:scale(1.12) rotate(-6deg)}75%{transform:scale(1.12) rotate(6deg)}}
  .ct.nope .ci{animation:cnope .35s}
  @keyframes cnope{25%{transform:translateX(-10%) scaleX(.9)}75%{transform:translateX(10%) scaleX(.9)}}
  .ci .stripes{position:absolute;inset:22% 18% 18%;border-radius:40%;background:repeating-linear-gradient(0deg,rgba(255,255,255,.9) 0 3px,transparent 3px 8px);mix-blend-mode:soft-light;opacity:.95;pointer-events:none}
  .ci.sp-col .stripes{background:repeating-linear-gradient(90deg,rgba(255,255,255,.95) 0 3px,transparent 3px 8px)}
  .ci.sp-row,.ci.sp-col{filter:drop-shadow(0 0 4px rgba(255,255,255,.9))}
  .ci.sp-row img,.ci.sp-col img{filter:drop-shadow(0 3px 3px rgba(90,30,140,.28)) saturate(1.25)}
  .ci.sp-bomb:before{content:"";position:absolute;inset:2%;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.95) 30%,rgba(255,220,120,.6) 55%,transparent 72%);animation:cglow 1.4s ease-in-out infinite}
  .ci.sp-bomb img{position:relative}
  @keyframes cglow{50%{transform:scale(1.12);opacity:.75}}
  .ci.sp-rainbow:before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(#ff7eb3,#ffd23f,#4ade80,#2dd4bf,#4fb3ff,#9b5cf6,#ff7eb3);animation:cspin 2.4s linear infinite;-webkit-mask:radial-gradient(circle,transparent 52%,#000 54%);mask:radial-gradient(circle,transparent 52%,#000 54%)}
  .ci.sp-rainbow img{position:relative;transform:scale(.82)}
  @keyframes cspin{to{transform:rotate(360deg)}}
  .cice{position:absolute;left:0;top:0;z-index:3;padding:4%;pointer-events:none}
  .cice i{display:block;position:relative;width:100%;height:100%;border-radius:22%;background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.95) 0 14%,transparent 15%),linear-gradient(150deg,#e3f5ff 0%,#9fd6ff 55%,#5aaef0 100%);box-shadow:inset 0 0 0 2px rgba(255,255,255,.95),inset 0 -6px 0 rgba(40,110,200,.35),0 4px 8px rgba(40,100,190,.4)}
  .cice.hp2 i{background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.95) 0 14%,transparent 15%),linear-gradient(150deg,#c9e9ff 0%,#6fbdf7 55%,#2f86d9 100%)}
  .cice i:before{content:"";position:absolute;left:50%;top:50%;width:46%;height:46%;transform:translate(-50%,-50%);background:conic-gradient(from 0deg,transparent 0 40deg,rgba(255,255,255,.9) 40deg 50deg,transparent 50deg 100deg,rgba(255,255,255,.9) 100deg 110deg,transparent 110deg 160deg,rgba(255,255,255,.9) 160deg 170deg,transparent 170deg 220deg,rgba(255,255,255,.9) 220deg 230deg,transparent 230deg 280deg,rgba(255,255,255,.9) 280deg 290deg,transparent 290deg 340deg,rgba(255,255,255,.9) 340deg 350deg,transparent 350deg);border-radius:50%;opacity:.85}
  .cice.hp1 i:after{content:"";position:absolute;inset:28% 22%;border-top:2.5px solid rgba(255,255,255,.95);border-left:2px solid rgba(255,255,255,.6);transform:rotate(-28deg)}
  .cice.break{animation:cpop .3s ease-in forwards}
  .cbeam{position:absolute;z-index:6;pointer-events:none;border-radius:20px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95),transparent);box-shadow:0 0 18px 6px rgba(255,255,255,.8);animation:cbeam .5s ease-out forwards}
  .cbeam.v{background:linear-gradient(180deg,transparent,rgba(255,255,255,.95),transparent)}
  @keyframes cbeam{0%{opacity:0;transform:scale(.2)}30%{opacity:1;transform:scale(1)}100%{opacity:0}}
  .cfloat{position:absolute;z-index:44;transform:translate(-50%,-50%);font-weight:900;font-size:20px;color:#fff;-webkit-text-stroke:1.5px #c2338a;paint-order:stroke fill;pointer-events:none;animation:cfloat .9s ease-out forwards}
  @keyframes cfloat{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}20%{opacity:1;transform:translate(-50%,-60%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-160%)}}
  .c-tip{text-align:center;font-size:13px;font-weight:800;color:#7a54c8;padding:4px 16px 14px}
  .c-logo{display:block;height:min(26vh,190px);width:auto;max-width:80%;margin:-14px auto 0;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(120,40,170,.25));position:relative;z-index:2}
  .c-total{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.85);padding:7px 13px;border-radius:20px;font-weight:900;color:#5b2bd6}
  .c-total .gi{fill:#ffd23f;stroke:#e8a400}
  .c-map{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;overscroll-behavior:contain;padding:10px 0 30px;-webkit-overflow-scrolling:touch;-webkit-mask:linear-gradient(transparent,#000 5%,#000 92%,transparent)}
  .mnode{position:relative;display:flex;flex-direction:column;align-items:center;padding:12px 0;transform:translateX(calc(var(--x) * 1px))}
  .mnode:not(:last-child):after{content:"";position:absolute;bottom:-8px;left:50%;width:6px;height:18px;border-radius:6px;background:repeating-linear-gradient(180deg,rgba(255,255,255,.9) 0 5px,transparent 5px 9px)}
  .mbtn{width:62px;height:62px;border-radius:50%;border:0;font-size:22px;font-weight:900;color:#fff;background:linear-gradient(150deg,#ff9fd0,#e0418f);box-shadow:0 6px 0 #b42b70,0 10px 18px rgba(180,40,110,.35),inset 0 3px 0 rgba(255,255,255,.45);display:grid;place-items:center}
  .mbtn:active{transform:translateY(3px);box-shadow:0 3px 0 #b42b70}
  .mnode.cur .mbtn{width:74px;height:74px;font-size:26px;background:linear-gradient(150deg,#b99bff,#6c3ff0);box-shadow:0 6px 0 #4a24b8,0 0 0 8px rgba(255,255,255,.7),0 14px 26px rgba(90,40,200,.4),inset 0 3px 0 rgba(255,255,255,.45);animation:cjump 1.6s ease-in-out infinite}
  .mnode.lock .mbtn{background:linear-gradient(150deg,#e7e1f5,#c9bfe6);box-shadow:0 5px 0 #a99cd0;color:#8b80b0}
  .mnode.lock .mbtn .gi{width:22px;height:22px}
  .mst{display:flex;gap:2px;margin-top:6px}.mst i .gi{width:16px;height:16px;fill:#e8dcef;stroke:#fff}.mst i.on .gi{fill:#ffd23f;stroke:#e8a400}
  .mmilo{position:absolute;left:calc(50% + 46px);top:0;width:64px;height:64px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(90,40,200,.25))}
  .mchap{font-size:12px;font-weight:900;color:#8a6bd8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;background:rgba(255,255,255,.7);padding:4px 12px;border-radius:20px}
  .c-mapfoot{padding:10px 20px 18px;display:flex;justify-content:center}
  .c-mapfoot .gbtn{min-width:240px;font-size:18px;padding:16px 26px}
  .ipills{display:flex;justify-content:center;gap:8px;margin:10px 0 6px;flex-wrap:wrap}
  .ipill{display:inline-flex;align-items:center;gap:6px;background:#f6f0ff;border-radius:16px;padding:6px 12px}
  .ipill img{width:34px;height:34px;object-fit:contain}.ipill b{font-size:20px;font-weight:900;color:#4b2ab8}.ipill .gi{width:22px;height:22px;fill:#ffd23f;stroke:#e8a400}
  .ipill.moves{background:#ffe8f3}.ipill.moves b{color:#e0418f}.ipill small{font-size:11px;font-weight:800;color:#b36b9a}
  .itip{background:#fff7e0;border-radius:14px;padding:8px 12px;font-size:13px!important;color:#8a6200!important;margin-top:8px!important}
  .wstars{display:flex;justify-content:center;gap:6px;margin:6px 0}
  .wstars span{opacity:0;animation:wstar .5s cubic-bezier(.34,1.8,.5,1) forwards}
  .wstars .gi{width:46px;height:46px;fill:#eadff3;stroke:#fff;stroke-width:1.5}
  .wstars span.on .gi{fill:#ffd23f;stroke:#e8a400}
  .wstars span:nth-child(2) .gi{width:58px;height:58px;margin-top:-10px}
  @keyframes wstar{0%{opacity:0;transform:scale(.2) rotate(-40deg)}100%{opacity:1;transform:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
