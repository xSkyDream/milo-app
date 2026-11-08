/* =====================================================================
   Milo Cross — traverser routes, rivières et univers avec Milo
   Rendu 3D (Three.js, chargé seulement à l'ouverture du jeu) :
   formes arrondies, ombres douces, caméra orthographique inclinée.
   Chaque voie (sol + décor) est fusionnée en un seul maillage pour la fluidité.
   Milo = visuels officiels (dos, face, trois-quarts, expressions) en billboard.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames; if (!MG) return;
  const SRC = (document.currentScript && document.currentScript.src) || '';
  const THREE_LOCAL = SRC ? new URL('vendor/three.module.min.js', SRC).href : 'games/vendor/three.module.min.js';
  const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';
  let T = null, threeP = null;
  const loadThree = () => T ? Promise.resolve(T) : (threeP = threeP || import(THREE_LOCAL).catch(() => import(THREE_CDN)).then((m) => (T = m)));

  /* ---------- Visuels de Milo (remplaçables) ---------- */
  const SPR = { dos: 'cross/milo_dos.webp', face: 'cross/milo_face.webp', g: 'cross/milo_g.webp', d: 'cross/milo_d.webp', alerte: 'cross/milo_alerte.webp', joie: 'cross/milo_joie.webp', ko: 'cross/milo_ko.webp', fete: 'cross/milo_fete.webp' };

  /* ---------- Univers ---------- */
  const LEN = 30; // voies par univers
  const BIOMES = [
    { id: 'ville', name: 'Ville', w: 'en ville', fog: '#e6e2fb', safe: ['#e0d9f3', '#d8d0ef'], side: ['#c8bfe3', '#c1b7de'], road: '#6d6a8c', roadS: '#605c7c', water: '#7cc4ff', pR: 0.62, pW: 0.14, props: ['lamp', 'bench', 'hydrant', 'planter', 'tree'], edge: ['building', 'building', 'tree', 'lamp'], veh: ['car', 'taxi', 'bus', 'van'], float: 'log', green: ['#8fd6a0', '#78c98d'],
      ico: '<path d="M3 21h18"/><path d="M5 21V7l7-4v18"/><path d="M19 21V11l-7-4"/><path d="M9 9h.01M9 13h.01M9 17h.01M15 13h.01M15 17h.01"/>', bg: 'linear-gradient(160deg,#cfd8ff,#a99cf0)' },
    { id: 'campagne', name: 'Campagne', w: 'à la campagne', fog: '#e9f6df', safe: ['#bfe9a8', '#b3e19b'], side: ['#a3d58c', '#9bce85'], road: '#7a7496', roadS: '#6d6789', water: '#7cc8ff', pR: 0.45, pW: 0.3, props: ['hay', 'fence', 'sunflower', 'bush', 'tree'], edge: ['tree', 'hay', 'silo', 'bush'], veh: ['tractor', 'van', 'car'], float: 'log', green: ['#7fcf72', '#6cc062'],
      ico: '<path d="M2 22 16 8"/><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z"/>', bg: 'linear-gradient(160deg,#d9f5c4,#8fd17a)' },
    { id: 'foret', name: 'Forêt', w: 'en forêt', fog: '#dcf1e4', safe: ['#97d6a0', '#8ecd97'], side: ['#7bbf86', '#73b77e'], road: '#76718f', roadS: '#69647f', water: '#6fc2ef', pR: 0.28, pW: 0.46, props: ['tree', 'pine', 'mushroom', 'rock', 'bush'], edge: ['pine', 'tree', 'pine', 'bush'], veh: ['van', 'car'], float: 'log', lily: 0.45, green: ['#4fae6e', '#3f9e60'],
      ico: '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>', bg: 'linear-gradient(160deg,#c9efd5,#5fb57d)' },
    { id: 'plage', name: 'Plage', w: 'à la plage', fog: '#fff1dc', safe: ['#ffe6b5', '#fbdda5'], side: ['#f5d397', '#efca8b'], road: '#8a84a5', roadS: '#7d7798', water: '#57d0ee', pR: 0.32, pW: 0.48, props: ['umbrella', 'castle', 'shell', 'palm'], edge: ['palm', 'umbrella', 'palm', 'castle'], veh: ['buggy', 'car'], float: 'boat', green: ['#5fc77a', '#4db86a'],
      ico: '<path d="M22 12a10.06 10.06 1 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/>', bg: 'linear-gradient(160deg,#fff0c9,#5fd0ee)' },
    { id: 'neige', name: 'Montagne', w: 'à la montagne', fog: '#eaf1ff', safe: ['#f8faff', '#eef3ff'], side: ['#e1e8fa', '#d9e1f6'], road: '#77748f', roadS: '#6b6884', water: '#9cd6ff', pR: 0.45, pW: 0.34, props: ['snowpine', 'snowman', 'rock'], edge: ['snowpine', 'snowpine', 'rock'], veh: ['snowmobile', 'car'], float: 'floe', green: ['#4f9f7a', '#3f8f6c'],
      ico: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/>', bg: 'linear-gradient(160deg,#ffffff,#a9c8ff)' }
  ];
  const VEH = { car: 1.3, taxi: 1.3, bus: 2.7, van: 1.8, tractor: 1.5, buggy: 1.15, snowmobile: 1.3 };
  const CAR_COLS = ['#ff8fa3', '#7cb8ff', '#ffd166', '#b49cff', '#6fdcb0', '#ff9f6b', '#ffffff'];
  const COLS = 4, SPAN = 13, RING = 32;
  const PITCH = 55 * Math.PI / 180, YAW = 14 * Math.PI / 180, VIEW_W = 8.4, MILO_W = 1.32;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- État ---------- */
  let api = null, root = null, UI = {}, raf = 0, last = 0, ro = null, rTimer = 0;
  let R = null; // monde 3D (renderer, scene, caméra, caches…)
  let st = null; // partie en cours
  let rng = Math.random;

  /* =====================================================================
     GÉOMÉTRIES (formes arrondies, couleurs par sommet, fusion)
     ===================================================================== */
  const GC = {};
  function rbox(w, h, d, r, s) {
    const k = `rb${w}|${h}|${d}|${r}|${s || 2}`; if (GC[k]) return GC[k];
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001); s = s || 2;
    const sh = new T.Shape(), e = 0.00001, rr = r - e;
    sh.absarc(e, e, e, -Math.PI / 2, -Math.PI, true); sh.absarc(e, h - rr * 2, e, Math.PI, Math.PI / 2, true);
    sh.absarc(w - rr * 2, h - rr * 2, e, Math.PI / 2, 0, true); sh.absarc(w - rr * 2, e, e, 0, -Math.PI / 2, true);
    const g = new T.ExtrudeGeometry(sh, { depth: d - r * 2, bevelEnabled: true, bevelSegments: s * 2, steps: 1, bevelSize: rr, bevelThickness: r, curveSegments: s });
    g.center(); return (GC[k] = g);
  }
  const sph = (r, a, b) => GC['s' + r + (a || 12)] || (GC['s' + r + (a || 12)] = new T.SphereGeometry(r, a || 12, b || 8));
  const cyl = (t, b, h, n) => GC[`c${t}|${b}|${h}|${n}`] || (GC[`c${t}|${b}|${h}|${n}`] = new T.CylinderGeometry(t, b, h, n || 14));
  const cone = (r, h, n) => GC[`k${r}|${h}|${n}`] || (GC[`k${r}|${h}|${n}`] = new T.ConeGeometry(r, h, n || 14));
  const ico = (r) => GC['i' + r] || (GC['i' + r] = new T.IcosahedronGeometry(r, 1));
  const caps = (r, l) => GC[`p${r}|${l}`] || (GC[`p${r}|${l}`] = new T.CapsuleGeometry(r, l, 5, 12));
  const box = (w, h, d) => GC[`b${w}|${h}|${d}`] || (GC[`b${w}|${h}|${d}`] = new T.BoxGeometry(w, h, d));
  let _m, _q, _e, _v, _s, _c;
  function M(x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _v.set(x || 0, y || 0, z || 0); _s.set(sx || 1, sy == null ? (sx || 1) : sy, sz == null ? (sx || 1) : sz);
    return new T.Matrix4().compose(_v.clone(), _q.clone(), _s.clone());
  }
  const P = (g, c, m) => ({ g, c, m });
  function merge(parts, base) {
    let n = 0; const list = [];
    for (const p of parts) { let g = p.g.index ? p.g.toNonIndexed() : p.g.clone(); g.applyMatrix4(base ? base.clone().multiply(p.m) : p.m); list.push([g, p.c]); n += g.attributes.position.count; }
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const [g, c] of list) {
      const cnt = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      _c.set(c); for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = _c.r; col[(o + i) * 3 + 1] = _c.g; col[(o + i) * 3 + 2] = _c.b; }
      o += cnt; g.dispose();
    }
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3)); out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere(); return out;
  }
  const pick = (a) => a[Math.floor(rng() * a.length)];

  /* ---------- Décor (props) : listes de pièces autour de l'origine (au sol) ---------- */
  const PROPS = {
    tree: (B) => { const g = B.green; return [P(cyl(0.09, 0.12, 0.5, 10), '#b47c55', M(0, 0.25)), P(sph(0.46), g[0], M(0, 0.82, 0, 0, 0, 0, 1, 0.92, 1)), P(sph(0.32), g[1], M(-0.24, 0.66, 0.12)), P(sph(0.3), g[0], M(0.24, 0.7, -0.08)), P(sph(0.18, 10, 8), g[0], M(-0.12, 1.08, 0.1))]; },
    pine: (B) => { const g = B.green; return [P(cyl(0.08, 0.1, 0.34, 10), '#a86f4c', M(0, 0.17)), P(sph(0.46), g[1], M(0, 0.5, 0, 0, 0, 0, 1, 0.62, 1)), P(sph(0.37), g[0], M(0, 0.82, 0, 0, 0, 0, 1, 0.66, 1)), P(sph(0.26), g[1], M(0, 1.1, 0, 0, 0, 0, 1, 0.72, 1)), P(sph(0.13, 10, 8), g[0], M(0, 1.3))]; },
    snowpine: (B) => { const g = B.green; return [P(cyl(0.08, 0.1, 0.34, 10), '#a86f4c', M(0, 0.17)), P(sph(0.46), g[1], M(0, 0.5, 0, 0, 0, 0, 1, 0.62, 1)), P(sph(0.3), '#ffffff', M(0, 0.66, 0, 0, 0, 0, 1, 0.35, 1)), P(sph(0.37), g[0], M(0, 0.86, 0, 0, 0, 0, 1, 0.66, 1)), P(sph(0.24), '#ffffff', M(0, 1.0, 0, 0, 0, 0, 1, 0.38, 1)), P(sph(0.24), g[1], M(0, 1.14, 0, 0, 0, 0, 1, 0.72, 1)), P(sph(0.14, 10, 8), '#ffffff', M(0, 1.3))]; },
    bush: (B) => [P(sph(0.3), B.green[0], M(0, 0.22)), P(sph(0.24), B.green[1], M(0.24, 0.17, 0.06)), P(sph(0.22), B.green[0], M(-0.22, 0.16, -0.05))],
    rock: () => [P(ico(0.3), '#bdb6d6', M(0, 0.16, 0, 0.3, 0.6, 0, 1.15, 0.7, 0.95)), P(ico(0.17), '#cfc9e3', M(0.28, 0.1, 0.12, 0.5, 0.2, 0.3, 1, 0.75, 1))],
    lamp: () => [P(cyl(0.13, 0.15, 0.1, 12), '#5b5675', M(0, 0.05)), P(cyl(0.045, 0.055, 1.15, 10), '#6a6587', M(0, 0.62)), P(sph(0.16, 12, 10), '#fff2b8', M(0, 1.26)), P(cyl(0.1, 0.13, 0.06, 12), '#5b5675', M(0, 1.14))],
    bench: () => [P(rbox(0.82, 0.08, 0.32, 0.03), '#d39463', M(0, 0.3)), P(rbox(0.82, 0.24, 0.06, 0.03), '#d39463', M(0, 0.48, -0.14)), P(rbox(0.06, 0.3, 0.28, 0.02), '#5e5878', M(-0.32, 0.15)), P(rbox(0.06, 0.3, 0.28, 0.02), '#5e5878', M(0.32, 0.15))],
    hydrant: () => [P(cyl(0.13, 0.15, 0.42, 12), '#ff6b81', M(0, 0.21)), P(sph(0.14, 12, 8), '#ff6b81', M(0, 0.43)), P(cyl(0.05, 0.05, 0.38, 8), '#ff8fa0', M(0, 0.28, 0, 0, 0, Math.PI / 2)), P(cyl(0.16, 0.17, 0.05, 12), '#e05a72', M(0, 0.03))],
    planter: () => [P(rbox(0.72, 0.3, 0.5, 0.08), '#f1d2b7', M(0, 0.15)), P(sph(0.12, 10, 8), '#ff8fb8', M(-0.2, 0.36)), P(sph(0.12, 10, 8), '#ffd166', M(0.04, 0.38, 0.06)), P(sph(0.12, 10, 8), '#c7a6ff', M(0.24, 0.36, -0.05)), P(sph(0.16, 10, 8), '#7fcf8f', M(0, 0.3, -0.1, 0, 0, 0, 2, 0.6, 1))],
    building: () => { const h = 0.9 + rng() * 1.0, w = 0.92, c = pick(['#f6c9dc', '#cad9ff', '#ffe2b8', '#d8ccff', '#c8f0e0', '#fff1c7']), out = [P(rbox(w, h, 0.92, 0.14), c, M(0, h / 2)), P(rbox(w + 0.06, 0.12, 0.98, 0.05), '#ffffff', M(0, h + 0.03))];
      for (let y = 0.35; y < h - 0.15; y += 0.36) for (const x of [-0.22, 0.22]) out.push(P(box(0.2, 0.22, 0.04), rng() < 0.3 ? '#fff3c4' : '#ffffff', M(x, y, 0.46)));
      return out; },
    hay: () => [P(cyl(0.3, 0.3, 0.46, 16), '#f2cf6b', M(0, 0.3, 0, 0, 0, Math.PI / 2)), P(cyl(0.22, 0.22, 0.47, 16), '#e9bf55', M(0, 0.3, 0, 0, 0, Math.PI / 2, 1, 1.02, 1))],
    fence: () => [P(rbox(0.09, 0.5, 0.09, 0.03), '#fff7ee', M(-0.4, 0.25)), P(rbox(0.09, 0.5, 0.09, 0.03), '#fff7ee', M(0.4, 0.25)), P(rbox(0.95, 0.07, 0.05, 0.02), '#fff7ee', M(0, 0.22)), P(rbox(0.95, 0.07, 0.05, 0.02), '#fff7ee', M(0, 0.4))],
    sunflower: () => [P(cyl(0.03, 0.035, 0.72, 8), '#5fb85a', M(0, 0.36)), P(sph(0.1, 8, 6), '#6cc062', M(0.08, 0.3, 0, 0, 0, -0.5, 1, 0.35, 0.6)), P(cyl(0.21, 0.21, 0.05, 16), '#ffd23f', M(0, 0.78, 0.02, Math.PI / 2 - 0.3)), P(cyl(0.1, 0.1, 0.06, 14), '#9a5b2e', M(0, 0.79, 0.05, Math.PI / 2 - 0.3))],
    silo: () => [P(cyl(0.34, 0.36, 1.2, 16), '#ffffff', M(0, 0.6)), P(sph(0.35, 16, 8), '#ef8b8b', M(0, 1.2, 0, 0, 0, 0, 1, 0.6, 1)), P(cyl(0.36, 0.36, 0.06, 16), '#ef8b8b', M(0, 0.6))],
    mushroom: () => [P(cyl(0.08, 0.1, 0.26, 10), '#fff7ee', M(0, 0.13)), P(sph(0.22, 14, 8), '#ff6b6b', M(0, 0.28, 0, 0, 0, 0, 1, 0.62, 1)), P(sph(0.04, 6, 4), '#ffffff', M(0.1, 0.38, 0.1)), P(sph(0.04, 6, 4), '#ffffff', M(-0.08, 0.4, 0.06)), P(sph(0.035, 6, 4), '#ffffff', M(0.02, 0.4, -0.12))],
    palm: (B) => { const out = [P(cyl(0.07, 0.1, 0.5, 10), '#c9a27a', M(0, 0.25, 0, 0, 0, 0.08)), P(cyl(0.065, 0.075, 0.5, 10), '#d3ad85', M(0.04, 0.72, 0, 0, 0, 0.16)), P(cyl(0.06, 0.07, 0.45, 10), '#c9a27a', M(0.11, 1.15, 0, 0, 0, 0.24))];
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; out.push(P(sph(0.3, 12, 8), B.green[i % 2], M(0.15 + Math.cos(a) * 0.28, 1.36, Math.sin(a) * 0.28, 0, -a, -0.45, 1.4, 0.14, 0.42))); }
      out.push(P(sph(0.07, 8, 6), '#8a5a3a', M(0.12, 1.3, 0.08)), P(sph(0.07, 8, 6), '#8a5a3a', M(0.2, 1.3, -0.06))); return out; },
    umbrella: () => { const c = pick(['#ff8fb8', '#7cc4ff', '#ffd166', '#b49cff']); return [P(cyl(0.025, 0.025, 1.0, 8), '#ffffff', M(0, 0.5)), P(cone(0.56, 0.26, 16), c, M(0, 1.08)), P(sph(0.05, 8, 6), '#ffffff', M(0, 1.22)), P(rbox(0.46, 0.03, 0.78, 0.01), pick(['#ffffff', '#b8e3ff', '#ffd0e4']), M(0.42, 0.015, 0.1))]; },
    castle: () => [P(cyl(0.24, 0.27, 0.3, 14), '#ecc684', M(0, 0.15)), P(cyl(0.14, 0.16, 0.24, 12), '#e3ba74', M(0, 0.42)), P(cone(0.1, 0.16, 12), '#ff8fa3', M(0, 0.62)), P(cyl(0.08, 0.09, 0.2, 10), '#ecc684', M(0.24, 0.1, 0.12))],
    shell: () => [P(sph(0.16, 12, 8), '#ffc4d6', M(0, 0.06, 0, 0, 0.5, 0, 1.2, 0.45, 0.9)), P(sph(0.1, 10, 6), '#fff0f5', M(0.3, 0.04, 0.15, 0, 1.2, 0, 1.2, 0.4, 0.9))],
    snowman: () => [P(sph(0.3), '#ffffff', M(0, 0.28)), P(sph(0.22), '#ffffff', M(0, 0.66)), P(sph(0.15, 12, 10), '#ffffff', M(0, 0.95)), P(cone(0.035, 0.16, 8), '#ff9a3c', M(0, 0.95, 0.2, Math.PI / 2)), P(sph(0.025, 6, 4), '#2c2848', M(-0.06, 1.0, 0.13)), P(sph(0.025, 6, 4), '#2c2848', M(0.06, 1.0, 0.13)), P(cyl(0.24, 0.24, 0.07, 14), '#7cb8ff', M(0, 0.82))]
  };
  /* ---------- Véhicules (orientés vers +x) ---------- */
  const wheel = (x, z, r) => P(cyl(r || 0.17, r || 0.17, 0.14, 14), '#3b3550', M(x, r || 0.17, z, Math.PI / 2));
  const lights = (x, y, z) => [P(sph(0.07, 8, 6), '#fff6c8', M(x, y, z)), P(sph(0.07, 8, 6), '#fff6c8', M(x, y, -z))];
  const VMESH = {
    car: (c) => [P(rbox(1.26, 0.4, 0.74, 0.17), c, M(0, 0.34)), P(rbox(0.72, 0.34, 0.64, 0.15), '#e4f3ff', M(-0.06, 0.66)), P(rbox(0.66, 0.08, 0.6, 0.04), c, M(-0.06, 0.84)), wheel(0.4, 0.33), wheel(0.4, -0.33), wheel(-0.4, 0.33), wheel(-0.4, -0.33), ...lights(0.62, 0.38, 0.23), P(sph(0.06, 8, 6), '#ff7a9a', M(-0.62, 0.38, 0.23)), P(sph(0.06, 8, 6), '#ff7a9a', M(-0.62, 0.38, -0.23))],
    taxi: () => [...VMESH.car('#ffd166'), P(rbox(0.3, 0.12, 0.18, 0.04), '#ffffff', M(-0.06, 0.94))],
    bus: (c) => [P(rbox(2.62, 0.82, 0.84, 0.22), c, M(0, 0.56)), P(rbox(2.3, 0.26, 0.86, 0.08), '#e4f3ff', M(0.04, 0.72)), P(rbox(0.1, 0.32, 0.7, 0.04), '#e4f3ff', M(1.3, 0.66)), wheel(0.9, 0.36), wheel(0.9, -0.36), wheel(-0.9, 0.36), wheel(-0.9, -0.36), ...lights(1.31, 0.38, 0.28)],
    van: (c) => [P(rbox(1.72, 0.72, 0.8, 0.2), c, M(0, 0.5)), P(rbox(0.14, 0.3, 0.7, 0.05), '#e4f3ff', M(0.82, 0.66)), P(rbox(1.2, 0.2, 0.82, 0.06), '#ffffff', M(-0.2, 0.5)), wheel(0.55, 0.35), wheel(0.55, -0.35), wheel(-0.55, 0.35), wheel(-0.55, -0.35), ...lights(0.87, 0.4, 0.26)],
    tractor: () => [P(rbox(0.95, 0.42, 0.6, 0.12), '#6fcf72', M(0.15, 0.48)), P(rbox(0.46, 0.5, 0.52, 0.1), '#e4f3ff', M(-0.22, 0.92)), P(rbox(0.52, 0.06, 0.58, 0.03), '#6fcf72', M(-0.22, 1.19)), wheel(-0.32, 0.36, 0.33), wheel(-0.32, -0.36, 0.33), wheel(0.42, 0.3, 0.18), wheel(0.42, -0.3, 0.18), P(cyl(0.04, 0.04, 0.4, 8), '#5b5675', M(0.38, 0.86, 0.15)), ...lights(0.63, 0.5, 0.18)],
    buggy: (c) => [P(rbox(1.05, 0.28, 0.72, 0.12), c, M(0, 0.38)), P(rbox(0.06, 0.42, 0.06, 0.02), '#ffffff', M(-0.2, 0.7, 0.28)), P(rbox(0.06, 0.42, 0.06, 0.02), '#ffffff', M(-0.2, 0.7, -0.28)), P(rbox(0.08, 0.06, 0.62, 0.02), '#ffffff', M(-0.2, 0.9)), wheel(0.36, 0.38, 0.22), wheel(0.36, -0.38, 0.22), wheel(-0.36, 0.38, 0.22), wheel(-0.36, -0.38, 0.22)],
    snowmobile: (c) => [P(rbox(1.1, 0.34, 0.52, 0.14), c, M(0, 0.42)), P(rbox(0.36, 0.26, 0.5, 0.1), '#e4f3ff', M(0.32, 0.66, 0, 0, 0, -0.5)), P(rbox(1.25, 0.05, 0.1, 0.025), '#5b5675', M(0, 0.06, 0.24)), P(rbox(1.25, 0.05, 0.1, 0.025), '#5b5675', M(0, 0.06, -0.24)), P(rbox(0.5, 0.1, 0.42, 0.04), '#3b3550', M(-0.25, 0.62)), ...lights(0.56, 0.48, 0.14)]
  };
  const FLOAT = {
    log: (len) => [P(caps(0.27, Math.max(0.1, len - 0.54)), '#b98457', M(0, 0, 0, 0, 0, Math.PI / 2)), P(caps(0.07, 0.12), '#a06f45', M(len * 0.18, 0.2, 0.05, 0.4, 0, 0.3))],
    boat: (len, c) => [P(rbox(len, 0.3, 0.84, 0.15), c, M(0, -0.04)), P(rbox(len - 0.16, 0.08, 0.7, 0.04), '#fff7ee', M(0, 0.1)), P(rbox(0.66, 0.34, 0.54, 0.12), '#ffffff', M(-len * 0.2, 0.3)), P(box(0.68, 0.1, 0.56), '#7cc8ff', M(-len * 0.2, 0.36)), P(cyl(0.025, 0.025, 0.7, 6), '#ffffff', M(len * 0.12, 0.45)), P(rbox(0.32, 0.2, 0.03, 0.02), '#ffd166', M(len * 0.12 + 0.17, 0.68))],
    floe: (len) => [P(rbox(len, 0.2, 0.84, 0.09), '#cfeeff', M(0, 0)), P(rbox(len - 0.3, 0.07, 0.66, 0.035), '#ffffff', M(0.06, 0.1))],
    lily: () => [P(cyl(0.42, 0.42, 0.06, 20), '#6fd18a', M(0, 0)), P(sph(0.08, 8, 6), '#ff9fc6', M(0.15, 0.07, -0.1))]
  };

  /* =====================================================================
     MONDE
     ===================================================================== */
  function initWorld(canvas) {
    _m = new T.Matrix4(); _q = new T.Quaternion(); _e = new T.Euler(); _v = new T.Vector3(); _s = new T.Vector3(); _c = new T.Color();
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const cam = new T.OrthographicCamera(-5, 5, 10, -10, 0.1, 120);
    const hemi = new T.HemisphereLight('#ffffff', '#9d8fd0', 1.05); scene.add(hemi);
    const sun = new T.DirectionalLight('#fff1dc', 2.15); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    scene.add(sun); scene.add(sun.target);
    scene.fog = new T.Fog('#e6e2fb', 31, 46);
    const mat = new T.MeshLambertMaterial({ vertexColors: true });
    // texture d'eau (reflets) en émissif
    const wc = document.createElement('canvas'); wc.width = 256; wc.height = 64; const wx = wc.getContext('2d');
    wx.fillStyle = '#000'; wx.fillRect(0, 0, 256, 64); wx.strokeStyle = 'rgba(255,255,255,.85)'; wx.lineWidth = 3; wx.lineCap = 'round';
    for (let i = 0; i < 9; i++) { const x = (i * 53) % 256, y = 8 + ((i * 23) % 48); wx.beginPath(); wx.moveTo(x, y); wx.quadraticCurveTo(x + 12, y - 4, x + 24, y); wx.stroke(); }
    const wtex = new T.CanvasTexture(wc); wtex.wrapS = wtex.wrapT = T.RepeatWrapping; wtex.repeat.set(6, 1);
    const water = {}; BIOMES.forEach((b) => { water[b.id] = new T.MeshPhongMaterial({ color: b.water, emissive: '#ffffff', emissiveMap: wtex, emissiveIntensity: 0.32, shininess: 90, specular: '#ffffff' }); });
    const goldM = new T.MeshPhongMaterial({ color: '#ffd23f', emissive: '#a86b00', emissiveIntensity: 0.45, shininess: 80, specular: '#fff6c8' });
    // étoile
    const ss = new T.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 0.12 : 0.27; i ? ss.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ss.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const starG = new T.ExtrudeGeometry(ss, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 3 }); starG.center();
    // ombre douce de Milo
    const bc = document.createElement('canvas'); bc.width = bc.height = 64; const bx = bc.getContext('2d'); const bgd = bx.createRadialGradient(32, 32, 2, 32, 32, 30); bgd.addColorStop(0, 'rgba(40,20,90,.55)'); bgd.addColorStop(1, 'rgba(40,20,90,0)'); bx.fillStyle = bgd; bx.fillRect(0, 0, 64, 64);
    const blob = new T.Mesh(new T.PlaneGeometry(1.1, 0.8), new T.MeshBasicMaterial({ map: new T.CanvasTexture(bc), transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; scene.add(blob);
    // anneau d'éclaboussure
    const ring = new T.Mesh(new T.RingGeometry(0.3, 0.42, 32), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
    // Milo
    const tex = {}, loader = new T.TextureLoader();
    Object.keys(SPR).forEach((k) => { const t = loader.load(MG.asset(SPR[k])); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; tex[k] = t; });
    const mg = new T.PlaneGeometry(1, 1); mg.translate(0, 0.5, 0);
    const milo = new T.Mesh(mg, new T.MeshBasicMaterial({ map: tex.dos, transparent: true, depthWrite: false, alphaTest: 0.02 }));
    milo.renderOrder = 5; scene.add(milo);
    return { renderer, scene, cam, sun, hemi, mat, water, goldM, starG, blob, ring, milo, tex, lanes: new Map(), w: 1, h: 1 };
  }

  function biomeAt(r) { return (st.b0 + Math.max(0, Math.floor(r / LEN))) % BIOMES.length; }
  function chooseNext(B, d) {
    const g = st.gen;
    if (g.type === 'safe') {
      const x = rng();
      if (x < B.pR) { g.type = 'road'; g.left = Math.min(4, 1 + Math.floor(rng() * (1.6 + 2.6 * d))); }
      else if (x < B.pR + B.pW) { g.type = 'water'; g.left = Math.min(3, 1 + Math.floor(rng() * (1.3 + 1.8 * d))); }
      else { g.type = 'safe'; g.left = 1; }
    } else { g.type = 'safe'; g.left = rng() < 0.55 - 0.3 * d ? 2 : 1; }
  }

  function makeLane(r) {
    const bi = biomeAt(r), B = BIOMES[bi], d = clamp(r / 160, 0, 1), local = ((r % LEN) + LEN) % LEN;
    let type;
    if (r < 4 || local < 2) { type = 'safe'; st.gen.type = 'safe'; st.gen.left = 0; }
    else { if (st.gen.left <= 0) chooseNext(B, d); type = st.gen.type; st.gen.left--; }
    st.gen.path = clamp(st.gen.path + (rng() < 0.45 ? 0 : rng() < 0.5 ? -1 : 1), -3, 3);
    const L = { r, type, bi, blocked: new Set(), dyn: [], star: null, dir: 1, speed: 0, path: st.gen.path };
    const z = -r, parts = [], alt = ((r % 2) + 2) % 2;
    const prev = R.lanes.get(r - 1);
    if (type === 'safe') {
      parts.push(P(rbox(9.1, 0.4, 0.98, 0.12), B.safe[alt], M(0, -0.2, z)));
      const sw = SPAN - 4.62; parts.push(P(rbox(sw, 0.4, 0.98, 0.12), B.side[alt], M(-(4.62 + sw / 2), -0.2, z)), P(rbox(sw, 0.4, 0.98, 0.12), B.side[alt], M(4.62 + sw / 2, -0.2, z)));
      // obstacles dans la zone de jeu
      if (r > 1 || r < -1) {
        const p = r >= 0 ? 0.14 + 0.12 * d : 0.5;
        for (let c = -COLS; c <= COLS; c++) {
          if (Math.abs(c - L.path) <= 0 || L.blocked.size >= 4) continue;
          if (r >= 0 && r <= 2 && Math.abs(c) <= 1) continue;
          if (rng() < p) { L.blocked.add(c); parts.push(...PROPS[pick(B.props)](B).map((q) => ({ ...q, m: M(c, 0, z, 0, rng() * 0.6 - 0.3).multiply(q.m) }))); }
        }
      }
      // décor de bord
      for (let c = 5; c <= 7; c++) for (const sgn of [-1, 1]) {
        if (rng() < [0.8, 0.62, 0.4][c - 5]) parts.push(...PROPS[pick(B.edge)](B).map((q) => ({ ...q, m: M(sgn * c + (rng() - 0.5) * 0.2, 0, z, 0, rng() * 0.8 - 0.4).multiply(q.m) })));
      }
      if (r >= 5 && rng() < 0.17) { const free = []; for (let c = -COLS; c <= COLS; c++) if (!L.blocked.has(c)) free.push(c); if (free.length) L.star = pick(free); }
    } else if (type === 'road') {
      parts.push(P(box(9.2, 0.3, 1.0), B.road, M(0, -0.21, z)));
      const sw = SPAN - 4.6; parts.push(P(box(sw, 0.3, 1.0), B.roadS, M(-(4.6 + sw / 2), -0.21, z)), P(box(sw, 0.3, 1.0), B.roadS, M(4.6 + sw / 2, -0.21, z)));
      if (prev && prev.type === 'road') for (let x = -SPAN + 0.5; x < SPAN; x += 1.6) parts.push(P(rbox(0.62, 0.03, 0.09, 0.012), '#ffffff', M(x, -0.055, z + 0.5)));
      L.dir = prev && prev.type === 'road' ? -prev.dir : (rng() < 0.5 ? 1 : -1);
      L.speed = (1.3 + rng() * 1.3) * (1 + 0.85 * d);
      const k0 = pick(B.veh);
      let pos = rng() * 4;
      while (pos < RING - 2) {
        const kind = rng() < 0.7 ? k0 : pick(B.veh), len = VEH[kind];
        L.dyn.push({ kind, len, x: pos + len / 2 - RING / 2, col: pick(CAR_COLS) });
        pos += len + (2.4 + rng() * 4.2) * (1 - 0.35 * d) + 0.6;
      }
    } else {
      const fk = B.float, lily = B.lily && rng() < B.lily && !(prev && prev.lily);
      L.lily = lily;
      if (lily) {
        L.speed = 0;
        for (let c = -COLS; c <= COLS; c++) if (c === L.path || rng() < 0.42) L.dyn.push({ kind: 'lily', len: 0.86, x: c });
      } else {
        L.dir = prev && prev.type === 'water' ? -prev.dir : (rng() < 0.5 ? 1 : -1);
        L.speed = (0.8 + rng() * 0.9) * (1 + 0.5 * d);
        let pos = rng() * 2;
        while (pos < RING - 1.5) {
          const len = fk === 'boat' ? 2.2 + rng() * 0.7 : (1.8 + rng() * 1.5) * (1 - 0.25 * d) + 0.2;
          L.dyn.push({ kind: fk, len, x: pos + len / 2 - RING / 2 });
          pos += len + (1.1 + rng() * 1.6) * (1 + 0.35 * d);
        }
      }
    }
    if (parts.length) {
      const geo = merge(parts);
      L.mesh = new T.Mesh(geo, R.mat); L.mesh.receiveShadow = true; L.mesh.castShadow = type === 'safe';
      R.scene.add(L.mesh);
    }
    if (type === 'water') { const wm = new T.Mesh(GC.water || (GC.water = new T.PlaneGeometry(SPAN * 2, 1)), R.water[B.id]); wm.rotation.x = -Math.PI / 2; wm.position.set(0, -0.24, z); wm.receiveShadow = true; R.scene.add(wm); L.wmesh = wm; }
    // objets mobiles
    L.dyn.forEach((v) => {
      let geo;
      if (type === 'road') { const key = 'v' + v.kind + v.col; geo = GC[key] || (GC[key] = merge(VMESH[v.kind](v.col))); }
      else { const bc = v.kind === 'boat' ? pick(['#ff8fa3', '#7cb8ff', '#ffd166', '#b49cff']) : ''; const key = 'f' + v.kind + bc + (v.kind === 'lily' ? '' : v.len.toFixed(1)); geo = GC[key] || (GC[key] = merge(FLOAT[v.kind](+v.len.toFixed(1), bc))); }
      const m = new T.Mesh(geo, R.mat); m.castShadow = true; m.receiveShadow = type !== 'road';
      v.y = type === 'road' ? -0.06 : v.kind === 'lily' ? -0.2 : -0.16;
      v.top = type === 'road' ? 0 : v.kind === 'log' ? 0.1 : v.kind === 'boat' ? 0.1 : v.kind === 'floe' ? -0.05 : -0.16;
      m.position.set(v.x, v.y, z); if (type === 'road' && L.dir < 0) m.rotation.y = Math.PI;
      v.ph = rng() * 6.28; v.mesh = m; R.scene.add(m);
    });
    if (L.star != null) { const s = new T.Mesh(R.starG, R.goldM); s.position.set(L.star, 0.5, z); s.castShadow = true; R.scene.add(s); L.starMesh = s; }
    R.lanes.set(r, L);
    return L;
  }
  function dropLane(L) {
    if (L.mesh) { R.scene.remove(L.mesh); L.mesh.geometry.dispose(); }
    if (L.wmesh) R.scene.remove(L.wmesh);
    if (L.starMesh) R.scene.remove(L.starMesh);
    L.dyn.forEach((v) => R.scene.remove(v.mesh));
    R.lanes.delete(L.r);
  }
  function ensureLanes() {
    const lo = Math.floor(st.cam.r) - 13, hi = Math.ceil(st.cam.r) + 15;
    for (let r = st.genR; r <= hi; r++) { makeLane(r); st.genR = r + 1; }
    for (const [r, L] of R.lanes) if (r < lo) dropLane(L);
  }

  /* =====================================================================
     PARTIE
     ===================================================================== */
  function resetWorld(b0) {
    for (const L of [...R.lanes.values()]) dropLane(L);
    rng = MG.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    st = { state: st ? st.state : 'menu', b0, gen: { type: 'safe', left: 0, path: 0 }, genR: -12, cam: { r: 3.2, x: 0 },
      p: { r: 0, x: 0, y: 0, hop: null, queue: null, dir: 'up', face: 'dos', faceUntil: 0, sx: 1, sy: 1, sv: 0, syv: 0, ride: null, dead: null, deadT: 0, idle: 0, vx: 0, vr: 0, vy: 0 },
      t: 0, score: 0, stars: 0, started: false, prevBest: api.data.best || 0, recShown: false, msgAt: -9, nearAt: -9, honkAt: -9, shake: 0, biome: b0, finished: false };
    if (R) { R.milo.material.opacity = 1; R.ring.material.opacity = 0; }
    ensureLanes();
    setFog(true);
    updHud();
  }
  function setFog(now) { const c = BIOMES[biomeAt(Math.max(0, Math.round(st.p.r)))].fog; st.fogTo = c; if (now) { R.scene.fog.color.set(c); R.scene.background = new T.Color(c); } }

  function input(dir) {
    if (!st || st.state !== 'play' || st.p.dead) return;
    const p = st.p;
    if (p.hop) { p.queue = dir; return; }
    if (!st.started) { st.started = true; hideHint(); }
    p.idle = 0;
    const dr = dir === 'up' ? 1 : dir === 'down' ? -1 : 0, dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const tr = p.r + dr; const L = R.lanes.get(tr);
    p.dir = dir; p.face = dir === 'up' ? 'dos' : dir === 'down' ? 'face' : dir === 'left' ? 'g' : 'd';
    let tx = p.x + dx;
    const bump = () => { p.hop = { fx: p.x, fr: p.r, tx: p.x + dx * 0.25, tr: p.r + dr * 0.25, t: 0, dur: 0.16, bump: true }; MG.sfx.play('bonk'); };
    if (!L || tr < -3) return bump();
    if (L.type !== 'water') tx = Math.round(tx);
    if (Math.abs(tx) > COLS + (L.type === 'water' ? 0.6 : 0.01)) return bump();
    if (L.type === 'safe' && L.blocked.has(Math.round(tx))) return bump();
    p.hop = { fx: p.x, fr: p.r, tx, tr, t: 0, dur: 0.13, fy: p.y };
    p.ride = null; p.sx = 1.12; p.sy = 0.88; p.sv = 0; p.syv = 0;
    MG.sfx.play('hop');
  }
  function land() {
    const p = st.p, h = p.hop; p.hop = null;
    if (h.bump) { p.x = h.fx; p.r = h.fr; return nextQueued(); }
    p.x = h.tx; p.r = h.tr; p.sx = 1.2; p.sy = 0.82; p.sv = 0; p.syv = 0;
    const L = R.lanes.get(p.r);
    p.y = 0;
    if (L.type === 'water') {
      const f = L.dyn.find((v) => Math.abs(v.x - p.x) < v.len / 2 + 0.1);
      if (!f) return die('water');
      p.ride = f; p.y = f.top;
      if (f.kind === 'lily') p.x = f.x;
    } else if (L.type === 'road') p.y = -0.06;
    if (L.star != null && L.starMesh && Math.round(p.x) === L.star) collectStar(L);
    if (p.r > st.score) progress(p.r);
    nextQueued();
  }
  function nextQueued() { const q = st.p.queue; st.p.queue = null; if (q) input(q); }
  function progress(r) {
    const old = st.score; st.score = r; updHud(true);
    const bi = biomeAt(r);
    if (bi !== st.biome) {
      st.biome = bi; const B = BIOMES[bi]; setFog(false);
      const d = api.data; d.unlocked = d.unlocked || ['ville'];
      if (!d.unlocked.includes(B.id)) { d.unlocked.push(B.id); api.save(); msg('Nouvel univers : ' + B.name + ' !', 'gold'); MG.sfx.play('unlock'); try { api.fx.confetti(60); } catch (e) {} setFace('joie', 1.2); }
      else msg('Bienvenue ' + B.w + ' !');
    } else if (st.prevBest > 0 && r === st.prevBest + 1 && !st.recShown) { st.recShown = true; msg('Nouveau record !', 'gold'); MG.sfx.play('record'); setFace('joie', 1.2); try { api.fx.confetti(50); } catch (e) {} }
    else if (r % 25 === 0 && r > old) { msg(r % 100 === 0 ? 'Incroyable !' : r === 25 ? 'Bien joué !' : 'Continue comme ça !'); setFace('joie', 0.9); }
    if (r > (api.data.best || 0)) { api.data.best = r; api.data.bestAt = new Date().toISOString(); st.dirty = true; }
  }
  function collectStar(L) {
    R.scene.remove(L.starMesh); L.starMesh = null; L.star = null;
    st.stars++; updHud(); MG.sfx.play('star'); setFace('joie', 0.7);
    const [sx, sy] = toScreen(st.p.x, 0.6, -st.p.r); try { api.fx.burst(sx, sy, ['#ffd84d', '#fff3b3', '#ffffff'], 14, { shape: 'star', speed: 4, size: 9 }); } catch (e) {}
  }
  function setFace(k, dur) { st.p.over = k; st.p.faceUntil = st.t + dur; }
  function die(kind, v) {
    const p = st.p; if (p.dead) return;
    p.dead = kind; p.deadT = 0; p.hop = null; p.queue = null; p.ride = null; p.x = p.vx; p.dr = p.vr; p.dy = p.vy;
    const [sx, sy] = toScreen(p.x, 0.4, -p.dr);
    if (kind === 'car') { MG.sfx.play('crash'); st.shake = 1; try { api.fx.burst(sx, sy, ['#ffd84d', '#ffffff', '#b48cff'], 16, { shape: 'star', speed: 5, size: 10 }); } catch (e) {} msg(pick(['Aïe ! Regarde bien la route.', 'Attention aux voitures !']), 'warn'); }
    else if (kind === 'water' || kind === 'drift') { MG.sfx.play('splash'); R.ring.position.set(p.x, -0.2, -p.dr); R.ring.material.opacity = 0.9; R.ring.scale.set(1, 1, 1); try { api.fx.burst(sx, sy, ['#7cc8ff', '#ffffff', '#b9e6ff'], 18, { speed: 4.5, size: 8, up: 2.2, shape: 'dot' }); } catch (e) {} msg('Plouf ! Milo ne sait pas nager.', 'warn'); }
    else if (kind === 'late') { MG.sfx.play('over'); msg('Trop lent, le monde avance !', 'warn'); }
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
    finishRun(kind);
    setState('dead');
    setTimeout(() => { if (root && st && st.p.dead) showOver(); }, kind === 'late' ? 1100 : 1300);
  }
  function finishRun(kind) {
    if (st.finished || !st.started) return;
    st.finished = true;
    const d = api.data, s = d.stats || (d.stats = {}), now = new Date().toISOString();
    s.games = (s.games || 0) + 1; s.steps = (s.steps || 0) + st.score; s.stars = (s.stars || 0) + st.stars;
    s.deaths = s.deaths || {}; if (kind) s.deaths[kind] = (s.deaths[kind] || 0) + 1;
    if (st.score > (d.best || 0)) { d.best = st.score; d.bestAt = now; }
    d.last = st.score; d.lastPlayed = now; d.history = [{ s: st.score, stars: st.stars, b: BIOMES[st.b0].id, at: now }].concat(d.history || []).slice(0, 30);
    api.save(); st.dirty = false;
  }

  /* ---------- Boucle ---------- */
  const _p = { x: 0, y: 0, z: 0 };
  function toScreen(x, y, z) { if (!R) return [0, 0]; const v = new T.Vector3(x, y, z).project(R.cam); return [(v.x + 1) / 2 * R.w, (1 - v.y) / 2 * R.h]; }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = last ? (now - last) / 1000 : 0; last = now; if (dt > 0.05) dt = 0.05;
    if (!R || !st || st.state === 'paused') return;
    update(dt); R.renderer.render(R.scene, R.cam);
  }
  function update(dt) {
    st.t += dt;
    const p = st.p, playing = st.state === 'play';
    // objets mobiles
    for (const L of R.lanes.values()) {
      if (L.speed) { const vx = L.speed * L.dir * dt; for (const v of L.dyn) { v.x += vx; if (v.x > RING / 2) v.x -= RING; else if (v.x < -RING / 2) v.x += RING; v.mesh.position.x = v.x; } }
      if (L.type === 'water') for (const v of L.dyn) v.mesh.position.y = v.y + Math.sin(st.t * 2.2 + v.ph) * 0.025;
      if (L.starMesh) { L.starMesh.rotation.y += dt * 2.4; L.starMesh.position.y = 0.5 + Math.sin(st.t * 3 + L.r) * 0.06; }
    }
    R.water.ville.emissiveMap.offset.x = (st.t * 0.04) % 1;
    // Milo
    let mx = p.x, mr = p.r, my = p.y;
    if (!p.dead) {
      if (p.hop) {
        const h = p.hop; h.t += dt / h.dur; const k = Math.min(1, h.t), e = k * (2 - k);
        mx = h.fx + (h.tx - h.fx) * e; mr = h.fr + (h.tr - h.fr) * e;
        const toL = R.lanes.get(Math.round(h.tr)); const ty = h.bump ? p.y : toL ? (toL.type === 'road' ? -0.06 : toL.type === 'water' ? 0.05 : 0) : 0;
        my = (h.fy != null ? h.fy : p.y) + (ty - (h.fy != null ? h.fy : p.y)) * k + Math.sin(Math.PI * k) * (h.bump ? 0.16 : 0.42);
        if (k > 0.5 && p.sy < 1.05) { p.sx = 0.94; p.sy = 1.08; }
        if (h.t >= 1) { land(); mx = p.x; mr = p.r; my = p.y; }
      } else if (p.ride) {
        const L = R.lanes.get(p.r);
        if (L && L.speed) p.x += L.speed * L.dir * dt;
        mx = p.x; my = p.ride.top + Math.sin(st.t * 2.2 + p.ride.ph) * 0.025;
        if (Math.abs(p.x) > COLS + 0.9 && playing) die('drift');
      }
      // collisions route
      if (playing && !p.dead) {
        const cr = p.hop ? (p.hop.t > 0.5 ? p.hop.tr : p.hop.fr) : p.r, L = R.lanes.get(Math.round(cr));
        if (L && L.type === 'road') {
          for (const v of L.dyn) {
            const dx = Math.abs(v.x - mx);
            if (dx < v.len / 2 + 0.3) { die('car', v); break; }
            if (dx < v.len / 2 + 1.0 && !v.near) { v.near = true; if (st.t - st.nearAt > 3.5) { st.nearAt = st.t; setFace('alerte', 0.7); msg('Ouf, de justesse !'); MG.sfx.play('whoosh'); } }
            else if (dx > v.len / 2 + 2) v.near = false;
          }
          if (!p.dead && st.t - st.honkAt > 4) for (const v of L.dyn) { const ahead = (mx - v.x) * L.dir; if (ahead > v.len / 2 + 0.4 && ahead < v.len / 2 + 2.6) { st.honkAt = st.t; MG.sfx.play('honk'); break; } }
        }
      }
      if (playing && !p.hop) { p.idle += dt; }
    } else {
      p.deadT += dt; mx = p.x; mr = p.dr; my = p.dy;
      if (p.dead === 'car') { p.sx += (1.6 - p.sx) * Math.min(1, dt * 18); p.sy += (0.22 - p.sy) * Math.min(1, dt * 18); my = Math.min(p.dy, 0.02); }
      else if (p.dead === 'water' || p.dead === 'drift') { const L = R.lanes.get(Math.round(p.dr)); if (L && L.speed && p.dead === 'drift') p.x += L.speed * L.dir * dt * 0.5; my = p.dy - Math.min(1.2, p.deadT * 1.6); R.milo.material.opacity = Math.max(0, 1 - p.deadT * 1.4); R.ring.position.x = p.x; R.ring.scale.setScalar(1 + p.deadT * 3); R.ring.material.opacity = Math.max(0, 0.9 - p.deadT * 1.2); }
    }
    // ressort d'étirement (squash & stretch)
    if (!p.dead || p.dead === 'late') { p.sv += ((1 - p.sx) * 300 - p.sv * 17) * dt; p.sx += p.sv * dt; p.syv += ((1 - p.sy) * 300 - p.syv * 17) * dt; p.sy += p.syv * dt; }
    p.vx = mx; p.vr = mr; p.vy = my;
    // apparence de Milo
    let face = p.face;
    if (p.dead === 'car' || p.dead === 'late') face = 'ko'; else if (p.dead) face = 'alerte';
    else if (st.t < p.faceUntil && p.over) face = p.over;
    else if (st.state === 'menu' || (playing && p.idle > 2.2 && !p.hop)) face = 'face';
    if (R.milo.material.map !== R.tex[face]) { R.milo.material.map = R.tex[face]; R.milo.material.needsUpdate = true; }
    const H = MILO_W / Math.cos(PITCH);
    R.milo.position.set(mx, my + 0.02, -mr + 0.08); R.milo.scale.set(MILO_W * p.sx, H * p.sy, 1); R.milo.rotation.y = YAW;
    R.blob.position.set(mx, (p.ride ? p.ride.top : (R.lanes.get(Math.round(mr)) || {}).type === 'road' ? -0.05 : (R.lanes.get(Math.round(mr)) || {}).type === 'water' ? -0.2 : 0.01) + 0.01, -mr);
    const hh = Math.max(0, my - p.y); R.blob.scale.setScalar(Math.max(0.55, 1 - hh * 0.8)); R.blob.material.opacity = p.dead === 'water' || p.dead === 'drift' ? 0 : 0.9;
    // caméra
    const c = st.cam;
    if (playing && st.started && !p.dead) c.r += (0.24 + 0.5 * clamp(st.score / 160, 0, 1)) * dt;
    const want = mr + 3.2; if (want > c.r) c.r += (want - c.r) * Math.min(1, dt * 4.5);
    c.x += (mx * 0.7 - c.x) * Math.min(1, dt * 3);
    if (playing && !p.dead && st.started && mr < c.r - 10) die('late');
    let ox = 0, oy = 0; if (st.shake > 0) { st.shake = Math.max(0, st.shake - dt * 3); ox = (Math.random() - 0.5) * st.shake * 0.35; oy = (Math.random() - 0.5) * st.shake * 0.35; }
    const fx = c.x + ox, fz = -c.r + oy, D = 30;
    R.cam.position.set(fx + Math.sin(YAW) * Math.cos(PITCH) * D, Math.sin(PITCH) * D, fz + Math.cos(YAW) * Math.cos(PITCH) * D);
    R.cam.lookAt(fx, 0, fz);
    R.sun.position.set(fx - 7, 16, fz + 9); R.sun.target.position.set(fx, 0, fz - 1);
    if (st.fogTo) { const col = R.scene.fog.color; _c.set(st.fogTo); col.lerp(_c, Math.min(1, dt * 1.5)); R.scene.background.copy(col); }
    ensureLanes();
    if (st.dirty && st.t - (st.saveAt || 0) > 3) { st.saveAt = st.t; api.save(); st.dirty = false; }
  }

  /* ---------- Taille ---------- */
  function resize() {
    if (!R || !root) return;
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return;
    R.w = w; R.h = h; R.renderer.setSize(w, h, false);
    const aspect = w / h; let hw = VIEW_W / 2, hh = hw / aspect; if (aspect > 0.75) { hh = 7.5; hw = hh * aspect; }
    R.cam.left = -hw; R.cam.right = hw; R.cam.top = hh; R.cam.bottom = -hh; R.cam.updateProjectionMatrix();
  }

  /* =====================================================================
     INTERFACE
     ===================================================================== */
  const ICO = {
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    swipe: '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>'
  };
  const ic = (n, cls) => `<svg class="gi ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICO[n] || ''}</svg>`;
  const bic = (b) => `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true">${b.ico}</svg>`;
  function setState(s) { if (st) st.state = s; if (root) root.dataset.state = s; }
  function updHud(bump) {
    if (!UI.score || !st) return;
    UI.score.textContent = st.score; UI.stars.textContent = st.stars;
    UI.best.textContent = MG.fmt(Math.max(api.data.best || 0, st.score));
    if (bump) { UI.score.classList.remove('bump'); void UI.score.offsetWidth; UI.score.classList.add('bump'); }
  }
  function msg(text, kind) {
    if (!UI.msg) return;
    if (st.t - st.msgAt < 1 && st.msgKind === 'gold' && kind !== 'gold') return;
    st.msgAt = st.t; st.msgKind = kind || '';
    UI.msg.textContent = text; UI.msg.className = 'cx-msg ' + (kind || ''); void UI.msg.offsetWidth; UI.msg.classList.add('show');
  }
  function hideHint() { root && root.classList.add('moved'); }
  function unlocked() { const d = api.data; d.unlocked = d.unlocked || ['ville']; return d.unlocked; }
  function menuHTML() {
    const d = api.data, s = d.stats || {}, un = unlocked(), sel = BIOMES[st ? st.b0 : 0];
    const envs = BIOMES.map((b, i) => { const ok = un.includes(b.id); const prev = BIOMES[(i + BIOMES.length - 1) % BIOMES.length];
      return `<button class="cx-env ${ok ? '' : 'lock'} ${b === sel ? 'on' : ''}" data-env="${i}" ${ok ? '' : 'aria-disabled="true"'} style="--bg:${b.bg}"><span class="cx-envic">${ok ? bic(b) : MG.icon('lock')}</span><b>${b.name}</b><small>${ok ? (b === sel ? 'Choisi' : 'Débloqué') : 'Traverse ' + prev.name.toLowerCase()}</small></button>`; }).join('');
    return `<img class="cx-logo" src="${MG.asset('logo_cross.webp')}" alt="Milo Cross" draggable="false">
      <div class="cx-sheet">
        <div class="cx-h">${ic('map')}Choisis ton univers <span>${un.length} / ${BIOMES.length}</span></div>
        <div class="cx-envs gscroll">${envs}</div>
        <div class="cx-stats"><div><span>${MG.icon('crown')}Record</span><b>${MG.fmt(d.best || 0)}</b></div><div><span>Parties</span><b>${MG.fmt(s.games || 0)}</b></div><div><span>${ic('star')}Étoiles</span><b>${MG.fmt(s.stars || 0)}</b></div></div>
        <p class="cx-how">${ic('swipe')}<span>Glisse vers le haut ou touche pour avancer, sur les côtés pour te décaler, vers le bas pour reculer.</span></p>
        <button class="gbtn cx-go" data-cx="play" ${R ? '' : 'disabled'}>${MG.icon('play')}${R ? 'Jouer' : 'Chargement du monde 3D…'}</button>
      </div>`;
  }
  function showMenu() {
    setState('menu');
    UI.menu.innerHTML = menuHTML(); UI.menu.classList.add('show');
    root.classList.remove('moved');
  }
  function startPlay() {
    if (!R) return;
    UI.menu.classList.remove('show');
    resetWorld(st.b0);
    setState('play'); last = 0;
    msg('C\'est parti !');
  }
  function showOver() {
    const d = api.data, rec = st.score > st.prevBest && st.score > 0, B = BIOMES[biomeAt(st.score)];
    const cause = { car: 'Une voiture a surpris Milo.', water: 'Plouf ! Milo est tombé à l\'eau.', drift: 'Le courant a emporté Milo.', late: 'Trop lent : le monde avance sans toi.' }[st.p.dead] || '';
    const m = document.createElement('div'); m.className = 'gmodal cx-over';
    m.innerHTML = `<div class="gpanel"><img class="mas" src="${MG.asset(SPR[rec ? 'fete' : st.p.dead === 'car' || st.p.dead === 'late' ? 'ko' : 'alerte'])}" alt="">
      <h3>${rec ? (st.prevBest ? 'Nouveau record !' : 'Premier record !') : 'Partie terminée'}</h3><p>${rec && st.prevBest ? 'Ancien record : ' + MG.fmt(st.prevBest) + '. ' : ''}${cause}</p>
      <div class="cx-sc"><div><span>Pas</span><b>${MG.fmt(st.score)}</b></div><div class="${rec ? 'hot' : ''}"><span>${MG.icon('crown')}Record</span><b>${MG.fmt(d.best || 0)}</b></div><div><span>${ic('star')}Étoiles</span><b>${st.stars}</b></div></div>
      <p class="cx-reach">${bic(B)}Univers atteint : <b>${B.name}</b></p>
      <div class="acts"><button class="gbtn" data-cx="again">${MG.icon('redo')}Rejouer</button><button class="gbtn light" data-cx="menu">Changer d'univers</button><button class="gbtn light" data-cx="quit">Retour aux jeux</button></div></div>`;
    root.appendChild(m);
    setState('over');
    if (rec) { try { api.fx.confetti(110); } catch (e) {} MG.sfx.play('record'); }
  }
  function pause() { if (st && st.state === 'play' && !st.p.dead) { setState('paused'); if (st.dirty) { api.save(); st.dirty = false; } } }
  function resume() { if (st && st.state === 'paused') { setState('play'); last = 0; } }

  /* ---------- Gestes ---------- */
  let ptr = null;
  function onDown(e) {
    if (e.button > 0 || e.target.closest('button, .cx-menu, .gmodal')) return;
    if (st && st.state === 'paused') { resume(); return; }
    if (!st || st.state !== 'play') return;
    if (e.cancelable) e.preventDefault();
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false };
  }
  function swipeDir(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
  function onMove(e) {
    if (!ptr || ptr.done || e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (dx * dx + dy * dy > 26 * 26) { ptr.done = true; input(swipeDir(dx, dy)); }
  }
  function onUp(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (!ptr.done) { if (dx * dx + dy * dy < 14 * 14) input('up'); else input(swipeDir(dx, dy)); }
    ptr = null;
  }
  function onKey(e) {
    if (!root || e.repeat || e.metaKey || e.ctrlKey) return;
    const k = { ArrowUp: 'up', KeyW: 'up', Space: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }[e.code];
    if (st && st.state === 'menu' && (e.code === 'Enter' || e.code === 'Space') && R) { e.preventDefault(); startPlay(); return; }
    if (k && st && st.state === 'play') { e.preventDefault(); input(k); }
    else if (e.code === 'KeyP') st && st.state === 'play' ? pause() : resume();
  }
  function onClick(e) {
    const env = e.target.closest('[data-env]');
    if (env) { const i = +env.dataset.env; if (!unlocked().includes(BIOMES[i].id)) { MG.sfx.play('invalid'); env.classList.remove('nope'); void env.offsetWidth; env.classList.add('nope'); return; } api.data.biome = BIOMES[i].id; api.save(); MG.sfx.play('tap'); if (R) { resetWorld(i); } else st.b0 = i; UI.menu.innerHTML = menuHTML(); return; }
    const b = e.target.closest('[data-cx]'); if (!b) return;
    const a = b.dataset.cx;
    if (a === 'play') { MG.sfx.play('tap'); startPlay(); }
    else if (a === 'pause') pause();
    else if (a === 'resume') resume();
    else if (a === 'quit') api.close();
    else if (a === 'again') { const m = root.querySelector('.cx-over'); m && m.remove(); startPlay(); }
    else if (a === 'menu') { const m = root.querySelector('.cx-over'); m && m.remove(); resetWorld(st.b0); showMenu(); }
  }
  function onVis() { if (document.hidden) pause(); }

  /* ---------- Module ---------- */
  MG.register({
    id: 'cross', name: 'Milo Cross', logo: 'logo_cross.webp', theme: 'cross',
    mount(frame, a) {
      api = a; api.data.stats = api.data.stats || {}; unlocked();
      const bIdx = Math.max(0, BIOMES.findIndex((b) => b.id === api.data.biome && unlocked().includes(b.id)));
      st = null;
      root = document.createElement('div'); root.className = 'cx-root'; root.dataset.state = 'menu';
      root.innerHTML = `<canvas class="cx-cv" aria-label="Milo Cross"></canvas>
        <div class="cx-hud"><div class="cx-chip">${MG.icon('crown')}<b id="cxBest">0</b></div><div class="cx-chip st">${ic('star')}<b id="cxStars">0</b></div><div class="grow"></div>${MG.soundBtn()}<button class="gclose cx-pause" data-cx="pause" aria-label="Pause">${MG.icon('pause')}</button><button class="gclose" data-cx="quit" aria-label="Quitter">${MG.icon('x')}</button></div>
        <div class="cx-score">0</div><div class="cx-msg"></div>
        <div class="cx-hint">${ic('swipe')}Glisse ou touche pour avancer</div>
        <div class="cx-menu"></div>
        <div class="cx-pauseov"><h3>Pause</h3><p>Touche l'écran pour reprendre.</p><div class="cx-pacts"><button class="gbtn" data-cx="resume">${MG.icon('play')}Reprendre</button><button class="gbtn light" data-cx="quit">Quitter la partie</button></div></div>`;
      frame.insertBefore(root, frame.firstChild);
      UI = { score: root.querySelector('.cx-score'), stars: root.querySelector('#cxStars'), best: root.querySelector('#cxBest'), msg: root.querySelector('.cx-msg'), menu: root.querySelector('.cx-menu'), cv: root.querySelector('.cx-cv') };
      UI.best.textContent = MG.fmt(api.data.best || 0);
      st = { b0: bIdx, state: 'menu', t: 0, msgAt: -9, p: {} };
      showMenu();
      root.addEventListener('pointerdown', onDown); root.addEventListener('pointermove', onMove); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', () => (ptr = null));
      root.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVis);
      const mountedRoot = root;
      loadThree().then(() => {
        if (root !== mountedRoot) return;
        try { R = initWorld(UI.cv); } catch (err) { UI.menu.querySelector('.cx-go').textContent = 'La 3D n\'est pas disponible sur cet appareil.'; return; }
        resize(); resetWorld(bIdx); setState('menu');
        UI.menu.innerHTML = menuHTML();
        try { ro = new ResizeObserver(() => { clearTimeout(rTimer); rTimer = setTimeout(resize, 60); }); ro.observe(root); } catch (e) {}
        last = 0; raf = requestAnimationFrame(loop);
      }).catch(() => { if (root === mountedRoot) { const b = UI.menu.querySelector('.cx-go'); if (b) b.textContent = 'Impossible de charger la 3D. Vérifie ta connexion.'; } });
    },
    unmount() {
      cancelAnimationFrame(raf); clearTimeout(rTimer);
      try { ro && ro.disconnect(); } catch (e) {} ro = null;
      document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
      if (st && st.state === 'play' && st.started && !st.finished) finishRun('quit'); else if (st && st.dirty) api.save();
      if (R) { for (const L of [...R.lanes.values()]) dropLane(L); Object.values(R.tex).forEach((t) => t.dispose()); R.renderer.dispose(); try { R.renderer.forceContextLoss(); } catch (e) {} R = null; }
      root = null; st = null; UI = {};
    },
    card(d) {
      const s = d.stats || {}, un = (d.unlocked || ['ville']).length;
      return { desc: 'Guide Milo à travers routes, rivières et univers. Glisse pour avancer, évite les voitures et ne tombe pas à l\'eau.',
        art: `<img class="cx-cmilo" src="${MG.asset(SPR.d)}" alt="" draggable="false">`,
        stats: [['Record', MG.fmt(d.best || 0), 'crown'], ['Parties', MG.fmt(s.games || 0), 'pad'], ['Étoiles', MG.fmt(s.stars || 0), 'star']],
        progress: un / BIOMES.length, progressLabel: `Univers débloqués : ${un} / ${BIOMES.length}`, cta: d.best ? 'Battre mon record' : 'Traverser avec Milo' };
    },
    homeLine(d) { return `Milo Cross record ${MG.fmt(d.best || 0)}`; },
    _debug: { state: () => st, R: () => R, input: (d) => input(d), BIOMES, lane: (r) => R && R.lanes.get(r), toScreen: (x, y, z) => toScreen(x, y, z) }
  });

  /* ---------- Styles ---------- */
  const css = `
  .gscreen.cross{background:linear-gradient(180deg,#e6e2fb,#d9d3f6)}
  .cx-root{position:absolute;inset:0;overflow:hidden;z-index:1;touch-action:none;-webkit-tap-highlight-color:transparent}
  .cx-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
  .cx-hud{position:absolute;left:0;right:0;top:0;z-index:6;display:flex;align-items:center;gap:8px;padding:12px 14px 6px;pointer-events:none}
  .cx-hud button{pointer-events:auto}
  .cx-root .gclose{background:rgba(255,255,255,.8);color:#5a33d6;box-shadow:0 4px 12px rgba(60,40,150,.16)}
  .cx-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px 6px 9px;border-radius:22px;background:rgba(255,255,255,.85);color:#5530d4;font-weight:900;font-size:16px;box-shadow:0 4px 14px rgba(60,40,150,.16);font-variant-numeric:tabular-nums}
  .cx-chip .gi{width:20px;height:20px;fill:#ffcf3a;stroke:#e19c00;stroke-width:1.6}
  .cx-root:not([data-state=play]) .cx-pause{display:none}
  .cx-root[data-state=menu] .cx-hud .cx-chip,.cx-root[data-state=menu] .cx-score{opacity:0}
  .cx-score{position:absolute;left:0;right:0;top:58px;z-index:4;text-align:center;font-size:60px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:1;-webkit-text-stroke:3px #5a2fd0;paint-order:stroke fill;text-shadow:0 5px 0 #4420a8,0 10px 20px rgba(40,10,110,.3);font-variant-numeric:tabular-nums;pointer-events:none;transition:opacity .25s}
  .cx-score.bump{animation:cxbump .3s cubic-bezier(.34,1.7,.5,1)}
  @keyframes cxbump{40%{transform:scale(1.22)}}
  .cx-msg{position:absolute;left:50%;top:20%;z-index:4;transform:translateX(-50%);white-space:nowrap;font-size:24px;font-weight:900;color:#fff;-webkit-text-stroke:2.5px #6a2fd8;paint-order:stroke fill;text-shadow:0 4px 0 #4a1fa8,0 8px 16px rgba(40,10,110,.35);opacity:0;pointer-events:none}
  .cx-msg.show{animation:cxmsg 1.6s cubic-bezier(.3,1.4,.5,1) forwards}
  .cx-msg.gold{color:#ffe066;-webkit-text-stroke-color:#b25f00;text-shadow:0 4px 0 #8a4600,0 8px 18px rgba(120,60,0,.35);font-size:27px}
  .cx-msg.warn{color:#fff3c4;-webkit-text-stroke-color:#e0560f;text-shadow:0 4px 0 #a93c0b}
  @keyframes cxmsg{0%{opacity:0;transform:translate(-50%,12px) scale(.55)}12%{opacity:1;transform:translate(-50%,0) scale(1.08)}22%{transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-14px)}}
  .cx-hint{position:absolute;left:50%;bottom:max(34px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:4;display:none;align-items:center;gap:8px;padding:10px 16px;border-radius:24px;background:rgba(255,255,255,.9);color:#5530d4;font-weight:900;font-size:15px;white-space:nowrap;box-shadow:0 8px 20px rgba(60,40,150,.2);pointer-events:none;animation:cxhint 1.4s ease-in-out infinite}
  .cx-hint .gi{width:20px;height:20px}
  .cx-root[data-state=play]:not(.moved) .cx-hint{display:inline-flex}
  @keyframes cxhint{50%{transform:translateX(-50%) translateY(-5px)}}
  .cx-menu{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:58px 14px max(14px,env(safe-area-inset-bottom,0px));pointer-events:none;opacity:0;transition:opacity .3s}
  .cx-menu.show{opacity:1}.cx-menu.show>*{pointer-events:auto}
  .cx-logo{width:min(56%,230px);height:auto;filter:drop-shadow(0 12px 18px rgba(40,20,120,.3));animation:cxlogo 3.4s ease-in-out infinite}
  @keyframes cxlogo{50%{transform:translateY(-6px) rotate(-1deg)}}
  .cx-sheet{width:min(100%,420px);border-radius:28px;background:rgba(255,255,255,.96);padding:16px 14px 14px;box-shadow:0 20px 50px rgba(50,30,140,.28);animation:gpop .5s cubic-bezier(.34,1.6,.5,1) both}
  .cx-h{display:flex;align-items:center;gap:7px;font-weight:900;font-size:16px;color:#2a1f6b;margin:0 4px 10px}
  .cx-h .gi{width:18px;height:18px;color:#7347ee}.cx-h span{margin-left:auto;font-size:12px;color:var(--muted);font-weight:800}
  .cx-envs{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;scroll-snap-type:x mandatory;scrollbar-width:none;touch-action:pan-x}
  .cx-envs::-webkit-scrollbar{display:none}
  .cx-env{flex:none;width:92px;scroll-snap-align:start;border:0;border-radius:20px;padding:10px 6px 9px;background:var(--bg);display:flex;flex-direction:column;align-items:center;gap:4px;color:#2a1f6b;box-shadow:inset 0 0 0 2px rgba(255,255,255,.6),0 4px 10px rgba(60,40,150,.12);transition:transform .2s}
  .cx-env.on{box-shadow:inset 0 0 0 3px #fff,0 0 0 3px #7347ee,0 8px 18px rgba(115,71,238,.35);transform:translateY(-2px)}
  .cx-env b{font-size:13px;font-weight:900}.cx-env small{font-size:10.5px;font-weight:800;opacity:.8;line-height:1.15;text-align:center}
  .cx-envic{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.75)}
  .cx-envic .gi{width:22px;height:22px;color:#5530d4}
  .cx-env.lock{filter:grayscale(.85);opacity:.7}
  .cx-env.nope{animation:cxnope .35s}
  @keyframes cxnope{25%{transform:translateX(-5px)}50%{transform:translateX(5px)}75%{transform:translateX(-3px)}}
  .cx-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0 10px}
  .cx-stats div{background:#f6f2ff;border-radius:16px;padding:8px 6px;text-align:center}
  .cx-stats span{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:800;color:var(--muted)}
  .cx-stats span .gi{width:12px;height:12px;fill:#ffcf3a;stroke:#e19c00}
  .cx-stats b{display:block;font-size:20px;font-weight:900;color:#4b2ab8}
  .cx-how{display:flex;align-items:center;gap:10px;margin:0 2px 12px;font-size:12.5px;font-weight:800;color:#5c5486;line-height:1.35}
  .cx-how .gi{width:26px;height:26px;flex:none;color:#7347ee}
  .cx-go{width:100%}.cx-go[disabled]{opacity:.7}
  .cx-pauseov{position:absolute;inset:0;z-index:7;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;background:rgba(30,16,90,.38);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);color:#fff;text-align:center}
  .cx-root[data-state=paused] .cx-pauseov{display:flex}
  .cx-pauseov h3{font-size:40px;font-weight:900;margin:0;-webkit-text-stroke:2.5px #5a2fd0;paint-order:stroke fill;text-shadow:0 4px 0 #4420a8}
  .cx-pauseov p{margin:0 0 14px;font-weight:800}
  .cx-pacts{display:flex;flex-direction:column;gap:10px;width:min(100%,280px)}
  .cx-over .mas{width:124px;height:124px}
  .cx-sc{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 8px}
  .cx-sc div{background:#f4efff;border-radius:16px;padding:8px 4px}.cx-sc div.hot{background:linear-gradient(160deg,#fff6cf,#ffe7a0)}
  .cx-sc span{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:800;color:var(--muted)}
  .cx-sc span .gi{width:12px;height:12px;fill:#ffcf3a;stroke:#e19c00}
  .cx-sc b{display:block;font-size:26px;font-weight:900;color:#5530d4;font-variant-numeric:tabular-nums}
  .cx-reach{display:flex;align-items:center;justify-content:center;gap:6px;font-weight:800}.cx-reach .gi{width:18px;height:18px;color:#7347ee}
  .cx-over .acts{gap:8px}
  .gcard.cross .gcard-art{background:radial-gradient(circle at 80% 18%,rgba(255,255,255,.8),transparent 35%),linear-gradient(180deg,#bfe0ff 0%,#d8ccff 55%,#a3e0a0 56%,#8fd38c 100%)}
  .gcard.cross .gcard-art:after{content:"";position:absolute;left:0;right:0;bottom:22px;height:30px;background:repeating-linear-gradient(90deg,#fff 0 22px,transparent 22px 40px) center/100% 4px no-repeat,#6d6a8c;opacity:.95}
  .gcard.cross .gcard-art img{position:relative;z-index:1}
  .gcard.cross .gcard-art img:not(.cx-cmilo){margin-left:28%}
  .gcard.cross .gcard-art img.cx-cmilo{position:absolute;left:6%;bottom:30px;width:96px;height:auto;max-width:none;z-index:2;filter:drop-shadow(0 8px 10px rgba(40,20,120,.3));animation:cxcard 1.1s ease-in-out infinite}
  @keyframes cxcard{0%,100%{transform:translateY(0) scale(1,1)}40%{transform:translateY(-14px) scale(.95,1.06)}55%{transform:translateY(0) scale(1.08,.92)}}
  @media (prefers-reduced-motion:reduce){.cx-logo,.cx-hint,.gcard.cross .gcard-art img.cx-cmilo{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
