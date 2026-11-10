// Milo Maze — générateur V2 : niveaux des mondes enrichis, défis et niveaux secrets.
// Les 24 niveaux d'origine (gen.js → maze-levels.js) ne sont PAS régénérés.
// Usage : node gen2.js ../../public/games/maze-levels-v2.js
//   Les mondes déjà présents dans le fichier de sortie sont CONSERVÉS tels quels (la progression des joueurs
//   y est enregistrée) ; seuls les mondes absents sont générés. ONLY=foret,sables force la régénération de ces mondes.
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
   masque m (bits alloués par niveau, voir ctxOf) :
     bit 0           interrupteur (0 : barrières rouges « a » fermées, bleues « b » ouvertes ; 1 : l'inverse)
     1 bit / plaque  plaque « P » enfoncée — les grilles « g » s'ouvrent quand TOUTES les plaques le sont
     1 bit parité    murs de grès « y » (fermés quand parité 0) / « Y » (fermés quand parité 1) ; la parité change à chaque arrêt
     1 bit / dalle   dalle fragile « u » effondrée (elle tombe dès que Milo la quitte)
   + positions des blocs gelés « O » (triées) : Milo pousse un bloc qui glisse jusqu'au prochain obstacle
   « n » neige : Milo s'y arrête net. « w » plateforme de basalte et « D » porte : temporisées, considérées ouvertes.
   3 bits gravité   orbe « G » : traversée dans la direction d, la gravité devient d ; après chaque arrêt Milo « tombe » dans ce sens
   « A » bulle d'air, « r » étoile inversée : sans effet sur les déplacements.
   2 bits rotation  engrenages « 6 7 8 9 » (direction initiale ↑ → ↓ ←) : tapis qui tournent d'un quart de tour à chaque arrêt
   « X » fausse sortie (hors du trajet), « e » presse : sans effet sur les déplacements. */
function ctxOf(g) {
  const c = { plates: new Map(), frag: new Map(), gm: 0, par: 0, NM: 2 }; let b = 1;
  for (let y = 0; y < g.length; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'P') { c.plates.set(id(x, y), 1 << b); c.gm |= 1 << b; b++; }
  if (g.some((r) => r.includes('y') || r.includes('Y'))) { c.par = 1 << b; b++; }
  for (let y = 0; y < g.length; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'u') { c.frag.set(id(x, y), 1 << b); b++; }
  c.ice = []; for (let y = 0; y < g.length; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'O') c.ice.push(id(x, y));
  c.gb = -1; if (g.some((r) => r.includes('G'))) { c.gb = b; c.gmask = 7 << b; b += 3; }
  c.rb = -1; if (g.some((r) => r.some((ch) => ch >= '6' && ch <= '9'))) { c.rb = b; c.rmask = 3 << b; b += 2; }
  c.NM = 1 << b; return c;
}
function blocked(c, m, ctx, k) {
  if (c === undefined || c === '#' || c === 'U') return true;
  if (c === 'a') return !(m & 1); if (c === 'b') return !!(m & 1);
  if (c === 'g') return !ctx.gm || (m & ctx.gm) !== ctx.gm;
  if (c === 'y') return !(m & ctx.par); if (c === 'Y') return !!(m & ctx.par);
  if (c === 'u') return !!(m & ctx.frag.get(k));
  return false;
}
const wall0 = (c) => c === undefined || '#agUyY'.includes(c);
function portalOther(g, x, y, c) { for (let yy = 0; yy < g.length; yy++) for (let xx = 0; xx < W; xx++) if (g[yy][xx] === c && (xx !== x || yy !== y)) return [xx, yy]; return null; }
// un bloc gelé glisse sur le sol nu et les objets (qu'il ne ramasse pas) ; il s'arrête devant tout le reste
const ICEOK = ' .SBMVRT*LKQC';
function pushIce(g, bk, d, B) {
  let [bx, by] = XY(bk); const others = B.filter((k) => k !== bk); let moved = 0;
  for (;;) { const tx = bx + DIRS[d][0], ty = by + DIRS[d][1], c = g[ty] && g[ty][tx]; if (c === undefined || !ICEOK.includes(c) || others.includes(id(tx, ty))) break; bx = tx; by = ty; moved++; }
  return moved ? others.concat([id(bx, by)]).sort((a, b) => a - b) : null;
}
function slide(g, ctx, x, y, d, m, B) {
  const path = [], seen = new Set(); B = B || [];
  for (let i = 0; i < 700; i++) {
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1], c = g[ny] && g[ny][nx], nk = id(nx, ny);
    if (B.length && B.includes(nk)) { const nb = pushIce(g, nk, d, B); return nb ? { x, y, d, m, path, exit: false, B: nb, push: true } : { x, y, d, m, path, exit: false, B }; }
    if (blocked(c, m, ctx, nk)) return { x, y, d, m, path, exit: false, B };
    const ck = id(x, y); if (ctx.frag.has(ck)) m |= ctx.frag.get(ck); // la dalle quittée s'effondre
    x = nx; y = ny; path.push([x, y]);
    if (c === 'E') return { x, y, d, m, path, exit: true };
    if (c === 'n') return { x, y, d, m, path, exit: false, B }; // neige : arrêt net
    if (c === 'o') m ^= 1; else if (c === 'P') m |= ctx.plates.get(nk); else if (c === 'G' && ctx.gb >= 0) m = (m & ~ctx.gmask) | ((d + 1) << ctx.gb);
    if (c in BOOST) d = BOOST[c];
    else if (c >= '6' && c <= '9') d = (c.charCodeAt(0) - 54 + ((m >> ctx.rb) & 3)) % 4; // engrenage : sa direction dépend de la rotation
    else if (c >= '1' && c <= '4') { const o = portalOther(g, x, y, c); if (o) { x = o[0]; y = o[1]; path.push([x, y]); } }
    const k = ((y * W + x) * 4 + d) * ctx.NM + m; if (seen.has(k)) return { loop: true, path }; seen.add(k);
  }
  return { loop: true, path: [] };
}
// graphe des états d'arrêt (position + masque + blocs) ; sortie = -1. m0 / B0 : état de départ (reprise au checkpoint)
function solve(g, sx, sy, m0, B0) {
  const ctx = ctxOf(g); if (ctx.ice.length) g = g.map((r) => r.map((c) => (c === 'O' ? ' ' : c)));
  const NM = ctx.NM, nb = ctx.ice.length, P = W * g.length, PB = Math.pow(P, nb), enc = (B) => { let v = 0, f = 1; for (const b of B) { v += b * f; f *= P; } return v; };
  const sid = (x, y, m, B) => ((y * W + x) * NM + m) * PB + (nb ? enc(B) : 0), states = new Map(), order = [];
  const add = (x, y, m, B) => { const k = sid(x, y, m, B); if (!states.has(k)) { states.set(k, { x, y, m, B, edges: [] }); order.push(k); } return k; };
  add(sx, sy, m0 || 0, B0 || ctx.ice);
  for (let qi = 0; qi < order.length; qi++) {
    const s = states.get(order[qi]);
    for (let d = 0; d < 4; d++) {
      let r = slide(g, ctx, s.x, s.y, d, s.m, s.B);
      if (r.loop) return { bad: 'loop' };
      if (!r.path.length && !r.push) continue;
      // gravité : après l'arrêt, Milo retombe dans le sens de la gravité (en chaîne) jusqu'à être calé
      if (ctx.gb >= 0 && !r.exit) { let path = r.path, gi = 0;
        for (; gi < 8; gi++) { const gd = ((r.m >> ctx.gb) & 7) - 1; if (gd < 0) break; const f = slide(g, ctx, r.x, r.y, gd, r.m, r.B); if (f.loop) return { bad: 'loop' }; if (!f.path.length) break; path = path.concat(f.path); r = Object.assign({}, f, { B: f.B || r.B, path }); if (f.exit) break; }
        if (gi >= 8) return { bad: 'loop' }; }
      if (r.exit) s.edges.push({ d, to: -1, path: r.path });
      else {
        let m2 = r.m;
        if (ctx.rb >= 0 && r.path.length) m2 = (m2 & ~ctx.rmask) | ((((m2 >> ctx.rb) & 3) + 1) & 3) << ctx.rb; // un arrêt : les engrenages tournent
        if (ctx.par && r.path.length) { m2 ^= ctx.par; const ch = g[r.y][r.x]; if (ch === 'y' || ch === 'Y') return { bad: 'parrest' }; } // un mur de grès ne doit jamais se refermer sur Milo
        const k = add(r.x, r.y, m2, r.B); if (k !== order[qi]) s.edges.push({ d, to: k, path: r.path, push: !!r.push });
      }
    }
  }
  const trav = new Set(); order.forEach((kk) => states.get(kk).edges.forEach((e) => e.path.forEach(([x, y]) => trav.add(id(x, y)))));
  const rest = new Set(order.map((k) => id(states.get(k).x, states.get(k).y)));
  const masks = new Set(order.map((k) => states.get(k).m)), combos = new Map(); order.forEach((k) => { const st = states.get(k); combos.set(st.m + '|' + st.B.join(','), [st.m, st.B]); });
  const can = new Set(); let ch = true;
  while (ch) { ch = false; for (const k of order) { if (can.has(k)) continue; if (states.get(k).edges.some((e) => e.to === -1 || can.has(e.to))) { can.add(k); ch = true; } } }
  const soft = order.filter((k) => !can.has(k));
  if (!can.has(order[0])) return { bad: 'noexit', states, order, trav, rest, soft, masks, combos };
  const prev = new Map([[order[0], null]]), q = [order[0]]; let fin = null;
  for (let qi = 0; qi < q.length && !fin; qi++) { const k = q[qi]; for (const e of states.get(k).edges) { if (e.to === -1) { fin = { k, e }; break; } if (!prev.has(e.to)) { prev.set(e.to, { k, e }); q.push(e.to); } } }
  const sol = [fin.e]; let k = fin.k; while (prev.get(k)) { const p = prev.get(k); sol.unshift(p.e); k = p.k; }
  const solTiles = new Set(); sol.forEach((e) => e.path.forEach(([x, y]) => solTiles.add(id(x, y))));
  const solRest = new Set([id(sx, sy)]); { sol.forEach((e) => { if (e.to !== -1) solRest.add(id(states.get(e.to).x, states.get(e.to).y)); }); }
  // fortement connexe : tout état peut revenir au départ (aucun choix irréversible)
  const back = new Set([order[0]]); let ch2 = true;
  while (ch2) { ch2 = false; for (const kk of order) { if (back.has(kk)) continue; if (states.get(kk).edges.some((e) => e.to !== -1 && back.has(e.to))) { back.add(kk); ch2 = true; } } }
  return { states, order, soft, sol, trav, solTiles, rest, solRest, masks, combos, scc: back.size === order.length };
}
// reprise au checkpoint : depuis la case k, avec N'IMPORTE QUEL état atteignable du niveau, la sortie reste accessible sans impasse
function cpSafe(g, sx, sy, k) {
  const s = solve(g, sx, sy); if (s.bad) return false; const [x, y] = XY(k);
  for (const [m, B] of s.combos.values()) { const r = solve(g, x, y, m, B); if (r.bad || r.soft.length) return false; }
  return true;
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
  const ents = [], mech = { gates: 0, toggles: 0, hidden: 0, shift: 0, frag: 0, cps: 0, snow: 0, ice: 0, grav: 0, gears: 0 };
  if (cfg.ice && (cfg.saws || cfg.patrols || cfg.blocks)) throw new Error('blocs gelés : pas d’ennemis qui creusent des couloirs');
  const near = (k, k2, r) => { const [a, b] = XY(k), [c, d] = XY(k2); return Math.abs(a - c) + Math.abs(b - d) <= r; };
  const S = id(sx, sy); let Ek = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'E') Ek = id(x, y);
  const used = new Set([S, Ek]);
  const isRest = (k) => sol.rest.has(k);
  const free = (k) => !used.has(k) && !isRest(k) && !near(k, S, 2) && !near(k, Ek, 1) && at(k) === ' ';
  const okSol = (s) => s && !s.bad && !s.soft.length && s.sol.length >= cfg.minMoves - 2 && (!cfg.scc || s.scc);
  const tryPlace = (k, ch) => { const old = at(k); put(g, k, ch); const s = solve(g, sx, sy); if (!okSol(s)) { put(g, k, old); return null; } return s; };
  // --- éléments de déplacement d'origine
  let nb = cfg.boosters || 0;
  for (const k of shuffle([...sol.trav].filter(free))) { if (!nb) break; const [x, y] = XY(k); const opts = [0, 1, 2, 3].filter((d) => !wall0(g[y + DIRS[d][1]] && g[y + DIRS[d][1]][x + DIRS[d][0]])); if (!opts.length) continue; const s = tryPlace(k, '^>v<'[opts[Math.floor(R() * opts.length)]]); if (s) { sol = s; used.add(k); nb--; } }
  let nd = cfg.doors || 0;
  for (const k of shuffle([...sol.solTiles].filter(free))) { if (!nd) break; const [x, y] = XY(k); const s = tryPlace(k, 'D'); if (s) { sol = s; used.add(k); DIRS.forEach(([dx, dy]) => used.add(id(x + dx, y + dy))); nd--; } }
  // --- engrenages « 6-9 » : tapis tournants ; la solution doit en emprunter au moins un
  if (cfg.gears) {
    for (let t = 0; t < 140 && !mech.gears; t++) {
      const gb = clone(g), tiles = []; for (const k of shuffle([...sol.trav].filter(free))) { if (tiles.length >= cfg.gears) break; if (tiles.some((o) => near(o, k, 3))) continue; tiles.push(k); }
      if (tiles.length < cfg.gears) break; tiles.forEach((k) => put(gb, k, String(6 + Math.floor(R() * 4))));
      const s = solve(gb, sx, sy); if (!okSol(s) || !s.sol.some((e) => e.path.some(([x, y]) => gb[y][x] >= '6' && gb[y][x] <= '9'))) continue;
      for (let y = 0; y < H; y++) g[y] = gb[y]; sol = s; tiles.forEach((k) => used.add(k)); mech.gears = tiles.length;
    }
    if (!mech.gears) return null;
  }
  // --- portails (même règle que les niveaux d'origine : le second portail doit vraiment servir)
  let np = cfg.portals || 0, digit = 1;
  for (let t = 0; t < 30 && np > 0; t++) {
    const cand = shuffle([...sol.trav].filter(free)); if (cand.length < 2) break;
    const a = cand[0], b = cand.find((k) => Math.abs(XY(a)[1] - XY(k)[1]) > 6); if (b == null) continue;
    const oa = at(a), ob = at(b); put(g, a, String(digit)); put(g, b, String(digit));
    const s = solve(g, sx, sy);
    if (!okSol(s) || !s.trav.has(b)) { put(g, a, oa); put(g, b, ob); continue; }
    sol = s; used.add(a); used.add(b); digit++; np--;
  }
  // --- orbes de gravité « G » : elles doivent servir dans la solution
  if (cfg.grav) {
    for (let t = 0; t < 140 && !mech.grav; t++) {
      const gb = clone(g), tiles = []; for (const k of shuffle([...sol.solTiles].filter(free))) { if (tiles.length >= cfg.grav) break; if (tiles.some((o) => near(o, k, 4))) continue; tiles.push(k); }
      if (tiles.length < cfg.grav) break; tiles.forEach((k) => put(gb, k, 'G'));
      const s = solve(gb, sx, sy); if (!okSol(s) || !s.sol.some((e) => e.path.some(([x, y]) => gb[y][x] === 'G'))) continue;
      for (let y = 0; y < H; y++) g[y] = gb[y]; sol = s; tiles.forEach((k) => used.add(k)); mech.grav = tiles.length;
    }
    if (!mech.grav) return null;
  }
  // --- plateformes de basalte « w » (temporisées, comme les portes)
  let nw = cfg.plats || 0;
  if (nw) for (const k of shuffle([...sol.solTiles].filter(free))) { if (!nw) break; const [x, y] = XY(k); if (DIRS.some(([dx, dy]) => 'Dw'.includes(g[y + dy][x + dx]))) continue; const s = tryPlace(k, 'w'); if (s) { sol = s; used.add(k); DIRS.forEach(([dx, dy]) => used.add(id(x + dx, y + dy))); nw--; } }
  // --- grille + plaque : la grille doit VRAIMENT bloquer, la plaque est accessible avant
  for (let t = 0; t < 40 && (cfg.gates || 0) > mech.gates; t++) {
    const cand = shuffle([...sol.solTiles].filter(free)); if (!cand.length) break;
    const gk = cand[0]; put(g, gk, 'g');
    const s0 = solve(g, sx, sy);
    if (!s0.bad) { put(g, gk, ' '); continue; } // contournable : inutile
    const reach = shuffle([...s0.trav].filter((k) => free(k) && k !== gk)), prefer = reach.filter((k) => !sol.solTiles.has(k)).concat(reach.filter((k) => sol.solTiles.has(k)));
    let done = false;
    if ((cfg.plates || 1) === 1) {
      for (const pk of prefer.slice(0, 30)) { put(g, pk, 'P'); const s = solve(g, sx, sy); if (okSol(s)) { sol = s; used.add(gk); used.add(pk); mech.gates++; done = true; break; } put(g, pk, ' '); }
    } else { // sceaux : deux plaques éloignées, toutes deux nécessaires
      for (let t2 = 0; t2 < 40 && !done; t2++) {
        const p1 = prefer[Math.floor(R() * Math.min(prefer.length, 24))], p2 = prefer.find((k) => k !== p1 && !near(k, p1, 5) && R() < 0.5);
        if (p1 == null || p2 == null) continue; put(g, p1, 'P'); put(g, p2, 'P'); const s = solve(g, sx, sy);
        if (okSol(s)) { sol = s; [gk, p1, p2].forEach((k) => used.add(k)); mech.gates++; done = true; break; } put(g, p1, ' '); put(g, p2, ' ');
      }
    }
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
  // --- murs de grès : « y » et « Y » échangent leur place à chaque arrêt de Milo ; ils doivent changer le trajet
  const onPath = (s2, gg, chs) => s2.sol.some((e) => e.path.some(([x, y]) => chs.includes(gg[y][x])));
  if (cfg.shift) {
    const base = sol.sol.map((e) => e.d).join('');
    for (let t = 0; t < 120 && !mech.shift; t++) {
      const gb = clone(g), tiles = shuffle([...sol.solTiles].filter(free)).slice(0, cfg.shift); if (tiles.length < cfg.shift) break;
      tiles.forEach((k, i) => put(gb, k, i % 2 ? 'Y' : 'y'));
      const s = solve(gb, sx, sy); if (!okSol(s) || s.sol.map((e) => e.d).join('') === base || !onPath(s, gb, 'yY')) continue;
      for (let y = 0; y < H; y++) g[y] = gb[y]; sol = s; tiles.forEach((k) => used.add(k)); mech.shift = tiles.length;
    }
    if (!mech.shift) return null;
  }
  // --- dalles fragiles : elles s'effondrent derrière Milo ; jamais d'impasse (vérifié sur tous les états)
  if (cfg.frag) {
    for (let t = 0; t < 120 && !mech.frag; t++) {
      const gb = clone(g), pool = shuffle([...sol.solTiles].filter(free)), tiles = [];
      for (const k of pool) { if (tiles.length >= cfg.frag) break; if (tiles.some((o) => near(o, k, 2))) continue; tiles.push(k); }
      if (tiles.length < cfg.frag) break; tiles.forEach((k) => put(gb, k, 'u'));
      const s = solve(gb, sx, sy); if (!okSol(s) || !onPath(s, gb, 'u')) continue;
      for (let y = 0; y < H; y++) g[y] = gb[y]; sol = s; tiles.forEach((k) => used.add(k)); mech.frag = tiles.length;
    }
    if (!mech.frag) return null;
  }
  // --- neige « n » : Milo s'y arrête net ; elle doit compter dans le trajet
  if (cfg.snow) {
    for (let t = 0; t < 120 && !mech.snow; t++) {
      const gb = clone(g), tiles = []; for (const k of shuffle([...sol.solTiles].filter(free))) { if (tiles.length >= cfg.snow) break; if (tiles.some((o) => near(o, k, 2))) continue; tiles.push(k); }
      if (tiles.length < cfg.snow) break; tiles.forEach((k) => put(gb, k, 'n'));
      const s = solve(gb, sx, sy); if (!okSol(s) || !onPath(s, gb, 'n')) continue;
      for (let y = 0; y < H; y++) g[y] = gb[y]; sol = s; tiles.forEach((k) => used.add(k)); mech.snow = tiles.length;
    }
    if (!mech.snow) return null;
  }
  // --- blocs gelés « O » : la solution doit pousser au moins un bloc ; aucune impasse quelle que soit la façon de les pousser
  if (cfg.ice) {
    for (let t = 0; t < 160 && !mech.ice; t++) {
      const gb = clone(g), tiles = []; for (const k of shuffle([...sol.trav].filter((k) => free(k) && !near(k, S, 3) && !near(k, Ek, 2)))) { if (tiles.length >= cfg.ice) break; if (tiles.some((o) => near(o, k, 3))) continue; tiles.push(k); }
      if (tiles.length < cfg.ice) break; tiles.forEach((k) => put(gb, k, 'O'));
      const s = solve(gb, sx, sy); if (!okSol(s) || !s.sol.some((e) => e.push)) continue;
      for (let y = 0; y < H; y++) g[y] = gb[y]; sol = s; mech.ice = tiles.length;
    }
    if (!mech.ice) return null;
    sol.order.forEach((k) => sol.states.get(k).B.forEach((b) => used.add(b))); // cases que les blocs peuvent occuper : rien dessus
  }
  // --- passage secret (mur fissuré « H ») vers la clé « K » ou la relique « Q » : facultatif, jamais requis
  const secret = (ch) => {
    // arrêts où l'on n'entre jamais « par hasard » dans le passage (aucune glissade ne s'y arrête en allant dans cette direction)
    const arrive = new Set(); sol.order.forEach((k) => { const st = sol.states.get(k); st.edges.forEach((e) => { if (e.to === -1 || !e.path.length) return; const p = e.path, a = p.length > 1 ? p[p.length - 2] : [st.x, st.y], b = p[p.length - 1]; const dd = DIRS.findIndex(([dx, dy]) => dx === b[0] - a[0] && dy === b[1] - a[1]); arrive.add(id(b[0], b[1]) * 4 + dd); }); });
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
  // --- checkpoints « F » : sur des cases d'arrêt du trajet principal, reprise sûre quel que soit l'état du niveau
  if (cfg.cp) {
    const ey = XY(Ek)[1], fr = cfg.cp === 1 ? [0.5] : [0.36, 0.68];
    for (const f of fr) {
      const ty = sy - (sy - ey) * f;
      const cand = [...sol.solRest].filter((k) => at(k) === ' ' && !used.has(k) && !near(k, S, 5) && !near(k, Ek, 5) && [...used].every((u) => at(u) !== 'F' || Math.abs(XY(u)[1] - XY(k)[1]) > 6))
        .sort((a, b) => Math.abs(XY(a)[1] - ty) - Math.abs(XY(b)[1] - ty));
      for (const k of cand.slice(0, 8)) { if (Math.abs(XY(k)[1] - ty) > 9) break; if (!cpSafe(g, sx, sy, k)) continue; put(g, k, 'F'); used.add(k); mech.cps++; break; }
    }
    if (!mech.cps) return null;
  }
  // --- pièges temporisés, segments, ennemis (règles d'origine) ; « i » : piège caché (Forêt)
  const onSol = shuffle([...sol.solTiles].filter(free));
  for (const [ch, n0] of [['x', cfg.spikes || 0], ['z', cfg.elec || 0], ['k', cfg.blink || 0], ['i', cfg.hidden || 0], ['j', cfg.geysers || 0], ['e', cfg.presses || 0]]) { let n = n0; for (const k of onSol) { if (!n) break; if (used.has(k) || at(k) !== ' ') continue; put(g, k, ch); used.add(k); n--; } }
  const passCh = (c) => c !== undefined && c !== '#' && !(c >= '1' && c <= '4') && !'DEgabHPoKQFuUyYLwnOGrAX6789'.includes(c);
  const run = (k, axis) => { const [x, y] = XY(k), [dx, dy] = axis ? [0, 1] : [1, 0]; let a = 0, b = 0; const okc = (xx, yy) => passCh(g[yy] && g[yy][xx]);
    while (okc(x - dx * (a + 1), y - dy * (a + 1))) a++; while (okc(x + dx * (b + 1), y + dy * (b + 1))) b++;
    const cells = []; for (let i = -a; i <= b; i++) cells.push(id(x + dx * i, y + dy * i)); return cells; };
  const segOk = (cells) => cells.every((c) => !isRest(c) && !near(c, S, 2) && !near(c, Ek, 1) && !used.has(c));
  const solArr = shuffle([...sol.solTiles].filter(free)), segUsed = new Set();
  const axisOf = new Map(); sol.sol.forEach((e) => e.path.forEach(([x, y]) => { const k = id(x, y); if (!axisOf.has(k)) axisOf.set(k, e.d % 2); }));
  const restDead0 = () => [...sol.rest].filter((k) => !sol.solRest.has(k) && !used.has(k) && !near(k, S, 2) && !near(k, Ek, 1) && at(k) === ' ');
  const okTile = (k) => free(k) && !segUsed.has(k) && axisOf.has(k) && !near(k, S, 3) && !near(k, Ek, 2) && [...segUsed].every((u) => !near(u, k, 2));
  let nl = cfg.lasers || 0;
  for (const k of solArr) { if (!nl) break; if (!okTile(k)) continue; const cells = run(k, axisOf.get(k) === 0 ? 0 : 1); if (cells.length > 5 || !segOk(cells) || cells.some((c) => segUsed.has(c))) continue;
    cells.forEach((c) => segUsed.add(c)); ents.push({ t: 'laser', a: XY(cells[0]), b: XY(cells[cells.length - 1]), per: +(2.2 + R() * 0.8).toFixed(2), on: 0.95, ph: +R().toFixed(2) }); nl--; }
  // --- étoiles inversées « r » (commandes inversées 8 s) sur le trajet
  if (cfg.inv) { let n = cfg.inv; for (const k of shuffle([...sol.solTiles].filter((k) => free(k) && at(k) === ' ' && !segUsed.has(k)))) { if (!n) break; if ([...used].some((u) => at(u) === 'r' && near(u, k, 6))) continue; put(g, k, 'r'); used.add(k); n--; } }
  // --- pièges à flèches : un tireur dans le mur, la flèche traverse le couloir que Milo emprunte
  let na = cfg.arrows || 0;
  for (const k of solArr) { if (!na) break; if (!okTile(k)) continue; const hz = axisOf.get(k) === 0, cells = run(k, hz ? 0 : 1); if (cells.length > 5 || !segOk(cells) || cells.some((c) => segUsed.has(c))) continue;
    const ax = hz ? [1, 0] : [0, 1], c0 = XY(cells[0]), c1 = XY(cells[cells.length - 1]), wb = g[c0[1] - ax[1]] && g[c0[1] - ax[1]][c0[0] - ax[0]], wa = g[c1[1] + ax[1]] && g[c1[1] + ax[1]][c1[0] + ax[0]];
    if (wb !== '#' && wa !== '#') continue; const fwd = wb === '#' && (wa !== '#' || R() < 0.5);
    cells.forEach((c) => segUsed.add(c)); ents.push({ t: 'arrow', a: fwd ? c0 : c1, b: fwd ? c1 : c0, d: hz ? (fwd ? 1 : 3) : (fwd ? 2 : 0), per: +(2.3 + R() * 0.7).toFixed(2), ph: +R().toFixed(2), sp: cfg.asp || 7.5 }); na--; }
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
  // robots pisteurs (règle d'origine) : dans des impasses loin du départ
  if (cfg.chasers) { const dead = shuffle(restDead0()).filter((k) => Math.abs(XY(k)[1] - sy) > 6 && !segUsed.has(k)); for (let i = 0; i < cfg.chasers && dead.length; i++) { const k = dead.pop(); used.add(k); segUsed.add(k); ents.push({ t: 'chaser', a: XY(k), sp: cfg.chaseSp || 2.6, r: 6 }); } }
  // fantômes : ils traversent les murs mais restent lents ; ils dorment loin du départ et de la sortie
  if (cfg.ghosts) { const gc = shuffle([...sol.trav].filter((k) => free(k) && !segUsed.has(k) && !sol.solTiles.has(k) && Math.abs(XY(k)[1] - sy) > 7 && !near(k, Ek, 4))); for (let i = 0; i < cfg.ghosts && gc.length; i++) { const k = gc.pop(); if (ents.some((e) => e.t === 'ghost' && Math.abs(e.a[1] - XY(k)[1]) < 6)) { i--; continue; } used.add(k); segUsed.add(k); ents.push({ t: 'ghost', a: XY(k), sp: cfg.ghostSp || 1.5, r: 4.5 }); } }
  // feux follets (règle d'origine)
  if (cfg.wisps) { const wcand = shuffle([...sol.trav].filter((k) => free(k) && !segUsed.has(k) && [...sol.rest].every((r) => { const [a, b] = XY(k), [c, d] = XY(r); return Math.max(Math.abs(a - c), Math.abs(b - d)) > 1; })));
    for (let i = 0; i < cfg.wisps && wcand.length; i++) { const k = wcand.pop(); used.add(k); segUsed.add(k); ents.push({ t: 'wisp', a: XY(k), sp: +(cfg.esp * 0.5).toFixed(2), amp: 1.1, ph: +R().toFixed(2) }); } }
  const restDead = () => [...sol.rest].filter((k) => !sol.solRest.has(k) && !used.has(k) && !near(k, S, 2) && !near(k, Ek, 1) && at(k) === ' ');
  // --- fausses sorties « X » : dans des impasses, jamais sur un trajet utile (solution, clé, relique)
  if (cfg.fakes) {
    const keep = new Set(sol.solTiles), routes = []; if (keyTile >= 0) routes.push(solveVia(g, sx, sy, keyTile)); if (relicTile >= 0) routes.push(solveVia(g, sx, sy, relicTile));
    for (const r of routes) { if (!r) continue; let cur = sol.order[0]; for (const ch of r) { const e = sol.states.get(cur).edges.find((q) => q.d === +ch); if (!e) break; e.path.forEach(([x, y]) => keep.add(id(x, y))); if (e.to === -1) break; cur = e.to; } }
    const ey = XY(Ek)[1], cand = restDead().filter((k) => !keep.has(k) && !near(k, Ek, 4)).sort((a, b) => Math.abs(XY(a)[1] - ey) - Math.abs(XY(b)[1] - ey));
    const got = []; for (const k of cand) { if (got.length >= cfg.fakes) break; if (got.some((o) => near(o, k, 6))) continue; got.push(k); }
    if (got.length < cfg.fakes) return null; got.forEach((k) => { put(g, k, 'X'); used.add(k); });
  }
  // --- bonus, coffre, cristaux (hors du chemin le plus court : il faut explorer)
  const bcand = shuffle(restDead()).concat(shuffle([...sol.trav].filter((k) => free(k) && !segUsed.has(k))));
  for (const ch of cfg.bonus || []) { const k = bcand.find((kk) => !used.has(kk) && at(kk) === ' '); if (k == null) break; put(g, k, ch); used.add(k); }
  // lucioles « L » : la première sur le trajet (on en croise toujours une), les autres à explorer
  for (let i = 0; i < (cfg.flies || 0); i++) { const pool = i === 0 ? shuffle([...sol.solTiles].filter((k) => free(k) && !segUsed.has(k) && !near(k, S, 4))) : bcand; const k = pool.find((kk) => !used.has(kk) && at(kk) === ' '); if (k == null) return null; put(g, k, 'L'); used.add(k); }
  for (let i = 0; i < (cfg.chest || 0); i++) { const k = shuffle(restDead()).find((kk) => !used.has(kk)); if (k == null) return null; put(g, k, 'C'); used.add(k); }
  if (cfg.crystals) {
    const pool = shuffle(restDead()).concat(shuffle([...sol.trav].filter((k) => !sol.solTiles.has(k) && !used.has(k) && !segUsed.has(k) && at(k) === ' '))), got = [];
    for (const k of pool) { if (got.length >= cfg.crystals) break; if (used.has(k) || at(k) !== ' ' || got.some((o) => near(o, k, 4))) continue; got.push(k); }
    if (got.length < cfg.crystals) return null; got.forEach((k) => { put(g, k, '*'); used.add(k); });
  }
  // --- bulles d'air « A » : placées pour qu'un joueur posé (≈ 1,3 s de réflexion par coup) ne manque jamais d'oxygène, clé et relique comprises
  if (cfg.o2) {
    const lim = cfg.o2 * 0.6, routes = [sol.sol.map((e) => e.d).join('')]; if (keyTile >= 0) routes.push(solveVia(g, sx, sy, keyTile)); if (relicTile >= 0) routes.push(solveVia(g, sx, sy, relicTile));
    for (const r of routes) { if (!r) return null; let cur = sol.order[0], t = 0, tl = 0;
      for (const ch of r) { const st = sol.states.get(cur), e = st.edges.find((q) => q.d === +ch); if (!e) return null; t += 1.3;
        for (const [x, y] of e.path) { t += 1 / 13; const k = id(x, y); if (at(k) === 'A') tl = t; else if (t - tl > lim && at(k) === ' ' && !used.has(k) && !segUsed.has(k) && !near(k, Ek, 1)) { put(g, k, 'A'); used.add(k); tl = t; } }
        if (t - tl > cfg.o2 * 0.85) return null; if (e.to === -1) break; cur = e.to; } }
    for (let i = 0; i < (cfg.extraBubbles || 0); i++) { const k = shuffle([...sol.trav].filter((kk) => at(kk) === ' ' && !used.has(kk) && !segUsed.has(kk)))[0]; if (k == null) break; put(g, k, 'A'); used.add(k); }
  }
  // --- pièces
  let coins = 0;
  for (const k of sol.trav) { if (at(k) === ' ' && !segUsed.has(k) && R() < (cfg.coinRate || 0.88)) { put(g, k, '.'); coins++; } }
  for (const k of segUsed) { if (at(k) === ' ' && R() < 0.6) { put(g, k, '.'); coins++; } }
  const fin = solve(g, sx, sy); if (!okSol(fin)) return null;
  if (cfg.scc && !fin.scc) return null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'F' && !cpSafe(g, sx, sy, id(x, y))) return null;
  const tiles = fin.sol.reduce((n, e) => n + e.path.length, 0), hz = ents.length + (cfg.spikes || 0) + (cfg.elec || 0) + (cfg.blink || 0) + (cfg.hidden || 0) + (cfg.geysers || 0) + (cfg.presses || 0) + (cfg.doors || 0) + (cfg.plats || 0) + mech.gates + mech.toggles + mech.shift * 0.5 + mech.frag * 0.5 + mech.ice;
  const par = Math.round((fin.sol.length * 0.75 + tiles / 12 + hz * 0.9 + 3) * (cfg.dark ? 1.15 : 1));
  const lv = { h: H, rows: g.map((r) => r.join('')), ents, coins, moves: fin.sol.length, par, sol: fin.sol.map((e) => e.d).join('') };
  if (cfg.dark) lv.dark = cfg.dark; if (cfg.o2) lv.o2 = cfg.o2;
  if (keyTile >= 0) lv.ksol = solveVia(g, sx, sy, keyTile);
  if (relicTile >= 0) lv.qsol = solveVia(g, sx, sy, relicTile);
  if ((keyTile >= 0 && !lv.ksol) || (relicTile >= 0 && !lv.qsol)) return null;
  // --- lave montante : vitesse calculée pour qu'un joueur posé (≈ 1,3 s de réflexion par coup) passe, y compris par la clé ou la relique
  if (cfg.lava) {
    const grace = cfg.lava.g || 4, T0 = cfg.lava.t || 1.3; let vmax = Infinity;
    for (const r of [lv.sol, lv.ksol, lv.qsol].filter(Boolean)) { let cur = fin.order[0], t = 0;
      for (const ch of r) { const st = fin.states.get(cur), e = st.edges.find((q) => q.d === +ch); if (!e) break; t += T0 + e.path.length / 13; const yl = Math.max(st.y, ...e.path.map((p2) => p2[1])); if (t > grace) vmax = Math.min(vmax, (H - 2 - yl) / (t - grace)); if (e.to === -1) break; cur = e.to; } }
    lv.lava = { v: +Math.max(0.2, Math.min(1.1, vmax * 0.8 * (cfg.lava.k || 1))).toFixed(3), g: grace };
  }
  lv._q = quality(lv, fin, cfg, mech); return lv;
}
// score de qualité : choix réels, variété des directions, taille du graphe, utilisation des mécaniques
function quality(lv, s, cfg, mech) {
  let decisions = 0; s.order.forEach((k) => { const d = new Set(s.states.get(k).edges.map((e) => e.to)); if (d.size >= 3) decisions++; });
  let turns = 0; for (let i = 1; i < lv.sol.length; i++) if (lv.sol[i] !== lv.sol[i - 1]) turns++;
  const target = (cfg.minMoves + cfg.maxMoves) / 2, horiz = [...lv.sol].filter((c) => c === '1' || c === '3').length;
  return +(decisions * 2 + Math.min(s.order.length, 90) * 0.25 + turns * 0.5 + horiz * 0.4 - Math.abs(lv.moves - target) * 1.2 + (mech.gates + mech.toggles + (mech.shift ? 1 : 0) + (mech.frag ? 1 : 0) + (mech.snow ? 1 : 0) + mech.ice + mech.grav + (mech.gears ? 1 : 0)) * 2).toFixed(2);
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
  // inondation de lave (rangées du bas) : depuis chaque arrêt inondable, une seule glissade suffit pour en sortir
  if (boss.flood) { const top = rows.length - 1 - boss.flood; order.forEach((k) => { const st = states.get(k); if (st.y < top) return; if (!st.edges.some((e) => e.to !== -1 && states.get(e.to).y < top)) throw new Error('arrêt sans fuite face à la lave ' + st.x + ',' + st.y); }); }
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

/* ---------- Contenu des mondes 3 et 4 ---------- */
const FORET = {
  main: [
    { h: 44, up: 6, minMoves: 10, maxMoves: 17, branches: 6, rooms: 0.3, dark: 4.8, cp: 1, bonus: ['B'], spikes: 3, patrols: 1, patrolKind: 'slime', esp: 2.4, flies: 1, obj: [{ t: 'coins', p: 0.65 }, T_TIME], tip: 'Nouveau : il fait noir, mais Milo a 3 cœurs. Les drapeaux sont des checkpoints.' },
    { h: 46, up: 6, minMoves: 11, maxMoves: 18, branches: 6, rooms: 0.3, dark: 4.6, cp: 1, bonus: ['M'], spikes: 3, patrols: 2, patrolKind: 'bat', esp: 2.5, flies: 2, crystals: 3, obj: [{ t: 'crystals' }, T_TIME], tip: 'Les lucioles agrandissent ta lumière pendant quelques secondes.' },
    { h: 48, up: 6, minMoves: 11, maxMoves: 19, branches: 6, rooms: 0.3, dark: 4.5, cp: 1, bonus: ['B'], hidden: 4, spikes: 1, patrols: 1, patrolKind: 'slime', esp: 2.5, flies: 1, obj: [{ t: 'nohit' }, T_TIME], tip: 'Pièges cachés : ils apparaissent tout près de Milo, puis restent visibles.' },
    { h: 50, up: 6, minMoves: 12, maxMoves: 20, branches: 7, rooms: 0.3, dark: 4.4, cp: 2, bonus: ['B', 'M'], hidden: 3, spikes: 2, patrols: 2, patrolKind: 'bat', esp: 2.6, flies: 1, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Un mur fissuré cache la clé du niveau secret.' },
    { h: 52, up: 6, minMoves: 12, maxMoves: 20, branches: 7, rooms: 0.3, dark: 4.4, cp: 2, bonus: ['B'], gates: 1, hidden: 3, spikes: 3, patrols: 2, patrolKind: 'slime', esp: 2.6, flies: 2, chest: 1, crystals: 3, obj: [{ t: 'crystals' }, { t: 'allcoins' }] },
    { h: 54, up: 7, minMoves: 13, maxMoves: 21, branches: 7, rooms: 0.3, dark: 4.3, cp: 2, bonus: ['M'], toggles: { sw: 1, bar: 2 }, hidden: 4, patrols: 2, patrolKind: 'bat', blocks: 1, esp: 2.7, flies: 1, obj: [{ t: 'coins', p: 0.75 }, T_TIME] },
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 8, rooms: 0.3, dark: 4.2, cp: 2, bonus: ['B', 'M'], hidden: 4, spikes: 3, patrols: 3, patrolKind: 'slime', esp: 2.7, flies: 2, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 8, rooms: 0.3, dark: 4.1, cp: 2, bonus: ['B'], gates: 1, boosters: 2, hidden: 4, patrols: 2, patrolKind: 'bat', saws: 1, esp: 2.8, flies: 1, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, dark: 4.0, cp: 2, bonus: ['M'], toggles: { sw: 2, bar: 3 }, hidden: 4, spikes: 2, patrols: 2, patrolKind: 'slime', esp: 2.8, flies: 2, crystals: 3, obj: [{ t: 'crystals' }, { t: 'allcoins' }] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, dark: 4.0, cp: 2, bonus: ['B', 'M'], gates: 1, hidden: 5, patrols: 3, patrolKind: 'bat', blocks: 1, esp: 2.9, flies: 1, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 60, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, dark: 3.9, cp: 2, bonus: ['B'], hidden: 5, spikes: 3, patrols: 3, patrolKind: 'slime', saws: 1, esp: 2.9, flies: 2, chest: 1, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, dark: 3.8, cp: 2, bonus: ['M', 'B'], toggles: { sw: 2, bar: 4 }, hidden: 4, patrols: 3, patrolKind: 'bat', esp: 3, flies: 2, obj: [{ t: 'coins', p: 0.8 }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, dark: 3.8, cp: 2, bonus: ['B'], gates: 1, boosters: 2, hidden: 5, spikes: 3, patrols: 3, patrolKind: 'slime', blocks: 1, esp: 3, flies: 2, crystals: 3, obj: [{ t: 'crystals' }, { t: 'nohit' }] },
    { h: 64, up: 7, minMoves: 15, maxMoves: 26, branches: 9, rooms: 0.3, dark: 3.7, cp: 2, bonus: ['M'], gates: 1, toggles: { sw: 1, bar: 3 }, hidden: 5, spikes: 3, patrols: 3, patrolKind: 'bat', saws: 1, esp: 3.1, flies: 2, chest: 1, crystals: 3, obj: [{ t: 'crystals' }, { t: 'allcoins' }] }
  ],
  boss: arena(['###########', '###########', '###########', '#.........#', '#...##....#', '#.........#', '#.....##..#', '#..#.....##', '#.#....#.##', '#...#.....#', '#...#..#..#', '##...#....#', '#...#.....#', '##......#.#', '#.....#...#', '#....S....#', '###########'],
    { kind: 'spirit', name: 'L’Esprit de la forêt', hp: 6, par: 80, targets: [[1, 3], [9, 15], [4, 5], [1, 15], [9, 3], [1, 10]] }),
  defis: [
    { name: 'Course des lucioles', rule: { t: 'timer' }, h: 46, up: 7, minMoves: 11, maxMoves: 17, branches: 5, rooms: 0.2, dark: 5.2, bonus: ['V'], spikes: 2, boosters: 2, esp: 2.5, flies: 3, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant la fin du chrono.' },
    { name: 'Ombre parfaite', rule: { t: 'nohit' }, h: 48, up: 6, minMoves: 12, maxMoves: 19, branches: 6, rooms: 0.3, dark: 4.6, bonus: ['M'], hidden: 4, spikes: 2, patrols: 2, patrolKind: 'bat', esp: 2.6, flies: 2, obj: [{ t: 'allcoins' }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de cœurs, pas de bouclier).' },
    { name: 'Cueillette nocturne', rule: { t: 'allcoins' }, h: 42, up: 6, minMoves: 9, maxMoves: 16, branches: 7, rooms: 0.35, scc: true, dark: 5.0, cp: 1, spikes: 2, patrols: 1, patrolKind: 'slime', esp: 2.4, flies: 2, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'La clairière enchantée', h: 46, up: 6, minMoves: 10, maxMoves: 18, branches: 8, rooms: 0.45, coinRate: 1, dark: 4.6, cp: 1, chest: 2, relic: true, hidden: 3, patrols: 1, patrolKind: 'bat', esp: 2.5, flies: 3, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : un trésor ancien dort derrière un mur fissuré.' }
};
const SABLES = {
  main: [
    { h: 54, up: 7, minMoves: 13, maxMoves: 21, branches: 7, rooms: 0.3, cp: 2, bonus: ['B'], frag: 2, spikes: 3, doors: 1, patrols: 1, patrolKind: 'slime', esp: 2.7, obj: [{ t: 'coins', p: 0.65 }, T_TIME], tip: 'Nouveau : les dalles fragiles s’effondrent derrière toi. Choisis bien ton chemin.' },
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, cp: 2, bonus: ['M'], arrows: 3, frag: 2, spikes: 2, patrols: 1, patrolKind: 'bat', esp: 2.8, crystals: 3, obj: [{ t: 'crystals' }, T_TIME], tip: 'Pièges à flèches : le tireur s’allume juste avant de tirer.' },
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, cp: 2, bonus: ['B'], shift: 4, arrows: 2, patrols: 1, patrolKind: 'slime', esp: 2.8, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Murs de grès : ils changent de place chaque fois que Milo s’arrête.' },
    { h: 58, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, bonus: ['B', 'M'], gates: 1, plates: 2, shift: 2, arrows: 2, patrols: 1, patrolKind: 'bat', esp: 2.8, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Énigme : les 2 sceaux ouvrent la grille. Un mur fissuré cache une clé.' },
    { h: 60, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['M'], frag: 3, arrows: 3, blocks: 1, saws: 1, esp: 2.9, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 60, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], shift: 4, gates: 1, plates: 2, arrows: 3, doors: 1, patrols: 2, patrolKind: 'slime', esp: 2.9, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, bonus: ['M', 'V'], frag: 2, shift: 2, arrows: 3, spikes: 3, patrols: 2, patrolKind: 'bat', esp: 3, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 64, up: 7, minMoves: 15, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, bonus: ['B'], gates: 1, plates: 2, arrows: 4, toggles: { sw: 1, bar: 3 }, saws: 1, esp: 3.1, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, { t: 'allcoins' }] }
  ],
  boss: arena(['###########', '###########', '###########', '#.........#', '#.........#', '#...#.#...#', '#.........#', '#....#....#', '##...#...##', '##...#...##', '#...#.#...#', '#.........#', '#....#....#', '#.#..#..#.#', '#..#...#..#', '#....S....#', '###########'],
    { kind: 'pharaoh', name: 'Le Pharaon mécanique', hp: 6, par: 80, targets: [[9, 3], [1, 15], [6, 7], [9, 12], [2, 9], [3, 3]] }),
  defis: [
    { name: 'Course du scarabée', rule: { t: 'timer' }, h: 50, up: 7, minMoves: 12, maxMoves: 19, branches: 5, rooms: 0.2, bonus: ['V'], boosters: 3, arrows: 2, spikes: 2, frag: 1, esp: 2.8, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant la fin du chrono.' },
    { name: 'Le couloir des flèches', rule: { t: 'nohit' }, h: 52, up: 7, minMoves: 12, maxMoves: 20, branches: 6, rooms: 0.3, bonus: ['M'], arrows: 5, patrols: 1, patrolKind: 'bat', esp: 2.9, obj: [{ t: 'allcoins' }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de cœurs, pas de bouclier).' },
    { name: 'Les dalles d’or', rule: { t: 'allcoins' }, h: 44, up: 6, minMoves: 10, maxMoves: 17, branches: 7, rooms: 0.35, scc: true, cp: 1, shift: 2, spikes: 2, patrols: 1, patrolKind: 'slime', esp: 2.6, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'La chambre du trésor', h: 48, up: 6, minMoves: 11, maxMoves: 19, branches: 8, rooms: 0.45, coinRate: 1, cp: 1, chest: 2, relic: true, frag: 2, shift: 2, arrows: 2, esp: 2.7, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : une relique se cache derrière un mur fissuré.' }
};

/* ---------- Contenu des mondes 5 et 6 (palier difficile) ---------- */
const LV = (k) => ({ k });
const GLACE = {
  main: [
    { h: 50, up: 6, minMoves: 12, maxMoves: 20, branches: 6, rooms: 0.3, cp: 1, bonus: ['B'], snow: 3, spikes: 3, patrols: 1, patrolKind: 'bat', esp: 2.6, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Nouveau : la neige arrête Milo net. Sers-t’en pour viser.' },
    { h: 52, up: 6, minMoves: 12, maxMoves: 21, branches: 7, rooms: 0.3, cp: 2, bonus: ['M'], frag: 2, snow: 2, blink: 3, patrols: 1, patrolKind: 'slime', esp: 2.7, crystals: 3, obj: [{ t: 'crystals' }, T_TIME], tip: 'La glace fragile casse derrière toi : pas de retour possible.' },
    { h: 52, up: 6, minMoves: 12, maxMoves: 21, branches: 7, rooms: 0.3, cp: 2, bonus: ['B'], ice: 1, snow: 2, spikes: 2, lasers: 1, esp: 2.7, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Blocs gelés : fonce dedans pour les pousser jusqu’au prochain obstacle.' },
    { h: 54, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, cp: 2, bonus: ['B', 'M'], ice: 1, snow: 2, blink: 3, lasers: 1, esp: 2.8, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Un mur fissuré cache la clé du niveau secret.' },
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 8, rooms: 0.3, cp: 2, bonus: ['M'], frag: 2, snow: 3, gates: 1, spikes: 3, patrols: 2, patrolKind: 'bat', esp: 2.8, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 56, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], ice: 2, snow: 2, toggles: { sw: 1, bar: 2 }, elec: 3, lasers: 2, esp: 2.8, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['M', 'B'], frag: 3, snow: 2, blink: 4, patrols: 2, patrolKind: 'slime', saws: 1, esp: 2.9, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], ice: 1, snow: 3, gates: 1, plates: 2, lasers: 2, spikes: 3, esp: 2.9, chest: 1, obj: [{ t: 'coins', p: 0.75 }, T_TIME], tip: 'Énigme : 2 sceaux, des blocs gelés et de la neige pour viser.' },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, bonus: ['B', 'M'], frag: 2, snow: 3, toggles: { sw: 2, bar: 3 }, patrols: 3, patrolKind: 'bat', blink: 3, esp: 3, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, bonus: ['M'], ice: 2, snow: 2, elec: 4, lasers: 2, esp: 3, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, bonus: ['B'], snow: 4, frag: 2, gates: 1, boosters: 2, patrols: 3, patrolKind: 'slime', saws: 1, esp: 3.1, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 62, up: 7, minMoves: 16, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, bonus: ['M', 'B'], ice: 2, snow: 3, toggles: { sw: 1, bar: 3 }, lasers: 3, spikes: 3, esp: 3.1, chest: 1, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 9, rooms: 0.3, cp: 2, bonus: ['B'], frag: 3, snow: 3, blink: 4, patrols: 3, patrolKind: 'bat', saws: 2, esp: 3.2, obj: [{ t: 'coins', p: 0.8 }, T_TIME] },
    { h: 66, up: 7, minMoves: 16, maxMoves: 28, branches: 10, rooms: 0.3, cp: 2, bonus: ['M'], ice: 2, snow: 3, gates: 1, plates: 2, lasers: 3, elec: 4, esp: 3.2, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] }
  ],
  boss: arena(['###########', '###########', '###########', '#.........#', '#.#.....#.#', '#...#.#...#', '##...#...##', '#....#....#', '#.........#', '##.#...#.##', '##.......##', '#...#.#...#', '#...#.#...#', '#.#.....#.#', '#.###.###.#', '#....S....#', '###########'],
    { kind: 'titan', name: 'Le Titan de glace', hp: 6, par: 85, targets: [[1, 3], [9, 15], [7, 8], [1, 12], [8, 6], [3, 13]] }),
  defis: [
    { name: 'Glissade express', rule: { t: 'timer' }, h: 52, up: 7, minMoves: 13, maxMoves: 20, branches: 5, rooms: 0.2, bonus: ['V'], snow: 2, boosters: 3, spikes: 2, blink: 2, esp: 2.9, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant la fin du chrono.' },
    { name: 'Sans un frisson', rule: { t: 'nohit' }, h: 54, up: 7, minMoves: 13, maxMoves: 21, branches: 6, rooms: 0.3, bonus: ['M'], snow: 3, lasers: 3, blink: 3, patrols: 2, patrolKind: 'bat', esp: 3, obj: [{ t: 'allcoins' }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de cœurs, pas de bouclier).' },
    { name: 'Récolte givrée', rule: { t: 'allcoins' }, h: 46, up: 6, minMoves: 10, maxMoves: 18, branches: 7, rooms: 0.35, scc: true, cp: 1, snow: 3, spikes: 2, patrols: 1, patrolKind: 'slime', esp: 2.7, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'La grotte de cristal', h: 50, up: 6, minMoves: 11, maxMoves: 20, branches: 8, rooms: 0.45, coinRate: 1, cp: 1, chest: 2, relic: true, snow: 3, ice: 1, blink: 3, esp: 2.8, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : une relique se cache derrière un mur fissuré.' }
};
const VOLCAN = {
  main: [
    { h: 50, up: 6, minMoves: 12, maxMoves: 20, branches: 6, rooms: 0.3, cp: 1, lava: LV(0.65), bonus: ['B'], geysers: 3, spikes: 2, patrols: 1, patrolKind: 'bat', esp: 2.6, obj: [{ t: 'coins', p: 0.55 }, T_TIME], tip: 'Nouveau : la lave monte ! Ne traîne pas, les checkpoints te sauvent.' },
    { h: 52, up: 6, minMoves: 12, maxMoves: 21, branches: 7, rooms: 0.3, cp: 2, bonus: ['M'], plats: 2, geysers: 3, patrols: 1, patrolKind: 'slime', esp: 2.7, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME], tip: 'Les dalles de basalte s’enfoncent dans la lave, puis remontent.' },
    { h: 52, up: 6, minMoves: 12, maxMoves: 21, branches: 7, rooms: 0.3, cp: 2, lava: LV(0.72), bonus: ['B'], geysers: 4, saws: 1, patrols: 1, patrolKind: 'bat', esp: 2.7, obj: [{ t: 'nohit' }, T_TIME], tip: 'Geysers : ils bouillonnent juste avant de cracher le feu.' },
    { h: 54, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, cp: 2, lava: LV(0.72), bonus: ['B', 'M'], plats: 2, geysers: 3, patrols: 2, patrolKind: 'slime', esp: 2.8, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Un mur fissuré cache la clé du niveau secret.' },
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 8, rooms: 0.3, cp: 2, bonus: ['M'], plats: 2, gates: 1, geysers: 4, blocks: 1, esp: 2.8, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, { t: 'allcoins' }] },
    { h: 56, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, lava: LV(0.78), bonus: ['B'], plats: 2, geysers: 4, toggles: { sw: 1, bar: 2 }, patrols: 2, patrolKind: 'bat', esp: 2.9, obj: [{ t: 'coins', p: 0.55 }, T_TIME] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, lava: LV(0.8), bonus: ['M', 'B'], plats: 2, geysers: 4, saws: 2, esp: 2.9, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], plats: 3, geysers: 5, gates: 1, plates: 2, patrols: 2, patrolKind: 'slime', esp: 2.9, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, lava: LV(0.85), bonus: ['B', 'M'], geysers: 4, toggles: { sw: 1, bar: 3 }, patrols: 3, patrolKind: 'bat', esp: 3, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, bonus: ['M'], plats: 2, geysers: 5, blocks: 1, saws: 1, esp: 3, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, lava: LV(0.9), bonus: ['B'], plats: 3, geysers: 4, saws: 2, boosters: 2, esp: 3.1, obj: [{ t: 'coins', p: 0.55 }, T_TIME] },
    { h: 62, up: 7, minMoves: 16, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, bonus: ['M', 'B'], plats: 3, geysers: 5, gates: 1, patrols: 3, patrolKind: 'slime', esp: 3.1, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, { t: 'nohit' }] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 9, rooms: 0.3, cp: 2, lava: LV(0.95), bonus: ['B'], plats: 3, geysers: 5, blocks: 1, saws: 2, esp: 3.2, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 66, up: 7, minMoves: 16, maxMoves: 28, branches: 10, rooms: 0.3, cp: 2, lava: LV(1), bonus: ['M'], plats: 3, geysers: 5, toggles: { sw: 2, bar: 4 }, patrols: 3, patrolKind: 'bat', esp: 3.2, obj: [{ t: 'coins', p: 0.55 }, T_TIME] }
  ],
  boss: arena(['###########', '###########', '###########', '#.........#', '#.....#.#.#', '#..#......#', '##...#....#', '#...#....##', '#.#.......#', '#..##.#...#', '#...###...#', '##.....#.##', '#..#...#..#', '#.........#', '#.........#', '#....S....#', '###########'],
    { kind: 'golem', name: 'Le Golem volcanique', hp: 6, par: 85, flood: 2, targets: [[9, 3], [1, 15], [6, 8], [9, 12], [2, 5], [6, 15]] }),
  defis: [
    { name: 'Fuite de lave', rule: { t: 'timer' }, h: 52, up: 7, minMoves: 13, maxMoves: 20, branches: 5, rooms: 0.2, lava: LV(0.9), bonus: ['V'], boosters: 3, geysers: 3, esp: 2.9, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant le chrono… et avant la lave.' },
    { name: 'Pas une brûlure', rule: { t: 'nohit' }, h: 54, up: 7, minMoves: 13, maxMoves: 21, branches: 6, rooms: 0.3, lava: LV(0.7), bonus: ['M'], geysers: 6, plats: 2, patrols: 1, patrolKind: 'bat', esp: 3, obj: [{ t: 'coins', p: 0.6 }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de cœurs, pas de bouclier).' },
    { name: 'Trésor en fusion', rule: { t: 'allcoins' }, h: 46, up: 6, minMoves: 10, maxMoves: 18, branches: 7, rooms: 0.35, scc: true, cp: 1, plats: 2, geysers: 3, patrols: 1, patrolKind: 'slime', esp: 2.7, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'La forge oubliée', h: 50, up: 6, minMoves: 11, maxMoves: 20, branches: 8, rooms: 0.45, coinRate: 1, cp: 1, chest: 2, relic: true, plats: 2, geysers: 3, saws: 1, esp: 2.8, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : une relique se cache derrière un mur fissuré.' }
};

/* ---------- Contenu des mondes 7 et 8 ---------- */
const ATLANTIDE = {
  main: [
    { h: 52, up: 6, minMoves: 12, maxMoves: 21, branches: 7, rooms: 0.3, cp: 1, o2: 16, bonus: ['B'], boosters: 2, spikes: 3, patrols: 1, patrolKind: 'bat', esp: 2.7, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Nouveau : sous l’eau, surveille ton oxygène. Les bulles d’air le remplissent.' },
    { h: 54, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, cp: 2, o2: 15, bonus: ['M'], boosters: 3, patrols: 2, patrolKind: 'slime', esp: 2.8, crystals: 3, obj: [{ t: 'crystals' }, T_TIME], tip: 'Les courants t’emportent dans leur sens : vise-les !' },
    { h: 54, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, cp: 2, o2: 15, bonus: ['B', 'M'], boosters: 2, gates: 1, spikes: 3, patrols: 1, patrolKind: 'bat', esp: 2.8, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Un mur fissuré cache la clé du niveau secret.' },
    { h: 56, up: 7, minMoves: 13, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, o2: 14, bonus: ['B'], boosters: 3, toggles: { sw: 1, bar: 2 }, patrols: 2, patrolKind: 'slime', esp: 2.9, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 56, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, o2: 14, bonus: ['M'], boosters: 2, gates: 1, plates: 2, saws: 1, patrols: 2, patrolKind: 'bat', esp: 2.9, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, o2: 13, bonus: ['B', 'M'], boosters: 3, spikes: 4, blocks: 1, esp: 3, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, o2: 13, bonus: ['B'], boosters: 2, toggles: { sw: 2, bar: 3 }, patrols: 3, patrolKind: 'slime', esp: 3, obj: [{ t: 'coins', p: 0.7 }, T_TIME] },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, o2: 13, bonus: ['M'], boosters: 3, gates: 1, lasers: 2, saws: 1, esp: 3, chest: 1, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, o2: 12, bonus: ['B', 'M'], boosters: 3, spikes: 4, patrols: 3, patrolKind: 'bat', esp: 3.1, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, o2: 12, bonus: ['B'], boosters: 2, toggles: { sw: 1, bar: 3 }, blocks: 1, saws: 2, esp: 3.1, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 62, up: 7, minMoves: 16, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, o2: 12, bonus: ['M'], boosters: 3, gates: 1, plates: 2, patrols: 3, patrolKind: 'slime', esp: 3.2, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 9, rooms: 0.3, cp: 2, o2: 11, bonus: ['B'], boosters: 3, spikes: 4, saws: 2, esp: 3.2, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 10, rooms: 0.3, cp: 2, o2: 11, bonus: ['M', 'B'], boosters: 3, toggles: { sw: 2, bar: 4 }, patrols: 3, patrolKind: 'bat', blocks: 1, esp: 3.3, obj: [{ t: 'coins', p: 0.75 }, T_TIME] },
    { h: 66, up: 7, minMoves: 17, maxMoves: 28, branches: 10, rooms: 0.3, cp: 2, o2: 11, bonus: ['B'], boosters: 4, gates: 1, patrols: 3, patrolKind: 'slime', saws: 2, esp: 3.3, crystals: 3, obj: [{ t: 'crystals' }, { t: 'nohit' }] }
  ],
  boss: Object.assign(arena(['###########', '###########', '###########', '#...A.....#', '#..#.#....#', '##.#...#.##', '#.....#...#', '#...#.....#', '##........#', '#....A....#', '#.#....#..#', '#.A.......#', '#..#......#', '#..#.....##', '#.#.....A.#', '#....S....#', '###########'],
    { kind: 'leviathan', name: 'Le Léviathan d’Atlantide', hp: 6, par: 90, targets: [[9, 3], [1, 15], [5, 6], [9, 12], [2, 8], [7, 9]] }), { o2: 24 }),
  defis: [
    { name: 'Le grand courant', rule: { t: 'timer' }, h: 54, up: 7, minMoves: 13, maxMoves: 21, branches: 5, rooms: 0.2, o2: 14, bonus: ['V'], boosters: 4, spikes: 2, esp: 3, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant la fin du chrono.' },
    { name: 'Apnée parfaite', rule: { t: 'nohit' }, h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 6, rooms: 0.3, o2: 14, bonus: ['M'], boosters: 2, spikes: 3, patrols: 3, patrolKind: 'bat', esp: 3.1, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Défi : un seul coup (ou une panne d’air) et c’est fini.' },
    { name: 'Trésor des abysses', rule: { t: 'allcoins' }, h: 48, up: 6, minMoves: 10, maxMoves: 18, branches: 7, rooms: 0.35, scc: true, cp: 1, o2: 22, extraBubbles: 3, spikes: 2, patrols: 1, patrolKind: 'slime', esp: 2.8, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'Le palais englouti', h: 50, up: 6, minMoves: 11, maxMoves: 20, branches: 8, rooms: 0.45, coinRate: 1, cp: 1, o2: 18, extraBubbles: 3, chest: 2, relic: true, boosters: 2, spikes: 2, esp: 2.8, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : une relique se cache derrière un mur fissuré.' }
};
const COSMOS = {
  main: [
    { h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 7, rooms: 0.3, cp: 2, bonus: ['B'], portals: 1, grav: 1, blink: 3, lasers: 1, wisps: 1, esp: 2.9, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Nouveau : après une orbe de gravité, Milo retombe dans son sens à chaque arrêt.' },
    { h: 58, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, bonus: ['M'], portals: 1, inv: 2, blink: 3, lasers: 2, esp: 3, crystals: 3, obj: [{ t: 'crystals' }, T_TIME], tip: 'Étoile inversée : tes commandes s’inversent pendant 8 secondes.' },
    { h: 58, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, bonus: ['B', 'M'], portals: 2, grav: 2, wisps: 2, lasers: 1, esp: 3, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Un mur fissuré cache la clé du niveau secret.' },
    { h: 60, up: 7, minMoves: 15, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], grav: 1, inv: 2, portals: 1, blocks: 1, blink: 3, esp: 3.1, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, bonus: ['M'], portals: 2, grav: 2, lasers: 2, wisps: 2, esp: 3.1, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, bonus: ['B', 'M'], inv: 3, portals: 1, toggles: { sw: 1, bar: 3 }, blink: 4, esp: 3.2, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 9, rooms: 0.3, cp: 2, bonus: ['B'], grav: 2, portals: 2, inv: 2, lasers: 3, wisps: 2, esp: 3.3, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 66, up: 7, minMoves: 17, maxMoves: 28, branches: 10, rooms: 0.3, cp: 2, bonus: ['M'], grav: 2, portals: 2, inv: 2, blocks: 2, blink: 4, esp: 3.3, chest: 1, obj: [{ t: 'coins', p: 0.75 }, T_TIME] }
  ],
  boss: arena(['###########', '###########', '###########', '#.........#', '#....#....#', '#.#.....#.#', '#...#.#...#', '#..#...#..#', '#....#....#', '#.........#', '#.........#', '#...#.#...#', '##.......##', '#....#....#', '#.........#', '#....S....#', '###########'],
    { kind: 'entity', name: 'L’Entité cosmique', hp: 6, par: 90, targets: [[1, 3], [9, 15], [4, 7], [9, 10], [2, 12], [7, 8]] }),
  defis: [
    { name: 'Saut quantique', rule: { t: 'timer' }, h: 54, up: 7, minMoves: 13, maxMoves: 21, branches: 5, rooms: 0.2, bonus: ['V'], portals: 2, boosters: 3, blink: 2, esp: 3, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant la fin du chrono.' },
    { name: 'Esprit à l’envers', rule: { t: 'nohit' }, h: 56, up: 7, minMoves: 13, maxMoves: 22, branches: 6, rooms: 0.3, bonus: ['M'], inv: 3, lasers: 4, wisps: 2, esp: 3.1, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de cœurs, pas de bouclier).' },
    { name: 'Poussière d’étoiles', rule: { t: 'allcoins' }, h: 48, up: 6, minMoves: 10, maxMoves: 18, branches: 7, rooms: 0.35, scc: true, cp: 1, portals: 1, blink: 3, wisps: 1, esp: 2.8, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'Le cœur de la nébuleuse', h: 52, up: 6, minMoves: 11, maxMoves: 20, branches: 8, rooms: 0.45, coinRate: 1, cp: 1, chest: 2, relic: true, grav: 1, portals: 1, inv: 1, blink: 2, esp: 2.9, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : une relique se cache derrière un mur fissuré.' }
};

/* ---------- Contenu des mondes 9 et 10 (palier expert) ---------- */
const USINE = {
  main: [
    { h: 56, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], gears: 1, presses: 3, lasers: 1, patrols: 1, patrolKind: 'slime', esp: 3, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Nouveau : les engrenages tournent d’un quart de tour à chaque arrêt de Milo.' },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['M'], gears: 2, presses: 4, chasers: 1, esp: 3, crystals: 3, obj: [{ t: 'crystals' }, T_TIME], tip: 'Presses : elles tremblent juste avant de s’abattre, en cadence.' },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['B', 'M'], gears: 1, presses: 3, chasers: 2, saws: 1, esp: 3, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Les robots te poursuivent dès qu’ils te repèrent. Une clé se cache dans un mur.' },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], gears: 2, presses: 4, lasers: 2, esp: 3.1, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, bonus: ['M'], gears: 2, toggles: { sw: 1, bar: 3 }, presses: 4, chasers: 1, saws: 1, esp: 3.1, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, bonus: ['B', 'M'], gears: 2, gates: 1, plates: 2, presses: 5, lasers: 2, esp: 3.2, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 62, up: 7, minMoves: 16, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, bonus: ['B'], gears: 3, presses: 4, chasers: 2, blocks: 1, esp: 3.2, obj: [{ t: 'coins', p: 0.7 }, T_TIME] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 9, rooms: 0.3, cp: 2, bonus: ['M'], gears: 2, presses: 5, saws: 2, esp: 3.3, chest: 1, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 10, rooms: 0.3, cp: 2, bonus: ['B', 'M'], gears: 3, toggles: { sw: 2, bar: 3 }, presses: 4, chasers: 2, lasers: 2, esp: 3.3, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 66, up: 7, minMoves: 17, maxMoves: 28, branches: 10, rooms: 0.3, cp: 2, bonus: ['B'], gears: 2, presses: 5, saws: 2, blocks: 1, esp: 3.4, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 66, up: 7, minMoves: 17, maxMoves: 28, branches: 10, rooms: 0.3, cp: 2, bonus: ['M'], gears: 3, gates: 1, presses: 5, chasers: 2, lasers: 3, esp: 3.4, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 68, up: 7, minMoves: 17, maxMoves: 29, branches: 10, rooms: 0.3, cp: 2, bonus: ['B', 'M'], gears: 3, toggles: { sw: 1, bar: 4 }, presses: 6, saws: 2, esp: 3.5, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 68, up: 7, minMoves: 18, maxMoves: 29, branches: 10, rooms: 0.3, cp: 2, bonus: ['B'], gears: 3, presses: 6, chasers: 3, lasers: 3, esp: 3.5, obj: [{ t: 'coins', p: 0.75 }, T_TIME] },
    { h: 70, up: 7, minMoves: 18, maxMoves: 30, branches: 11, rooms: 0.3, cp: 2, bonus: ['M'], gears: 4, gates: 1, plates: 2, presses: 6, saws: 2, chasers: 2, esp: 3.6, crystals: 3, obj: [{ t: 'crystals' }, { t: 'nohit' }] }
  ],
  boss: arena(['###########', '###########', '###########', '#.........#', '#...#.#...#', '##.......##', '#.........#', '#.#.....#.#', '#....#....#', '##...#...##', '#.........#', '#..#.#.#..#', '##.......##', '#..##.##..#', '#.........#', '#....S....#', '###########'],
    { kind: 'machine', name: 'La Machine destructrice', hp: 6, par: 95, flood: 2, targets: [[9, 3], [1, 15], [4, 8], [8, 11], [2, 5], [6, 12]] }),
  defis: [
    { name: 'Chaîne de montage', rule: { t: 'timer' }, h: 56, up: 7, minMoves: 14, maxMoves: 22, branches: 5, rooms: 0.2, bonus: ['V'], gears: 2, boosters: 3, presses: 3, esp: 3.2, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la sortie avant la fin du chrono.' },
    { name: 'Zéro défaut', rule: { t: 'nohit' }, h: 58, up: 7, minMoves: 14, maxMoves: 23, branches: 6, rooms: 0.3, bonus: ['M'], presses: 6, lasers: 3, chasers: 1, esp: 3.3, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de cœurs, pas de bouclier).' },
    { name: 'Inventaire complet', rule: { t: 'allcoins' }, h: 50, up: 6, minMoves: 11, maxMoves: 19, branches: 7, rooms: 0.35, scc: true, cp: 1, presses: 3, patrols: 1, patrolKind: 'slime', esp: 3, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'L’atelier secret', h: 54, up: 6, minMoves: 12, maxMoves: 21, branches: 8, rooms: 0.45, coinRate: 1, cp: 1, chest: 2, relic: true, gears: 2, presses: 3, esp: 3, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : une relique se cache derrière un mur fissuré.' }
};
const CHATEAU = {
  main: [
    { h: 56, up: 7, minMoves: 14, maxMoves: 23, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], ghosts: 1, spikes: 3, lasers: 1, fakes: 1, esp: 3, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Nouveau : les fantômes traversent les murs. Ne te laisse pas rattraper !' },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['M'], fakes: 2, ghosts: 1, spikes: 3, arrows: 2, esp: 3, crystals: 3, obj: [{ t: 'crystals' }, T_TIME], tip: 'Méfie-toi des fausses sorties : leurs yeux s’allument de temps en temps…' },
    { h: 58, up: 7, minMoves: 14, maxMoves: 24, branches: 8, rooms: 0.3, cp: 2, bonus: ['B', 'M'], ghosts: 1, chasers: 1, spikes: 2, lasers: 2, arrows: 1, fakes: 1, esp: 3, key: true, obj: [{ t: 'key' }, T_TIME], tip: 'Un mur fissuré cache la clé du niveau secret.' },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 8, rooms: 0.3, cp: 2, bonus: ['B'], ghosts: 2, gates: 1, spikes: 4, arrows: 2, fakes: 1, esp: 3.1, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME], tip: 'Pièges combinés : pics, flèches et lasers gardent les mêmes couloirs.' },
    { h: 60, up: 7, minMoves: 15, maxMoves: 25, branches: 9, rooms: 0.3, cp: 2, bonus: ['M'], ghosts: 2, chasers: 1, toggles: { sw: 1, bar: 3 }, lasers: 2, fakes: 1, esp: 3.1, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 62, up: 7, minMoves: 15, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, bonus: ['B', 'M'], ghosts: 2, spikes: 4, arrows: 3, saws: 1, fakes: 2, esp: 3.2, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 62, up: 7, minMoves: 16, maxMoves: 26, branches: 9, rooms: 0.3, cp: 2, bonus: ['B'], ghosts: 2, chasers: 2, gates: 1, plates: 2, lasers: 2, fakes: 1, esp: 3.2, obj: [{ t: 'coins', p: 0.7 }, T_TIME] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 9, rooms: 0.3, cp: 2, bonus: ['M'], ghosts: 2, spikes: 5, arrows: 3, blocks: 1, fakes: 2, esp: 3.3, chest: 1, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 64, up: 7, minMoves: 16, maxMoves: 27, branches: 10, rooms: 0.3, cp: 2, bonus: ['B', 'M'], ghosts: 3, chasers: 1, toggles: { sw: 2, bar: 3 }, lasers: 3, fakes: 1, esp: 3.3, obj: [{ t: 'nobonus' }, T_TIME] },
    { h: 66, up: 7, minMoves: 17, maxMoves: 28, branches: 10, rooms: 0.3, cp: 2, bonus: ['B'], ghosts: 2, chasers: 2, spikes: 5, arrows: 3, fakes: 2, esp: 3.4, crystals: 3, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 66, up: 7, minMoves: 17, maxMoves: 28, branches: 10, rooms: 0.3, cp: 2, bonus: ['M'], ghosts: 3, gates: 1, lasers: 3, saws: 2, fakes: 2, esp: 3.4, obj: [{ t: 'nohit' }, T_TIME] },
    { h: 68, up: 7, minMoves: 17, maxMoves: 29, branches: 10, rooms: 0.3, cp: 2, bonus: ['B', 'M'], ghosts: 3, chasers: 2, toggles: { sw: 1, bar: 4 }, spikes: 5, arrows: 3, fakes: 2, esp: 3.5, crystals: 3, chest: 1, obj: [{ t: 'crystals' }, T_TIME] },
    { h: 68, up: 7, minMoves: 18, maxMoves: 29, branches: 10, rooms: 0.3, cp: 2, bonus: ['B'], ghosts: 3, chasers: 2, lasers: 3, saws: 2, fakes: 2, esp: 3.5, obj: [{ t: 'coins', p: 0.75 }, T_TIME] },
    { h: 70, up: 7, minMoves: 18, maxMoves: 30, branches: 11, rooms: 0.3, cp: 2, bonus: ['M'], ghosts: 4, chasers: 2, gates: 1, plates: 2, spikes: 5, arrows: 4, fakes: 3, esp: 3.6, crystals: 3, obj: [{ t: 'crystals' }, { t: 'nohit' }] }
  ],
  boss: arena(['###########', '###########', '###########', '#.........#', '#..#......#', '#.........#', '#......##.#', '##........#', '#..#......#', '#...#....##', '###...#...#', '##....#...#', '#..#......#', '#.....###.#', '#.#.......#', '#....S....#', '###########'],
    { kind: 'king', name: 'Le Roi maudit', hp: 6, par: 95, targets: [[9, 3], [1, 15], [5, 10], [9, 12], [2, 8], [6, 6]] }),
  defis: [
    { name: 'La fuite du donjon', rule: { t: 'timer' }, h: 56, up: 7, minMoves: 14, maxMoves: 22, branches: 5, rooms: 0.2, bonus: ['V'], boosters: 3, fakes: 2, spikes: 3, esp: 3.2, obj: [T_TIME, { t: 'time', k: 0.8 }], tip: 'Défi : atteins la vraie sortie avant la fin du chrono.' },
    { name: 'Nuit blanche', rule: { t: 'nohit' }, h: 58, up: 7, minMoves: 14, maxMoves: 23, branches: 6, rooms: 0.3, bonus: ['M'], ghosts: 3, arrows: 4, spikes: 4, esp: 3.3, obj: [{ t: 'coins', p: 0.7 }, T_TIME], tip: 'Défi : un seul coup et c’est fini (pas de cœurs, pas de bouclier).' },
    { name: 'Le trésor du roi', rule: { t: 'allcoins' }, h: 50, up: 6, minMoves: 11, maxMoves: 19, branches: 7, rooms: 0.35, scc: true, cp: 1, ghosts: 1, spikes: 3, esp: 3, obj: [T_TIME, { t: 'nohit' }], tip: 'Défi : la sortie reste fermée tant qu’il reste des pièces.' }
  ],
  secret: { name: 'La crypte royale', h: 54, up: 6, minMoves: 12, maxMoves: 21, branches: 8, rooms: 0.45, coinRate: 1, cp: 1, chest: 2, relic: true, ghosts: 1, fakes: 2, arrows: 2, esp: 3, obj: [{ t: 'relic' }, { t: 'allcoins' }], tip: 'Niveau secret : une relique se cache derrière un mur fissuré.' }
};

function build(cfg, seed, n) {
  const lv = best(cfg, seed, n);
  delete lv._q; lv.obj = cfg.obj; if (cfg.tip) lv.tip = cfg.tip; if (cfg.rule) lv.rule = cfg.rule; if (cfg.name) lv.name = cfg.name;
  if (cfg.rule && cfg.rule.t === 'timer') lv.rule = { t: 'timer', s: Math.round(lv.par * 1.25) };
  return lv;
}
// mondes déjà publiés : conservés (sauf ONLY=…) ; LEG = nombre de niveaux d'origine avant les niveaux générés
const OUT = process.argv[2] || 'maze-levels-v2.js', N = +(process.env.CAND || 8), ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
let prev = {}; try { global.window = {}; require(require('path').resolve(OUT)); prev = global.window.MILO_MAZE_EXTRA || {}; } catch (e) { prev = {}; }
const WORLDS_GEN = [['ruines', RUINES, 5000, 6], ['cyber', CYBER, 7000, 6], ['foret', FORET, 9000, 0], ['sables', SABLES, 11000, 6], ['glace', GLACE, 13000, 0], ['volcan', VOLCAN, 15000, 0], ['atlantide', ATLANTIDE, 17000, 0], ['cosmos', COSMOS, 19000, 6], ['usine', USINE, 21000, 0], ['chateau', CHATEAU, 23000, 0]];
const out = {};
for (const [wid, W2, base, LEG] of WORLDS_GEN) {
  if (ONLY.length ? !ONLY.includes(wid) : prev[wid]) { if (prev[wid]) out[wid] = prev[wid]; process.stderr.write(`${wid} : conservé\n`); continue; }
  const t0 = Date.now();
  const main = W2.main.map((cfg, i) => { const lv = build(cfg, base + i * 97, N); process.stderr.write(`${wid} ${i + LEG + 1}: h=${lv.h} coups=${lv.moves} pièces=${lv.coins} par=${lv.par}s ents=${lv.ents.length} cp=${lv.rows.join('').split('F').length - 1}\n`); return lv; });
  main.push(W2.boss); process.stderr.write(`${wid} ${main.length + LEG} (boss) itinéraire=${W2.boss.boss.route.join('|')}\n`);
  const defis = W2.defis.map((cfg, i) => { const lv = build(cfg, base + 900 + i * 53, N); process.stderr.write(`${wid} défi ${i + 1}: coups=${lv.moves} par=${lv.par}s règle=${JSON.stringify(lv.rule)}\n`); return lv; });
  const secret = build(W2.secret, base + 1500, N); process.stderr.write(`${wid} secret: coups=${secret.moves} pièces=${secret.coins}\n`);
  out[wid] = { main, defis, secret }; process.stderr.write(`${wid} : ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}
const js = `/* Milo Maze — contenu V2 (tools/maze/gen2.js) : niveaux des mondes enrichis, défis et niveaux secrets.
   Nouvelles cases : P plaque · g grille (s'ouvre quand toutes les plaques sont enfoncées) · o interrupteur · a barrière rouge · b barrière bleue
                     H mur fissuré (passage secret) · K clé secrète · Q relique · C coffre · * cristal
                     F checkpoint · L lucioles · i piège caché · u dalle fragile · y / Y murs de grès (changent à chaque arrêt)
                     n neige (arrêt net) · O bloc gelé (se pousse) · w plateforme de basalte (temporisée) · j geyser
                     A bulle d'air · G orbe de gravité · r étoile inversée · 1-4 portails · ^ > v < courants (Atlantide)
                     6 7 8 9 engrenages (tournent à chaque arrêt) · e presse · X fausse sortie
   Entités en plus : chaser (robot pisteur), ghost (fantôme qui traverse les murs).
   Entités : arrow (piège à flèches). Niveau « dark » : obscurité (rayon de lumière en cases). « lava » : lave montante {v cases/s, g délai}. « o2 » : oxygène (s).
   Les niveaux de boss (boss:{…}) sont des arènes conçues à la main et vérifiées. */
window.MILO_MAZE_EXTRA = ${JSON.stringify(out)};
`;
fs.writeFileSync(OUT, js);
