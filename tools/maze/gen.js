// Générateur + solveur des niveaux de Milo Maze (exécuté hors ligne, produit games/maze-levels.js)
'use strict';
const fs = require('fs');
const W = 11;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const BOOST = { '^': 0, '>': 1, 'v': 2, '<': 3 };
const mkRng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

function portalOther(g, x, y, c) { for (let yy = 0; yy < g.length; yy++) for (let xx = 0; xx < W; xx++) if (g[yy][xx] === c && (xx !== x || yy !== y)) return [xx, yy]; return null; }
// Glissade : même règle que le moteur du jeu
function slide(g, x, y, d) {
  const path = [], seen = new Set();
  for (let i = 0; i < 400; i++) {
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1], c = g[ny] && g[ny][nx];
    if (c === undefined || c === '#') return { x, y, d, path, exit: false };
    x = nx; y = ny; path.push([x, y]);
    if (c === 'E') return { x, y, d, path, exit: true };
    if (c in BOOST) d = BOOST[c];
    else if (c >= '1' && c <= '4') { const o = portalOther(g, x, y, c); if (o) { x = o[0]; y = o[1]; path.push([x, y]); } }
    const k = x * 4096 + y * 4 + d; if (seen.has(k)) return { loop: true, path }; seen.add(k);
  }
  return { loop: true, path: [] };
}
function solve(g, sx, sy) {
  const id = (x, y) => y * W + x, states = new Map(), order = [];
  const add = (x, y) => { const k = id(x, y); if (!states.has(k)) { states.set(k, { x, y, edges: [] }); order.push(k); } return k; };
  add(sx, sy);
  for (let qi = 0; qi < order.length; qi++) {
    const s = states.get(order[qi]);
    for (let d = 0; d < 4; d++) {
      const r = slide(g, s.x, s.y, d);
      if (r.loop) return { bad: 'loop' };
      if (!r.path.length) continue;
      if (r.exit) s.edges.push({ d, to: -1, path: r.path });
      else { const k = add(r.x, r.y); if (k !== order[qi]) s.edges.push({ d, to: k, path: r.path }); }
    }
  }
  const can = new Set(); let ch = true;
  while (ch) { ch = false; for (const k of order) { if (can.has(k)) continue; if (states.get(k).edges.some((e) => e.to === -1 || can.has(e.to))) { can.add(k); ch = true; } } }
  const soft = order.filter((k) => !can.has(k));
  if (!can.has(order[0])) return { bad: 'noexit' };
  // plus court chemin
  const prev = new Map([[order[0], null]]), q = [order[0]]; let fin = null;
  for (let qi = 0; qi < q.length && !fin; qi++) { const k = q[qi]; for (const e of states.get(k).edges) { if (e.to === -1) { fin = { k, e }; break; } if (!prev.has(e.to)) { prev.set(e.to, { k, e }); q.push(e.to); } } }
  const sol = []; let cur = fin; sol.unshift(cur.e); let k = cur.k; while (prev.get(k)) { const p = prev.get(k); sol.unshift(p.e); k = p.k; }
  const trav = new Set(); order.forEach((kk) => states.get(kk).edges.forEach((e) => e.path.forEach(([x, y]) => trav.add(id(x, y)))));
  const solTiles = new Set(); sol.forEach((e) => e.path.forEach(([x, y]) => solTiles.add(id(x, y))));
  const solRest = new Set([order[0]]); sol.forEach((e) => { if (e.to !== -1) solRest.add(e.to); });
  return { states, order, soft, sol, trav, solTiles, rest: new Set(order), solRest };
}

function carve(g, res, x, y, d, L, H) {
  const [dx, dy] = DIRS[d];
  for (let i = 1; i <= L; i++) { const tx = x + dx * i, ty = y + dy * i; if (tx < 1 || tx > W - 2 || ty < 1 || ty > H - 2 || res.has(ty * W + tx)) return null; }
  const sx = x + dx * (L + 1), sy = y + dy * (L + 1);
  if (sx < 0 || sx > W - 1 || sy < 0 || sy > H - 1 || g[sy][sx] !== '#') return null;
  for (let i = 1; i <= L; i++) if (g[y + dy * i][x + dx * i] === '#') g[y + dy * i][x + dx * i] = ' ';
  res.add(sy * W + sx);
  return [x + dx * L, y + dy * L];
}
const clone = (g) => g.map((r) => r.slice());

function makeLevel(cfg, seed) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const R = mkRng(seed * 7919 + attempt * 104729), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = (arr) => arr[Math.floor(R() * arr.length)];
    const H = cfg.h, g = Array.from({ length: H }, () => Array(W).fill('#')), res = new Set();
    const sx = ri(3, 7), sy = H - 2; g[sy][sx] = 'S';
    let x = sx, y = sy, lastV = false, moves = 0, guard = 0;
    while (y > 2 && guard++ < 300) {
      let d;
      if (lastV) d = R() < 0.5 ? 1 : 3; else d = R() < 0.9 ? 0 : 2;
      if (moves === 0) d = 0;
      let L;
      if (d === 0) L = ri(2, Math.min(cfg.up, y - 1)); else if (d === 2) L = ri(1, 2); else L = ri(2, 8);
      const r = carve(g, res, x, y, d, L, H);
      if (!r) continue;
      [x, y] = r; moves++; lastV = d % 2 === 0;
    }
    if (y > 2) continue;
    g[y][x] = 'E';
    let sol = solve(g, sx, sy); if (sol.bad || sol.soft.length) continue;
    // branches (impasses, salles) validées une à une
    let branches = 0;
    for (let b = 0; b < cfg.branches * 4 && branches < cfg.branches; b++) {
      const g2 = clone(g), res2 = new Set(res);
      const restArr = [...sol.rest].map((k) => [k % W, Math.floor(k / W)]);
      let [bx, by] = R() < 0.75 ? pick(restArr) : pick([...sol.trav].map((k) => [k % W, Math.floor(k / W)]));
      let ok = false;
      for (let c = 0, n = ri(1, 3); c < n; c++) { const r = carve(g2, res2, bx, by, ri(0, 3), ri(1, 5), H); if (!r) break; [bx, by] = r; ok = true; }
      if (!ok) continue;
      if (R() < cfg.rooms) { const rx = Math.max(1, Math.min(W - 3, bx + ri(-1, 0))), ry = Math.max(2, Math.min(H - 3, by + ri(-1, 0))); for (let yy = ry; yy < ry + 2; yy++) for (let xx = rx; xx < rx + 2; xx++) if (!res2.has(yy * W + xx) && g2[yy][xx] === '#') g2[yy][xx] = ' '; }
      const s2 = solve(g2, sx, sy); if (s2.bad || s2.soft.length) continue;
      for (let yy = 0; yy < H; yy++) g[yy] = g2[yy]; res.clear(); res2.forEach((v) => res.add(v)); sol = s2; branches++;
    }
    if (sol.sol.length < cfg.minMoves || sol.sol.length > cfg.maxMoves) continue;
    const lvl = decorate(g, sol, cfg, R, sx, sy, H);
    if (!lvl) continue;
    return lvl;
  }
  throw new Error('génération impossible ' + JSON.stringify(cfg));
}

function decorate(g, sol, cfg, R, sx, sy, H) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const id = (x, y) => y * W + x, XY = (k) => [k % W, Math.floor(k / W)];
  const ents = [];
  const isRest = (k) => sol.rest.has(k);
  const near = (k, k2, r) => { const [a, b] = XY(k), [c, d] = XY(k2); return Math.abs(a - c) + Math.abs(b - d) <= r; };
  const S = id(sx, sy); let Ek = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'E') Ek = id(x, y);
  const used = new Set([S, Ek]);
  const free = (k) => !used.has(k) && !isRest(k) && !near(k, S, 2) && !near(k, Ek, 1);
  // éléments qui modifient le déplacement : boosters, portails, portes (validés)
  const tryPlace = (k, ch) => { const [x, y] = XY(k), old = g[y][x]; g[y][x] = ch; const s = solve(g, sx, sy); if (s.bad || s.soft.length || s.sol.length < cfg.minMoves - 2) { g[y][x] = old; return null; } return s; };
  let nb = cfg.boosters || 0;
  for (const k of shuffle([...sol.trav].filter(free))) { if (!nb) break; const [x, y] = XY(k); const opts = [0, 1, 2, 3].filter((d) => { const t = g[y + DIRS[d][1]][x + DIRS[d][0]]; return t !== '#' && t !== undefined; }); if (!opts.length) continue; const d = opts[Math.floor(R() * opts.length)]; const s = tryPlace(k, '^>v<'[d]); if (s) { sol = s; used.add(k); nb--; } }
  let np = cfg.portals || 0, digit = 1;
  const restDead = () => [...sol.rest].filter((k) => !sol.solRest.has(k) && !used.has(k) && !near(k, S, 2) && !near(k, Ek, 1));
  for (let t = 0; t < 30 && np > 0; t++) {
    const cand = shuffle([...sol.trav].filter(free)); if (cand.length < 2) break;
    const a = cand[0], b = cand.find((k) => { const [x1, y1] = XY(a), [x2, y2] = XY(k); return Math.abs(y1 - y2) > 6; }); if (b == null) continue;
    const [ax, ay] = XY(a), [bx, by] = XY(b), oa = g[ay][ax], ob = g[by][bx]; g[ay][ax] = String(digit); g[by][bx] = String(digit);
    const s = solve(g, sx, sy);
    const usesPortal = s && !s.bad && [...s.trav].includes(b);
    if (s.bad || s.soft.length || !usesPortal || s.sol.length < cfg.minMoves - 2) { g[ay][ax] = oa; g[by][bx] = ob; continue; }
    sol = s; used.add(a); used.add(b); digit++; np--;
  }
  let nd = cfg.doors || 0;
  for (const k of shuffle([...sol.solTiles].filter(free))) { if (!nd) break; const [x, y] = XY(k); const s = tryPlace(k, 'D'); if (s) { sol = s; used.add(k); DIRS.forEach(([dx, dy]) => used.add(id(x + dx, y + dy))); nd--; } }
  // pièges temporisés sur le chemin (jamais sur une case d'arrêt)
  const onSol = shuffle([...sol.solTiles].filter(free));
  const timed = [['x', cfg.spikes || 0], ['z', cfg.elec || 0], ['k', cfg.blink || 0]];
  for (const [ch, n0] of timed) { let n = n0; for (const k of onSol) { if (!n) break; if (used.has(k)) continue; const [x, y] = XY(k); if (g[y][x] !== ' ') continue; g[y][x] = ch; used.add(k); n--; } }
  // segments rectilignes libres (pour lasers, scies, patrouilles)
  const run = (k, axis) => { const [x, y] = XY(k), [dx, dy] = axis ? [0, 1] : [1, 0]; let a = 0, b = 0; const okc = (xx, yy) => { const c = g[yy] && g[yy][xx]; return c !== undefined && c !== '#' && c !== 'D' && c !== 'E' && !(c >= '1' && c <= '4'); };
    while (okc(x - dx * (a + 1), y - dy * (a + 1))) a++; while (okc(x + dx * (b + 1), y + dy * (b + 1))) b++;
    const cells = []; for (let i = -a; i <= b; i++) cells.push(id(x + dx * i, y + dy * i)); return cells; };
  const segOk = (cells) => cells.every((c) => !isRest(c) && !near(c, S, 2) && !near(c, Ek, 1));
  const solArr = shuffle([...sol.solTiles].filter(free));
  const segUsed = new Set();
  const place = (type, n, minLen, maxLen, mk) => {
    for (const k of solArr) { if (!n) return; for (const axis of shuffle([0, 1])) { const cells = run(k, axis); if (cells.length < minLen || cells.length > maxLen || !segOk(cells) || cells.some((c) => segUsed.has(c))) continue; cells.forEach((c) => segUsed.add(c)); const a = XY(cells[0]), b = XY(cells[cells.length - 1]); ents.push(mk(a, b, axis)); n--; break; } }
  };
  // axe de déplacement de Milo sur chaque case du chemin
  const axisOf = new Map(); sol.sol.forEach((e) => e.path.forEach(([x, y]) => { const k = id(x, y); if (!axisOf.has(k)) axisOf.set(k, e.d % 2); }));
  const okTile = (k) => free(k) && !segUsed.has(k) && axisOf.has(k) && !near(k, S, 3) && !near(k, Ek, 2) && [...segUsed].every((u) => !near(u, k, 2));
  // laser : barre le couloir perpendiculairement (entre deux murs)
  let nl = cfg.lasers || 0;
  for (const k of solArr) {
    if (!nl) break; if (!okTile(k)) continue;
    const cells = run(k, axisOf.get(k) === 0 ? 0 : 1); if (cells.length > 5 || !segOk(cells) || cells.some((c) => segUsed.has(c))) continue;
    cells.forEach((c) => segUsed.add(c)); ents.push({ t: 'laser', a: XY(cells[0]), b: XY(cells[cells.length - 1]), per: +(2.2 + R() * 0.8).toFixed(2), on: 0.95, ph: +R().toFixed(2) }); nl--;
  }
  // scies, blocs, patrouilles : va-et-vient depuis une niche latérale qui croise le couloir
  const cross = (n, mk) => {
    for (const k of solArr) {
      if (!n) return; if (!okTile(k)) continue;
      const [x, y] = XY(k), ax = axisOf.get(k), perp = ax === 0 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      for (const [px, py] of shuffle(perp.slice())) {
        const c1 = [x + px, y + py], c2 = [x + 2 * px, y + 2 * py], c3 = [x + 3 * px, y + 3 * py];
        if ([c1, c2].some(([cx, cy]) => cx < 1 || cx > W - 2 || cy < 2 || cy > H - 3 || g[cy][cx] !== '#')) continue;
        if (c3[0] < 0 || c3[0] > W - 1 || g[c3[1]] === undefined) continue;
        // côté opposé : on prolonge si c'est ouvert (sans case d'arrêt)
        const o1 = [x - px, y - py], oc = g[o1[1]] && g[o1[1]][o1[0]], ext = oc && oc !== '#' && !isRest(id(...o1)) && !'DE1234'.includes(oc);
        g[c1[1]][c1[0]] = ' '; g[c2[1]][c2[0]] = ' ';
        const s2 = solve(g, sx, sy);
        if (s2.bad || s2.soft.length || s2.rest.has(id(...c1)) || s2.rest.has(id(...c2)) || s2.sol.length < cfg.minMoves - 2) { g[c1[1]][c1[0]] = '#'; g[c2[1]][c2[0]] = '#'; continue; }
        sol = s2; [k, id(...c1), id(...c2)].concat(ext ? [id(...o1)] : []).forEach((c) => segUsed.add(c));
        ents.push(mk(c2, ext ? o1 : [x, y])); n--; break;
      }
    }
  };
  cross(cfg.saws || 0, (a, b) => ({ t: 'saw', a, b, sp: +(cfg.esp * (0.9 + R() * 0.3)).toFixed(2), ph: +R().toFixed(2) }));
  cross(cfg.patrols || 0, (a, b) => ({ t: cfg.patrolKind || 'slime', a, b, sp: +(cfg.esp * (0.8 + R() * 0.25)).toFixed(2), ph: +R().toFixed(2) }));
  cross(cfg.blocks || 0, (a, b) => ({ t: 'block', a, b, sp: +(cfg.esp * 0.7).toFixed(2), ph: +R().toFixed(2) }));
  // ennemis libres
  const dead = shuffle(restDead()).filter((k) => { const [x, y] = XY(k); return Math.abs(y - sy) > 6; });
  for (let i = 0; i < (cfg.chasers || 0) && dead.length; i++) { const k = dead.pop(); used.add(k); ents.push({ t: 'chaser', a: XY(k), sp: cfg.chaseSp || 2.6, r: 6 }); }
  const wcand = shuffle([...sol.trav].filter((k) => free(k) && !segUsed.has(k) && [...sol.rest].every((r) => { const [a, b] = XY(k), [c, d] = XY(r); return Math.max(Math.abs(a - c), Math.abs(b - d)) > 1; })));
  for (let i = 0; i < (cfg.wisps || 0) && wcand.length; i++) { const k = wcand.pop(); used.add(k); segUsed.add(k); ents.push({ t: 'wisp', a: XY(k), sp: +(cfg.esp * 0.5).toFixed(2), amp: 1.1, ph: +R().toFixed(2) }); }
  // gardien : se décale dans une niche creusée à côté du couloir
  let ng = cfg.guards || 0;
  for (const k of solArr) {
    if (!ng) break; if (used.has(k) || segUsed.has(k)) continue; const [x, y] = XY(k);
    for (const d of shuffle([0, 1, 2, 3])) { const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (nx < 1 || nx > W - 2 || ny < 2 || ny > H - 3 || g[ny][nx] !== '#') continue;
      g[ny][nx] = ' '; const s = solve(g, sx, sy); if (s.bad || s.soft.length || s.rest.has(id(nx, ny)) || s.trav.has(id(nx, ny))) { g[ny][nx] = '#'; continue; }
      sol = s; used.add(k); ents.push({ t: 'guard', a: [x, y], b: [nx, ny], per: 2.8, ph: +R().toFixed(2) }); ng--; break; }
  }
  // bonus : de préférence au bout des impasses
  const bon = cfg.bonus || [];
  const bcand = shuffle(restDead().filter((k) => !used.has(k))).concat(shuffle([...sol.trav].filter((k) => free(k) && !segUsed.has(k) && !used.has(k))));
  for (const ch of bon) { const k = bcand.shift(); if (k == null) break; const [x, y] = XY(k); if (g[y][x] !== ' ') continue; g[y][x] = ch; used.add(k); }
  // pièces sur toutes les cases réellement parcourables
  let coins = 0;
  for (const k of sol.trav) { const [x, y] = XY(k); if (g[y][x] === ' ' && !segUsed.has(k) && R() < 0.88) { g[y][x] = '.'; coins++; } }
  for (const k of segUsed) { const [x, y] = XY(k); if (g[y][x] === ' ' && R() < 0.6) { g[y][x] = '.'; coins++; } }
  const fin = solve(g, sx, sy); if (fin.bad || fin.soft.length) return null;
  const tiles = fin.sol.reduce((n, e) => n + e.path.length, 0), hz = ents.length + (cfg.spikes || 0) + (cfg.elec || 0) + (cfg.blink || 0) + (cfg.doors || 0);
  const par = Math.round(fin.sol.length * 0.75 + tiles / 12 + hz * 0.9 + 3);
  return { h: H, rows: g.map((r) => r.join('')), ents, coins, moves: fin.sol.length, par, sol: fin.sol.map((e) => e.d).join('') };
}

/* ---------- Mondes ---------- */
const WORLDS = [
  { id: 'ruines', levels: [
    { h: 26, up: 5, minMoves: 6, maxMoves: 10, branches: 3, rooms: 0.2, bonus: [] },
    { h: 30, up: 5, minMoves: 7, maxMoves: 12, branches: 4, rooms: 0.25, bonus: ['B'] },
    { h: 33, up: 6, minMoves: 8, maxMoves: 13, branches: 4, rooms: 0.3, bonus: ['M'], spikes: 2 },
    { h: 36, up: 6, minMoves: 9, maxMoves: 15, branches: 5, rooms: 0.3, bonus: ['B'], spikes: 3 },
    { h: 40, up: 6, minMoves: 10, maxMoves: 16, branches: 5, rooms: 0.3, bonus: ['M', 'B'], spikes: 3, patrols: 1, esp: 2.2 },
    { h: 44, up: 6, minMoves: 11, maxMoves: 18, branches: 6, rooms: 0.3, bonus: ['B', 'M'], spikes: 4, patrols: 2, esp: 2.3 }
  ] },
  { id: 'temple', levels: [
    { h: 34, up: 6, minMoves: 9, maxMoves: 15, branches: 5, rooms: 0.25, bonus: ['V'], lasers: 1, saws: 1, esp: 2.4 },
    { h: 38, up: 6, minMoves: 10, maxMoves: 16, branches: 5, rooms: 0.25, bonus: ['B', 'V'], lasers: 2, boosters: 1, esp: 2.4 },
    { h: 42, up: 6, minMoves: 10, maxMoves: 17, branches: 6, rooms: 0.3, bonus: ['M'], saws: 2, patrols: 1, patrolKind: 'bat', boosters: 1, esp: 2.6 },
    { h: 45, up: 6, minMoves: 11, maxMoves: 18, branches: 6, rooms: 0.3, bonus: ['B', 'V'], lasers: 2, saws: 2, spikes: 2, esp: 2.7 },
    { h: 48, up: 7, minMoves: 12, maxMoves: 20, branches: 6, rooms: 0.3, bonus: ['M', 'B'], lasers: 2, patrols: 2, patrolKind: 'bat', boosters: 2, esp: 2.8 },
    { h: 52, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, bonus: ['B', 'V', 'M'], lasers: 3, saws: 2, patrols: 1, patrolKind: 'bat', boosters: 1, spikes: 2, esp: 3 }
  ] },
  { id: 'galaxie', levels: [
    { h: 40, up: 6, minMoves: 10, maxMoves: 17, branches: 6, rooms: 0.3, bonus: ['T', 'B'], portals: 1, blink: 2, esp: 2.6 },
    { h: 44, up: 6, minMoves: 11, maxMoves: 18, branches: 6, rooms: 0.3, bonus: ['R', 'M'], portals: 1, blocks: 1, wisps: 1, esp: 2.7 },
    { h: 47, up: 7, minMoves: 12, maxMoves: 19, branches: 7, rooms: 0.3, bonus: ['T', 'B'], portals: 1, blocks: 2, blink: 3, esp: 2.8 },
    { h: 50, up: 7, minMoves: 12, maxMoves: 20, branches: 7, rooms: 0.3, bonus: ['R', 'V'], portals: 2, wisps: 2, saws: 1, lasers: 1, esp: 2.9 },
    { h: 54, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, bonus: ['T', 'B', 'M'], portals: 1, blocks: 2, wisps: 1, blink: 3, boosters: 1, esp: 3 },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, bonus: ['R', 'B', 'T'], portals: 2, blocks: 2, wisps: 2, lasers: 2, blink: 2, esp: 3.1 }
  ] },
  { id: 'soleil', levels: [
    { h: 46, up: 7, minMoves: 12, maxMoves: 20, branches: 6, rooms: 0.3, bonus: ['B', 'V'], elec: 3, doors: 1, esp: 3 },
    { h: 50, up: 7, minMoves: 12, maxMoves: 21, branches: 7, rooms: 0.3, bonus: ['R', 'B'], chasers: 1, chaseSp: 2.4, guards: 1, elec: 2, esp: 3 },
    { h: 54, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, bonus: ['B', 'M', 'R'], doors: 2, lasers: 2, saws: 2, guards: 1, esp: 3.2 },
    { h: 56, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, bonus: ['T', 'B', 'V'], chasers: 1, chaseSp: 2.7, elec: 3, patrols: 2, patrolKind: 'bat', boosters: 1, esp: 3.3 },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 8, rooms: 0.3, bonus: ['R', 'B', 'M'], doors: 2, chasers: 1, chaseSp: 2.8, lasers: 2, blocks: 2, guards: 1, spikes: 2, esp: 3.4 },
    { h: 64, up: 7, minMoves: 16, maxMoves: 28, branches: 9, rooms: 0.3, bonus: ['B', 'T', 'R', 'V'], chasers: 2, chaseSp: 2.9, elec: 3, doors: 2, lasers: 2, saws: 2, wisps: 1, portals: 1, guards: 1, esp: 3.5 }
  ] }
];

const out = [];
WORLDS.forEach((w, wi) => {
  const levels = w.levels.map((cfg, li) => {
    const lv = makeLevel(cfg, 1000 + wi * 50 + li * 7 + 3);
    process.stderr.write(`${wi + 1}-${li + 1}: h=${lv.h} moves=${lv.moves} coins=${lv.coins} par=${lv.par}s ents=${lv.ents.length}\n`);
    return lv;
  });
  out.push({ id: w.id, levels });
});
const js = `/* Milo Maze — niveaux (générés et vérifiés par solveur : chaque niveau est terminable, sans impasse bloquante).
   Légende : # mur · . pièce · S départ · E sortie · B bouclier · M aimant · V vitesse · R ralenti · T téléport
             x pics · z zone électrique · k cristaux · D porte temporisée · ^ > v < accélérateurs · 1-4 portails
   ents : lasers, scies, patrouilles (slime/bat), blocs mobiles, poursuivants (chaser), feux follets (wisp), gardiens (guard). */
window.MILO_MAZE_LEVELS = ${JSON.stringify(out)};
`;
fs.writeFileSync(process.argv[2] || 'maze-levels.js', js);
