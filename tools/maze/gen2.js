// Milo Maze — générateur V2 : niveaux 7 à 15, défis et niveaux secrets.
// Les 24 niveaux d'origine (gen.js → maze-levels.js) ne sont PAS régénérés.
// Usage : node gen2.js ../../public/games/maze-levels-v2.js
// Chaque niveau est vérifié par le solveur : terminable, aucun état bloquant (on peut toujours rejoindre la sortie),
// mécaniques réellement utiles (une grille bloque vraiment, un interrupteur est vraiment nécessaire),
// passage secret facultatif (jamais requis par la solution), puis le meilleur de plusieurs candidats est retenu.
'use strict';
const fs = require('fs');
const W = 11;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const BOOST = { '^': 0, '>': 1, 'v': 2, '<': 3 };
const mkRng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const id = (x, y) => y * W + x, XY = (k) => [k % W, Math.floor(k / W)];
const clone = (g) => g.map((r) => r.slice());

/* ---------- Règles de déplacement (identiques au moteur) ----------
   masque m : bit 0 = interrupteurs (0 : barrières rouges « a » fermées, bleues « b » ouvertes ; 1 : l'inverse)
              bit 1 = grilles « g » ouvertes (une plaque « P » a été touchée) */
function blocked(c, m) { return c === undefined || c === '#' || (c === 'a' && !(m & 1)) || (c === 'b' && (m & 1)) || (c === 'g' && !(m & 2)); }
function portalOther(g, x, y, c) { for (let yy = 0; yy < g.length; yy++) for (let xx = 0; xx < W; xx++) if (g[yy][xx] === c && (xx !== x || yy !== y)) return [xx, yy]; return null; }
function slide(g, x, y, d, m) {
  const path = [], seen = new Set();
  for (let i = 0; i < 700; i++) {
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1], c = g[ny] && g[ny][nx];
    if (blocked(c, m)) return { x, y, d, m, path, exit: false };
    x = nx; y = ny; path.push([x, y]);
    if (c === 'E') return { x, y, d, m, path, exit: true };
    if (c === 'o') m ^= 1; else if (c === 'P') m |= 2;
    if (c in BOOST) d = BOOST[c];
    else if (c >= '1' && c <= '4') { const o = portalOther(g, x, y, c); if (o) { x = o[0]; y = o[1]; path.push([x, y]); } }
    const k = ((y * W + x) * 4 + d) * 4 + m; if (seen.has(k)) return { loop: true, path }; seen.add(k);
  }
  return { loop: true, path: [] };
}
// graphe des états d'arrêt (position + masque) ; sortie = -1
function solve(g, sx, sy) {
  const sid = (x, y, m) => (y * W + x) * 4 + m, states = new Map(), order = [];
  const add = (x, y, m) => { const k = sid(x, y, m); if (!states.has(k)) { states.set(k, { x, y, m, edges: [] }); order.push(k); } return k; };
  add(sx, sy, 0);
  for (let qi = 0; qi < order.length; qi++) {
    const s = states.get(order[qi]);
    for (let d = 0; d < 4; d++) {
      const r = slide(g, s.x, s.y, d, s.m);
      if (r.loop) return { bad: 'loop' };
      if (!r.path.length) continue;
      if (r.exit) s.edges.push({ d, to: -1, path: r.path });
      else { const k = add(r.x, r.y, r.m); if (k !== order[qi]) s.edges.push({ d, to: k, path: r.path }); }
    }
  }
  const trav = new Set(); order.forEach((kk) => states.get(kk).edges.forEach((e) => e.path.forEach(([x, y]) => trav.add(id(x, y)))));
  const rest = new Set(order.map((k) => id(states.get(k).x, states.get(k).y)));
  const can = new Set(); let ch = true;
  while (ch) { ch = false; for (const k of order) { if (can.has(k)) continue; if (states.get(k).edges.some((e) => e.to === -1 || can.has(e.to))) { can.add(k); ch = true; } } }
  const soft = order.filter((k) => !can.has(k));
  if (!can.has(order[0])) return { bad: 'noexit', states, order, trav, rest, soft };
  const prev = new Map([[order[0], null]]), q = [order[0]]; let fin = null;
  for (let qi = 0; qi < q.length && !fin; qi++) { const k = q[qi]; for (const e of states.get(k).edges) { if (e.to === -1) { fin = { k, e }; break; } if (!prev.has(e.to)) { prev.set(e.to, { k, e }); q.push(e.to); } } }
  const sol = [fin.e]; let k = fin.k; while (prev.get(k)) { const p = prev.get(k); sol.unshift(p.e); k = p.k; }
  const solTiles = new Set(); sol.forEach((e) => e.path.forEach(([x, y]) => solTiles.add(id(x, y))));
  const solRest = new Set([id(sx, sy)]); { let cur = order[0]; sol.forEach((e) => { if (e.to !== -1) { solRest.add(id(states.get(e.to).x, states.get(e.to).y)); cur = e.to; } }); }
  // fortement connexe : tout état peut revenir au départ (aucun choix irréversible)
  const back = new Set([order[0]]); let ch2 = true;
  while (ch2) { ch2 = false; for (const kk of order) { if (back.has(kk)) continue; if (states.get(kk).edges.some((e) => e.to !== -1 && back.has(e.to))) { back.add(kk); ch2 = true; } } }
  return { states, order, soft, sol, trav, solTiles, rest, solRest, scc: back.size === order.length };
}
// plus court chemin qui passe par la case T puis rejoint la sortie (pour vérifier/rejouer la clé secrète)
function solveVia(g, sx, sy, T) {
  const s = solve(g, sx, sy); if (s.bad) return null;
  const start = [s.order[0], 0], key = (k, f) => k * 2 + f, prev = new Map([[key(...start), null]]), q = [start];
  for (let qi = 0; qi < q.length; qi++) {
    const [k, f] = q[qi];
    for (const e of s.states.get(k).edges) {
      const f2 = f || e.path.some(([x, y]) => id(x, y) === T) ? 1 : 0;
      if (e.to === -1) { if (f2) { const dirs = [e.d]; let cur = key(k, f); while (prev.get(cur)) { const p = prev.get(cur); dirs.unshift(p.d); cur = p.from; } return dirs.join(''); } continue; }
      const nk = key(e.to, f2); if (prev.has(nk)) continue; prev.set(nk, { from: key(k, f), d: e.d }); q.push([e.to, f2]);
    }
  }
  return null;
}

/* ---------- Construction du labyrinthe (même méthode que les niveaux d'origine) ---------- */
function carve(g, res, x, y, d, L, H) {
  const [dx, dy] = DIRS[d];
  for (let i = 1; i <= L; i++) { const tx = x + dx * i, ty = y + dy * i; if (tx < 1 || tx > W - 2 || ty < 1 || ty > H - 2 || res.has(ty * W + tx)) return null; }
  const sx = x + dx * (L + 1), sy = y + dy * (L + 1);
  if (sx < 0 || sx > W - 1 || sy < 0 || sy > H - 1 || g[sy][sx] !== '#') return null;
  for (let i = 1; i <= L; i++) if (g[y + dy * i][x + dx * i] === '#') g[y + dy * i][x + dx * i] = ' ';
  res.add(sy * W + sx);
  return [x + dx * L, y + dy * L];
}
function makeLevel(cfg, seed) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const R = mkRng(seed * 7919 + attempt * 104729), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = (arr) => arr[Math.floor(R() * arr.length)];
    const H = cfg.h, g = Array.from({ length: H }, () => Array(W).fill('#')), res = new Set();
    const sx = ri(3, 7), sy = H - 2; g[sy][sx] = 'S';
    let x = sx, y = sy, lastV = false, moves = 0, guard = 0;
    while (y > 2 && guard++ < 300) {
      let d = lastV ? (R() < 0.5 ? 1 : 3) : R() < 0.9 ? 0 : 2; if (moves === 0) d = 0;
      const L = d === 0 ? ri(2, Math.min(cfg.up, y - 1)) : d === 2 ? ri(1, 2) : ri(2, 8);
      const r = carve(g, res, x, y, d, L, H); if (!r) continue;
      [x, y] = r; moves++; lastV = d % 2 === 0;
    }
    if (y > 2) continue;
    g[y][x] = 'E';
    let sol = solve(g, sx, sy); if (sol.bad || sol.soft.length) continue;
    let branches = 0;
    for (let b = 0; b < cfg.branches * 4 && branches < cfg.branches; b++) {
      const g2 = clone(g), res2 = new Set(res);
      let [bx, by] = R() < 0.75 ? XY(pick([...sol.rest])) : XY(pick([...sol.trav]));
      let ok = false;
      for (let c = 0, n = ri(1, 3); c < n; c++) { const r = carve(g2, res2, bx, by, ri(0, 3), ri(1, 5), H); if (!r) break; [bx, by] = r; ok = true; }
      if (!ok) continue;
      if (R() < cfg.rooms) { const rx = Math.max(1, Math.min(W - 3, bx + ri(-1, 0))), ry = Math.max(2, Math.min(H - 3, by + ri(-1, 0))); for (let yy = ry; yy < ry + 2; yy++) for (let xx = rx; xx < rx + 2; xx++) if (!res2.has(yy * W + xx) && g2[yy][xx] === '#') g2[yy][xx] = ' '; }
      const s2 = solve(g2, sx, sy); if (s2.bad || s2.soft.length) continue;
      for (let yy = 0; yy < H; yy++) g[yy] = g2[yy]; res.clear(); res2.forEach((v) => res.add(v)); sol = s2; branches++;
    }
    if (sol.sol.length < cfg.minMoves || sol.sol.length > cfg.maxMoves) continue;
    if (cfg.scc && !sol.scc) continue;
    const lvl = decorate(g, sol, cfg, R, sx, sy, H);
    if (lvl) return lvl;
  }
  return null;
}

function decorate(g, sol, cfg, R, sx, sy, H) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const at = (k) => { const [x, y] = XY(k); return g[y][x]; }, put = (gg, k, ch) => { const [x, y] = XY(k); gg[y][x] = ch; };
  const ents = [], mech = { gates: 0, toggles: 0, hidden: 0 };
  const near = (k, k2, r) => { const [a, b] = XY(k), [c, d] = XY(k2); return Math.abs(a - c) + Math.abs(b - d) <= r; };
  const S = id(sx, sy); let Ek = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'E') Ek = id(x, y);
  const used = new Set([S, Ek]);
  const isRest = (k) => sol.rest.has(k);
  const free = (k) => !used.has(k) && !isRest(k) && !near(k, S, 2) && !near(k, Ek, 1) && at(k) === ' ';
  const okSol = (s) => s && !s.bad && !s.soft.length && s.sol.length >= cfg.minMoves - 2 && (!cfg.scc || s.scc);
  const tryPlace = (k, ch) => { const old = at(k); put(g, k, ch); const s = solve(g, sx, sy); if (!okSol(s)) { put(g, k, old); return null; } return s; };
  // --- éléments de déplacement d'origine
  let nb = cfg.boosters || 0;
  for (const k of shuffle([...sol.trav].filter(free))) { if (!nb) break; const [x, y] = XY(k); const opts = [0, 1, 2, 3].filter((d) => !blocked(g[y + DIRS[d][1]] && g[y + DIRS[d][1]][x + DIRS[d][0]], 0)); if (!opts.length) continue; const s = tryPlace(k, '^>v<'[opts[Math.floor(R() * opts.length)]]); if (s) { sol = s; used.add(k); nb--; } }
  let nd = cfg.doors || 0;
  for (const k of shuffle([...sol.solTiles].filter(free))) { if (!nd) break; const [x, y] = XY(k); const s = tryPlace(k, 'D'); if (s) { sol = s; used.add(k); DIRS.forEach(([dx, dy]) => used.add(id(x + dx, y + dy))); nd--; } }
  // --- grille + plaque : la grille doit VRAIMENT bloquer, la plaque est accessible avant
  for (let t = 0; t < 40 && (cfg.gates || 0) > mech.gates; t++) {
    const cand = shuffle([...sol.solTiles].filter(free)); if (!cand.length) break;
    const gk = cand[0]; put(g, gk, 'g');
    const s0 = solve(g, sx, sy);
    if (!s0.bad) { put(g, gk, ' '); continue; } // contournable : inutile
    const reach = shuffle([...s0.trav].filter((k) => free(k) && k !== gk)), prefer = reach.filter((k) => !sol.solTiles.has(k)).concat(reach.filter((k) => sol.solTiles.has(k)));
    let done = false;
    for (const pk of prefer.slice(0, 30)) { put(g, pk, 'P'); const s = solve(g, sx, sy); if (okSol(s)) { sol = s; used.add(gk); used.add(pk); mech.gates++; done = true; break; } put(g, pk, ' '); }
    if (!done) put(g, gk, ' ');
  }
  // --- interrupteurs bicolores : les barrières doivent rendre l'interrupteur indispensable
  if (cfg.toggles) {
    for (let t = 0; t < 90; t++) {
      const gb = clone(g), bars = shuffle([...sol.solTiles].filter(free)).slice(0, cfg.toggles.bar); if (bars.length < cfg.toggles.bar) break;
      bars.forEach((k, i) => put(gb, k, i % 2 ? 'b' : 'a'));
      const sws = shuffle([...sol.trav].filter((k) => free(k) && !bars.includes(k) && bars.every((b) => !near(b, k, 1)))).slice(0, cfg.toggles.sw);
      sws.forEach((k) => put(gb, k, 'o'));
      const s = solve(gb, sx, sy); if (!okSol(s)) continue;
      const passes = s.sol.some((e) => e.path.some(([x, y]) => gb[y][x] === 'o'));
      const gn = clone(gb); sws.forEach((k) => put(gn, k, ' ')); const sn = solve(gn, sx, sy);
      if (!passes || !sn.bad) continue;
      for (let y = 0; y < H; y++) g[y] = gb[y]; sol = s; bars.concat(sws).forEach((k) => used.add(k)); mech.toggles = sws.length; break;
    }
    if (!mech.toggles) return null;
  }
  // --- passage secret (mur fissuré « H ») vers la clé « K » ou la relique « Q » : facultatif, jamais requis
  const secret = (ch) => {
    // arrêts où l'on n'entre jamais « par hasard » dans le passage (aucune glissade ne s'y arrête en allant dans cette direction)
    const arrive = new Set(); sol.order.forEach((k) => { const st = sol.states.get(k); st.edges.forEach((e) => { if (e.to === -1) return; const p = e.path, a = p.length > 1 ? p[p.length - 2] : [st.x, st.y], b = p[p.length - 1]; const dd = DIRS.findIndex(([dx, dy]) => dx === b[0] - a[0] && dy === b[1] - a[1]); arrive.add(id(b[0], b[1]) * 4 + dd); }); });
    for (const rk of shuffle([...sol.rest])) {
      if (near(rk, S, 2) || near(rk, Ek, 2)) continue; const [rx, ry] = XY(rk);
      for (const d of shuffle([0, 1, 2, 3])) {
        if (arrive.has(rk * 4 + d)) continue;
        const L = ri(2, 3), cells = []; let ok = true;
        for (let i = 1; i <= L + 1; i++) { const cx = rx + DIRS[d][0] * i, cy = ry + DIRS[d][1] * i; if (cx < 1 || cx > W - 2 || cy < 2 || cy > H - 3 || g[cy][cx] !== '#') { ok = false; break; } cells.push([cx, cy]); }
        if (!ok) continue;
        const ex = rx + DIRS[d][0] * (L + 2), ey = ry + DIRS[d][1] * (L + 2); if (!(g[ey] && g[ey][ex] === '#')) continue;
        const pd = d % 2 === 0 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
        if (cells.slice(1).some(([cx, cy]) => pd.some(([px, py]) => { const c = g[cy + py] && g[cy + py][cx + px]; return c !== undefined && c !== '#'; }))) continue;
        const g2 = clone(g); g2[cells[0][1]][cells[0][0]] = 'H'; cells.slice(1).forEach(([cx, cy], i) => { g2[cy][cx] = i === cells.length - 2 ? ch : ' '; });
        const s = solve(g2, sx, sy); if (!okSol(s)) continue;
        const tk = id(...cells[cells.length - 1]); if (!s.trav.has(tk)) continue;
        if (s.sol.some((e) => e.path.some(([x, y]) => g2[y][x] === 'H'))) continue;
        for (let y = 0; y < H; y++) g[y] = g2[y]; sol = s; cells.forEach(([cx, cy]) => used.add(id(cx, cy))); used.add(rk); mech.hidden++; return tk;
      }
    }
    return -1;
  };
  let keyTile = -1, relicTile = -1;
  if (cfg.key) { keyTile = secret('K'); if (keyTile < 0) return null; }
  if (cfg.relic) { relicTile = secret('Q'); if (relicTile < 0) return null; }
  // --- pièges temporisés, segments, ennemis (règles d'origine)
  const onSol = shuffle([...sol.solTiles].filter(free));
  for (const [ch, n0] of [['x', cfg.spikes || 0], ['z', cfg.elec || 0], ['k', cfg.blink || 0]]) { let n = n0; for (const k of onSol) { if (!n) break; if (used.has(k) || at(k) !== ' ') continue; put(g, k, ch); used.add(k); n--; } }
  const passCh = (c) => c !== undefined && !blocked(c, 3) && c !== 'D' && c !== 'E' && !(c >= '1' && c <= '4') && !'gabHPoKQ'.includes(c);
  const run = (k, axis) => { const [x, y] = XY(k), [dx, dy] = axis ? [0, 1] : [1, 0]; let a = 0, b = 0; const okc = (xx, yy) => passCh(g[yy] && g[yy][xx]);
    while (okc(x - dx * (a + 1), y - dy * (a + 1))) a++; while (okc(x + dx * (b + 1), y + dy * (b + 1))) b++;
    const cells = []; for (let i = -a; i <= b; i++) cells.push(id(x + dx * i, y + dy * i)); return cells; };
  const segOk = (cells) => cells.every((c) => !isRest(c) && !near(c, S, 2) && !near(c, Ek, 1) && !used.has(c));
  const solArr = shuffle([...sol.solTiles].filter(free)), segUsed = new Set();
  const axisOf = new Map(); sol.sol.forEach((e) => e.path.forEach(([x, y]) => { const k = id(x, y); if (!axisOf.has(k)) axisOf.set(k, e.d % 2); }));
  const okTile = (k) => free(k) && !segUsed.has(k) && axisOf.has(k) && !near(k, S, 3) && !near(k, Ek, 2) && [...segUsed].every((u) => !near(u, k, 2));
  let nl = cfg.lasers || 0;
  for (const k of solArr) { if (!nl) break; if (!okTile(k)) continue; const cells = run(k, axisOf.get(k) === 0 ? 0 : 1); if (cells.length > 5 || !segOk(cells) || cells.some((c) => segUsed.has(c))) continue;
    cells.forEach((c) => segUsed.add(c)); ents.push({ t: 'laser', a: XY(cells[0]), b: XY(cells[cells.length - 1]), per: +(2.2 + R() * 0.8).toFixed(2), on: 0.95, ph: +R().toFixed(2) }); nl--; }
  const cross = (n, mk) => {
    for (const k of solArr) {
      if (!n) return; if (!okTile(k)) continue;
      const [x, y] = XY(k), ax = axisOf.get(k), perp = ax === 0 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      for (const [px, py] of shuffle(perp.slice())) {
        const c1 = [x + px, y + py], c2 = [x + 2 * px, y + 2 * py], c3 = [x + 3 * px, y + 3 * py];
        if ([c1, c2].some(([cx, cy]) => cx < 1 || cx > W - 2 || cy < 2 || cy > H - 3 || g[cy][cx] !== '#')) continue;
        if (c3[0] < 0 || c3[0] > W - 1 || g[c3[1]] === undefined) continue;
        const o1 = [x - px, y - py], oc = g[o1[1]] && g[o1[1]][o1[0]], ext = oc && passCh(oc) && !isRest(id(...o1)) && !used.has(id(...o1));
        g[c1[1]][c1[0]] = ' '; g[c2[1]][c2[0]] = ' ';
        const s2 = solve(g, sx, sy);
        if (!okSol(s2) || s2.rest.has(id(...c1)) || s2.rest.has(id(...c2))) { g[c1[1]][c1[0]] = '#'; g[c2[1]][c2[0]] = '#'; continue; }
        sol = s2; [k, id(...c1), id(...c2)].concat(ext ? [id(...o1)] : []).forEach((c) => segUsed.add(c));
        ents.push(mk(c2, ext ? o1 : [x, y])); n--; break;
      }
    }
  };
  cross(cfg.saws || 0, (a, b) => ({ t: 'saw', a, b, sp: +(cfg.esp * (0.9 + R() * 0.3)).toFixed(2), ph: +R().toFixed(2) }));
  cross(cfg.patrols || 0, (a, b) => ({ t: cfg.patrolKind || 'slime', a, b, sp: +(cfg.esp * (0.8 + R() * 0.25)).toFixed(2), ph: +R().toFixed(2) }));
  cross(cfg.blocks || 0, (a, b) => ({ t: 'block', a, b, sp: +(cfg.esp * 0.7).toFixed(2), ph: +R().toFixed(2) }));
  const restDead = () => [...sol.rest].filter((k) => !sol.solRest.has(k) && !used.has(k) && !near(k, S, 2) && !near(k, Ek, 1) && at(k) === ' ');
  // --- bonus, coffre, cristaux (hors du chemin le plus court : il faut explorer)
  const bcand = shuffle(restDead()).concat(shuffle([...sol.trav].filter((k) => free(k) && !segUsed.has(k))));
  for (const ch of cfg.bonus || []) { const k = bcand.find((kk) => !used.has(kk) && at(kk) === ' '); if (k == null) break; put(g, k, ch); used.add(k); }
  for (let i = 0; i < (cfg.chest || 0); i++) { const k = shuffle(restDead()).find((kk) => !used.has(kk)); if (k == null) return null; put(g, k, 'C'); used.add(k); }
  if (cfg.crystals) {
    const pool = shuffle(restDead()).concat(shuffle([...sol.trav].filter((k) => !sol.solTiles.has(k) && !used.has(k) && !segUsed.has(k) && at(k) === ' '))), got = [];
    for (const k of pool) { if (got.length >= cfg.crystals) break; if (used.has(k) || at(k) !== ' ' || got.some((o) => near(o, k, 4))) continue; got.push(k); }
    if (got.length < cfg.crystals) return null; got.forEach((k) => { put(g, k, '*'); used.add(k); });
  }
  // --- pièces
  let coins = 0;
  for (const k of sol.trav) { if (at(k) === ' ' && !segUsed.has(k) && R() < (cfg.coinRate || 0.88)) { put(g, k, '.'); coins++; } }
  for (const k of segUsed) { if (at(k) === ' ' && R() < 0.6) { put(g, k, '.'); coins++; } }
  const fin = solve(g, sx, sy); if (!okSol(fin)) return null;
  if (cfg.scc && !fin.scc) return null;
  const tiles = fin.sol.reduce((n, e) => n + e.path.length, 0), hz = ents.length + (cfg.spikes || 0) + (cfg.elec || 0) + (cfg.blink || 0) + (cfg.doors || 0) + mech.gates + mech.toggles;
  const par = Math.round(fin.sol.length * 0.75 + tiles / 12 + hz * 0.9 + 3);
  const lv = { h: H, rows: g.map((r) => r.join('')), ents, coins, moves: fin.sol.length, par, sol: fin.sol.map((e) => e.d).join('') };
  if (keyTile >= 0) lv.ksol = solveVia(g, sx, sy, keyTile);
  if (relicTile >= 0) lv.qsol = solveVia(g, sx, sy, relicTile);
  if ((keyTile >= 0 && !lv.ksol) || (relicTile >= 0 && !lv.qsol)) return null;
  lv._q = quality(lv, fin, cfg, mech); return lv;
}
// score de qualité : choix réels, variété des directions, taille du graphe, utilisation des mécaniques
function quality(lv, s, cfg, mech) {
  let decisions = 0; s.order.forEach((k) => { const d = new Set(s.states.get(k).edges.map((e) => e.to)); if (d.size >= 3) decisions++; });
  let turns = 0; for (let i = 1; i < lv.sol.length; i++) if (lv.sol[i] !== lv.sol[i - 1]) turns++;
  const target = (cfg.minMoves + cfg.maxMoves) / 2, horiz = [...lv.sol].filter((c) => c === '1' || c === '3').length;
  return +(decisions * 2 + Math.min(s.order.length, 90) * 0.25 + turns * 0.5 + horiz * 0.4 - Math.abs(lv.moves - target) * 1.2 + (mech.gates + mech.toggles) * 2).toFixed(2);
}
function best(cfg, seed, n) {
  let top = null;
  for (let i = 0; i < n; i++) { const lv = makeLevel(cfg, seed + i * 31); if (lv && (!top || lv._q > top._q)) top = lv; }
  if (!top) throw new Error('aucun candidat pour ' + JSON.stringify(cfg));
  return top;
}

/* ---------- Arènes de boss (conçues à la main, vérifiées) ---------- */
function arena(rows, boss) {
  const g = rows.map((r) => r.split('')); let sx = 0, sy = 0;
  g.forEach((r, y) => r.forEach((c, x) => { if (c === 'S') { sx = x; sy = y; } }));
  const s = solve(g.map((r) => r.map((c) => (c === 'S' ? ' ' : c))), sx, sy);
  // tout l'arène doit être réversible et chaque cible doit être une case d'arrêt atteignable
  if (s.bad === 'loop') throw new Error('boucle dans l’arène');
  const states = s.states, order = s.order, restSet = new Set(order.map((k) => id(states.get(k).x, states.get(k).y)));
  boss.targets.forEach(([x, y]) => { if (!restSet.has(id(x, y))) throw new Error('cible non atteignable ' + x + ',' + y); });
  // depuis n'importe quel arrêt, toutes les cibles restent atteignables (le départ seul peut être sans retour)
  const tState = (x, y) => order.find((k) => states.get(k).x === x && states.get(k).y === y);
  boss.targets.forEach(([x, y]) => {
    const t = tState(x, y), back = new Set([t]); let ch = true;
    while (ch) { ch = false; for (const kk of order) { if (back.has(kk)) continue; if (states.get(kk).edges.some((e) => e.to !== -1 && back.has(e.to))) { back.add(kk); ch = true; } } }
    if (back.size !== order.length) throw new Error('cible ' + x + ',' + y + ' inatteignable depuis certains arrêts');
  });
  // de chaque case d'arrêt, on peut sortir de sa ligne ET de sa colonne (esquive toujours possible)
  restSet.forEach((k) => { const [x, y] = XY(k); const o = (dx, dy) => { const c = g[y + dy] && g[y + dy][x + dx]; return c && c !== '#'; }; if (!(o(1, 0) || o(-1, 0)) || !(o(0, 1) || o(0, -1))) throw new Error('arrêt sans esquive ' + x + ',' + y); });
  // itinéraire du départ vers chaque cible successive (pour les tests automatiques)
  const route = []; let cur = [sx, sy];
  for (const t of boss.targets) {
    const prev = new Map(), start = order.find((k) => states.get(k).x === cur[0] && states.get(k).y === cur[1]); prev.set(start, null); const q = [start]; let end = null;
    for (let qi = 0; qi < q.length && end == null; qi++) { const k = q[qi]; for (const e of states.get(k).edges) { if (e.to === -1 || prev.has(e.to)) continue; prev.set(e.to, { k, d: e.d }); q.push(e.to); if (states.get(e.to).x === t[0] && states.get(e.to).y === t[1]) { end = e.to; break; } } }
    const dirs = []; let k = end; while (prev.get(k)) { dirs.unshift(prev.get(k).d); k = prev.get(k).k; } route.push(dirs.join('')); cur = t;
  }
  let coins = 0; rows.forEach((r) => { for (const c of r) if (c === '.') coins++; });
  return { h: rows.length, rows, ents: [], coins, moves: 0, par: boss.par, sol: '', boss: Object.assign({}, boss, { route }), obj: [{ t: 'nohit' }, { t: 'time', s: boss.par }] };
}

/* ---------- Contenu des mondes 1 et 2 ---------- */
const T_TIME = { t: 'time' };
const RUINES = {
  main: [
    { h: 46, up: 6, minMoves: 11, maxMoves: 18, branches: 6, rooms: 0.3, bonus: ['B'], spikes: 3, patrols: 1, esp: 2.3, gates: 1, chest: 1, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Nouveau : glisse sur la plaque dorée pour ouvrir la grille.' },
    { h: 48, up: 6, minMoves: 11, maxMoves: 19, branches: 6, rooms: 0.3, bonus: ['M'], spikes: 4, patrols: 2, esp: 2.3, gates: 1, crystals: 3, obj: [{ t: 'crystals' }, T_TIME], tip: 'Ramasse les 3 cristaux violets pour la 2e étoile.' },
    { h: 50, up: 6, minMoves: 12, maxMoves: 20, branches: 7, rooms: 0.3, bonus: ['B', 'M'], spikes: 4, patrols: 2, blocks: 1, esp: 2.4, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Un mur fissuré cache un passage… et la clé du niveau secret.' },
    { h: 52, up: 6, minMoves: 12, maxMoves: 20, branches: 7, rooms: 0.3, bonus: ['B'], spikes: 5, patrols: 2, blocks: 1, esp: 2.4, gates: 1, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, { t: 'allcoins' }] },
    { h: 54, up: 7, minMoves: 13, maxMoves: 21, branches: 7, rooms: 0.3, bonus: ['B', 'M'], spikes: 5, patrols: 3, esp: 2.5, gates: 1, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 8, rooms: 0.3, bonus: ['M'], spikes: 5, patrols: 2, blocks: 2, esp: 2.5, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, bonus: ['M', 'B'], spikes: 6, patrols: 3, blocks: 1, esp: 2.6, gates: 1, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 60, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, bonus: ['B'], spikes: 6, patrols: 3, blocks: 2, esp: 2.7, gates: 1, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, { t: 'allcoins' }] }
  ],
  boss: arena([
    '###########',
    '###########',
    '###########',
    '#.........#',
    '#.#..#..#.#',
    '#.........#',
    '#...#.#...#',
    '##.......##',
    '#....#....#',
    '#.#.....#.#',
    '#.........#',
    '#...#.#...#',
    '#.#.....#.#',
    '#....#....#',
    '#.........#',
    '#....S....#',
    '###########'
  ], { kind: 'guardian', name: 'Le Gardien des ruines', hp: 6, par: 70, targets: [[1, 3], [9, 15], [9, 3], [1, 10], [6, 8], [3, 15]] }),
  defis: [
    { name: 'Course des ruines', rule: { t: 'timer' }, h: 46, up: 7, minMoves: 11, maxMoves: 17, branches: 5, rooms: 0.2, bonus: ['V'], spikes: 3, boosters: 2, esp: 2.4, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant la fin du chrono.' },
    { name: 'Sans une égratignure', rule: { t: 'nohit' }, h: 48, up: 6, minMoves: 12, maxMoves: 19, branches: 6, rooms: 0.3, bonus: ['M'], spikes: 7, patrols: 3, blocks: 1, esp: 2.6, obj: [{ t: 'allcoins' }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de bouclier).' },
    { name: 'Le grand ramassage', rule: { t: 'allcoins' }, h: 40, up: 6, minMoves: 9, maxMoves: 16, branches: 7, rooms: 0.35, scc: true, spikes: 3, patrols: 1, esp: 2.3, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'La crypte cachée', h: 44, up: 6, minMoves: 10, maxMoves: 18, branches: 8, rooms: 0.45, coinRate: 1, chest: 2, relic: true, spikes: 3, patrols: 1, esp: 2.3, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : un trésor ancien dort derrière un mur fissuré.' }
};
const CYBER = {
  main: [
    { h: 54, up: 6, minMoves: 12, maxMoves: 20, branches: 6, rooms: 0.25, bonus: ['V'], lasers: 2, saws: 1, boosters: 1, esp: 2.6, toggles: { sw: 1, bar: 2 }, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Nouveau : passe sur un interrupteur pour inverser les barrières rouges et bleues.' },
    { h: 56, up: 6, minMoves: 12, maxMoves: 21, branches: 7, rooms: 0.3, bonus: ['B'], lasers: 2, patrols: 1, patrolKind: 'bat', esp: 2.7, toggles: { sw: 1, bar: 3 }, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, bonus: ['B', 'V'], lasers: 3, saws: 2, doors: 1, boosters: 1, esp: 2.8, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Un mur fissuré cache la clé du niveau secret.' },
    { h: 58, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, bonus: ['M'], saws: 2, patrols: 2, patrolKind: 'bat', esp: 2.8, toggles: { sw: 2, bar: 3 }, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, { t: 'allcoins' }] },
    { h: 60, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, bonus: ['B', 'V'], lasers: 3, doors: 1, boosters: 2, esp: 2.9, toggles: { sw: 1, bar: 4 }, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 60, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, bonus: ['M', 'B'], saws: 2, lasers: 2, esp: 2.9, toggles: { sw: 2, bar: 4 }, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 25, branches: 8, rooms: 0.3, bonus: ['M', 'V'], lasers: 3, patrols: 2, patrolKind: 'bat', doors: 2, esp: 3, toggles: { sw: 2, bar: 4 }, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 64, up: 7, minMoves: 15, maxMoves: 26, branches: 9, rooms: 0.3, bonus: ['B'], lasers: 3, saws: 3, boosters: 2, esp: 3.1, toggles: { sw: 2, bar: 5 }, crystals: 3, obj: [{ t: 'crystals' }, { t: 'allcoins' }] }
  ],
  boss: arena([
    '###########',
    '###########',
    '###########',
    '#.........#',
    '#..##.##..#',
    '##.......##',
    '#.........#',
    '#.........#',
    '#.........#',
    '#...#.#...#',
    '###.....###',
    '#...#.#...#',
    '#.........#',
    '##.......##',
    '#..#...#..#',
    '#....S....#',
    '###########'
  ], { kind: 'spider', name: 'L’Araignée cybernétique', hp: 6, par: 75, targets: [[9, 3], [2, 13], [1, 6], [8, 13], [3, 9], [8, 3]] }),
  defis: [
    { name: 'Surcharge', rule: { t: 'timer' }, h: 50, up: 7, minMoves: 12, maxMoves: 19, branches: 5, rooms: 0.2, bonus: ['V'], lasers: 2, boosters: 3, esp: 2.7, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant la fin du chrono.' },
    { name: 'Pare-feu', rule: { t: 'nohit' }, h: 52, up: 7, minMoves: 12, maxMoves: 20, branches: 6, rooms: 0.3, bonus: ['M'], lasers: 4, saws: 2, patrols: 1, patrolKind: 'bat', esp: 2.9, obj: [{ t: 'allcoins' }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de bouclier).' },
    { name: 'Collecte de données', rule: { t: 'allcoins' }, h: 44, up: 6, minMoves: 10, maxMoves: 17, branches: 7, rooms: 0.35, scc: true, lasers: 2, saws: 1, esp: 2.6, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'Le serveur fantôme', h: 48, up: 6, minMoves: 11, maxMoves: 19, branches: 8, rooms: 0.45, coinRate: 1, chest: 2, relic: true, lasers: 2, boosters: 1, esp: 2.7, toggles: { sw: 1, bar: 2 }, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : une relique se cache derrière un mur fissuré.' }
};

function build(cfg, seed, n) {
  const lv = best(cfg, seed, n);
  delete lv._q; lv.obj = cfg.obj; if (cfg.tip) lv.tip = cfg.tip; if (cfg.rule) lv.rule = cfg.rule; if (cfg.name) lv.name = cfg.name;
  if (cfg.rule && cfg.rule.t === 'timer') lv.rule = { t: 'timer', s: Math.round(lv.par * 1.25) };
  return lv;
}
const out = {}, N = +(process.env.CAND || 8);
for (const [wid, W2, base] of [['ruines', RUINES, 5000], ['cyber', CYBER, 7000]]) {
  const t0 = Date.now();
  const main = W2.main.map((cfg, i) => { const lv = build(cfg, base + i * 97, N); process.stderr.write(`${wid} ${i + 7}: h=${lv.h} coups=${lv.moves} pièces=${lv.coins} par=${lv.par}s ents=${lv.ents.length}\n`); return lv; });
  main.push(W2.boss); process.stderr.write(`${wid} 15 (boss) itinéraire=${W2.boss.boss.route.join('|')}\n`);
  const defis = W2.defis.map((cfg, i) => { const lv = build(cfg, base + 900 + i * 53, N); process.stderr.write(`${wid} défi ${i + 1}: coups=${lv.moves} par=${lv.par}s règle=${JSON.stringify(lv.rule)}\n`); return lv; });
  const secret = build(W2.secret, base + 1500, N); process.stderr.write(`${wid} secret: coups=${secret.moves} pièces=${secret.coins}\n`);
  out[wid] = { main, defis, secret }; process.stderr.write(`${wid} : ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}
const js = `/* Milo Maze — contenu V2 (tools/maze/gen2.js) : niveaux 7 à 15, défis et niveaux secrets.
   Nouvelles cases : P plaque · g grille (s'ouvre avec la plaque) · o interrupteur · a barrière rouge · b barrière bleue
                     H mur fissuré (passage secret) · K clé secrète · Q relique · C coffre · * cristal
   Les niveaux de boss (boss:{…}) sont des arènes conçues à la main et vérifiées. */
window.MILO_MAZE_EXTRA = ${JSON.stringify(out)};
`;
fs.writeFileSync(process.argv[2] || 'maze-levels-v2.js', js);
