/* =====================================================================
   Milo Maze — arcade verticale : Milo glisse jusqu'au prochain mur
   - Moteur par cases (logique) + rendu continu (accélération, impact)
   - Environnement pixel art néon pré-rendu par blocs, Milo en sprites 3D
   - Pièges temporisés, lasers, scies, patrouilles, poursuivants, portails…
   - 4 mondes × 6 niveaux (games/maze-levels.js), 18 personnages, boutique,
     musique synthétisée par monde, sauvegarde via api.data
   Personnages : assets/games/maze/mk_<id>.webp = planche 192 px [repos, n images de course, victoire]
                 assets/games/maze/mp_<id>.webp = portrait 320 px (cartes, menus)
   (toujours un NOUVEAU nom de fichier si on remplace une image : cache iPhone d'un an)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames;
  if (!MG) return;
  const LV = window.MILO_MAZE_LEVELS || [];

  /* =====================================================================
     DONNÉES
     ===================================================================== */
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const BOOSTDIR = { '^': 0, '>': 1, 'v': 2, '<': 3 };
  // 12 mondes (games/maze-worlds.js) ; leurs niveaux viennent de games/maze-levels.js (mondes d'origine) ou de w.levels
  const WORLDS = window.MILO_MAZE_WORLDS || [];
  const TIERS = window.MILO_MAZE_TIERS || {};
  const EXTRA = window.MILO_MAZE_EXTRA || {}; // niveaux V2 (games/maze-levels-v2.js)
  const LEGACY_N = WORLDS.map((w) => { const src = w.legacy && LV.find((x) => x.id === w.legacy); return src ? src.levels.length : 0; });
  const CONTENT = WORLDS.map((w) => { const src = w.legacy && LV.find((x) => x.id === w.legacy); return (src ? src.levels : w.levels || []).concat((EXTRA[w.id] || {}).main || []); });
  const CHAL = WORLDS.map((w) => (EXTRA[w.id] || {}).defis || []);
  const SECRET = WORLDS.map((w) => (EXTRA[w.id] || {}).secret || null);
  const wIdx = (id) => WORLDS.findIndex((w) => w.id === id);
  const hasContent = (wi) => !!(CONTENT[wi] && CONTENT[wi].length);
  const STATES = ['idle', 'prep', 'run', 'accel', 'jump', 'collect', 'shield', 'teleport', 'hurt', 'win', 'fail'];
  const ST = {}; STATES.forEach((s, i) => (ST[s] = i));
  // n = nombre d'images de course dans la planche ; rar = rareté affichée en boutique
  const RAR = { c: 'Commun', r: 'Rare', e: 'Épique', l: 'Légendaire' };
  const SKINS = [
    { id: 'classic', name: 'Classique', desc: 'Le Milo d’origine, lanterne à la main', price: 0, rar: 'c', n: 7, trail: { a: '#e9dcff', b: '#a77cff', p: '#ffffff', kind: 'spark' } },
    { id: 'pastel', name: 'Pastel', desc: 'Douceur lavande et boucle cristal', price: 300, rar: 'c', n: 7, trail: { a: '#f1e6ff', b: '#c08bff', p: '#ffe9a8', kind: 'spark' } },
    { id: 'neon', name: 'Néon', desc: 'Contours bleu électrique', price: 350, world: 'ruines', rar: 'c', n: 8, trail: { a: '#7af6ff', b: '#a855f7', p: '#5ef2ff', kind: 'bolt' } },
    { id: 'aurora', name: 'Aurore', desc: 'Une aurore boréale sur la tête', price: 450, rar: 'c', n: 7, trail: { a: '#8ff7e0', b: '#6a5cff', p: '#c9fff4', kind: 'spark' } },
    { id: 'glacier', name: 'Glacier', desc: 'Taillé dans la glace', price: 600, world: 'cyber', rar: 'r', n: 8, trail: { a: '#e3f6ff', b: '#6cc6ff', p: '#ffffff', kind: 'snow' } },
    { id: 'polar', name: 'Polaire', desc: 'Lunettes de ski et doudoune', price: 700, rar: 'r', n: 7, trail: { a: '#eaf6ff', b: '#5aa8ff', p: '#ffffff', kind: 'snow' } },
    { id: 'pumpkin', name: 'Citrouille', desc: 'La citrouille la plus mignonne', price: 750, rar: 'r', n: 7, trail: { a: '#ffc46b', b: '#ff7a1a', p: '#b06cff', kind: 'ember' } },
    { id: 'cyber', name: 'Cyber', desc: 'Casque à cœur et veste lumineuse', price: 850, rar: 'r', n: 6, trail: { a: '#ff8fd8', b: '#35e0ff', p: '#ffffff', kind: 'bolt' } },
    { id: 'galaxy', name: 'Galaxie', desc: 'Violet cosmique et anneau planétaire', price: 900, world: 'cosmos', rar: 'r', n: 8, trail: { a: '#e8b8ff', b: '#7b2cff', p: '#fff3b0', kind: 'star' } },
    { id: 'explorer', name: 'Explorateur', desc: 'Chapeau, boussole et lanterne', price: 1100, rar: 'e', n: 7, trail: { a: '#ffe1a1', b: '#c2873f', p: '#ffd36b', kind: 'ember' } },
    { id: 'ninja', name: 'Ninja', desc: 'Bandeau, sabre et écharpe rouge', price: 1200, stars: 24, rar: 'e', n: 7, trail: { a: '#ff6b6b', b: '#5a2a6a', p: '#ffffff', kind: 'spark' } },
    { id: 'wizard', name: 'Sorcier', desc: 'Chapeau étoilé et bâton magique', price: 1250, rar: 'e', n: 7, trail: { a: '#e7b8ff', b: '#8a3cff', p: '#ffe066', kind: 'star' } },
    { id: 'sun', name: 'Soleil', desc: 'Chemise à fleurs et lunettes de soleil', price: 1300, world: 'sables', rar: 'e', n: 8, trail: { a: '#fff1a8', b: '#ff8a1f', p: '#ffd84d', kind: 'ember' } },
    { id: 'party', name: 'Fête', desc: 'Casque DJ et lunettes à LED', price: 1400, rar: 'e', n: 7, trail: { a: '#ff7ae0', b: '#5ef2ff', p: '#ffe066', kind: 'star' } },
    { id: 'samurai', name: 'Samouraï', desc: 'Armure rouge et casque doré', price: 1800, stars: 64, rar: 'l', n: 7, trail: { a: '#ffd166', b: '#e0283b', p: '#ffffff', kind: 'ember' } },
    { id: 'astro', name: 'Astronaute', desc: 'Combinaison spatiale et réacteur', price: 2000, stars: 40, rar: 'l', n: 7, trail: { a: '#bfe8ff', b: '#7b6cff', p: '#ffffff', kind: 'star' } },
    { id: 'prism', name: 'Prisme', desc: 'Reflets holographiques', price: 2000, stars: 54, rar: 'l', n: 7, trail: { a: '#ffffff', b: '#ff7ae0', p: '#ffffff', kind: 'rainbow' } },
    { id: 'vice', name: 'Miami', desc: 'Chemise palmiers et lunettes miroir', price: 2400, stars: 72, rar: 'l', n: 4, trail: { a: '#ff8ad8', b: '#ff9a3c', p: '#ffe066', kind: 'spark' } }
  ];
  const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
  const BONUS = {
    B: { id: 'shield', name: 'Bouclier', icon: 4, color: '#5ec8ff', desc: 'Te protège d’un coup' },
    M: { id: 'magnet', name: 'Aimant', icon: 2, color: '#ff5e7a', dur: 8, desc: 'Attire les pièces proches' },
    V: { id: 'speed', name: 'Vitesse', icon: 3, color: '#38e0ff', dur: 6, desc: 'Tu fonces encore plus vite' },
    R: { id: 'slow', name: 'Ralenti', icon: -1, color: '#9b8cff', dur: 7, desc: 'Ralentit ennemis et pièges' },
    T: { id: 'tele', name: 'Téléport', icon: 5, color: '#e05cff', desc: 'Traverse le prochain mur' }
  };
  const UPGRADES = [
    { id: 'dur', name: 'Bonus prolongés', desc: '+20 % de durée pour l’aimant, la vitesse et le ralenti', max: 3, price: [200, 400, 700] },
    { id: 'magStart', name: 'Aimant de départ', desc: 'Chaque niveau commence avec 4 s d’aimant', max: 1, price: [500] },
    { id: 'shields', name: 'Boucliers de secours ×3', desc: 'Un bouclier offert au début de 3 niveaux', max: 99, price: [250], stack: 3 }
  ];
  const V0 = 9, VMAX = 19, ACC_T = 0.12, R_MILO = 0.3, CHEST_COINS = 20, BOSS_COINS = 150, FINAL_COINS = 400;
  // murs du néant : d (magenta, rond) · f (cyan, triangle) · h (jaune, carré) — la couleur active bloque, elle change à chaque arrêt
  const VOIDC = 'dfh', VCOL = { d: '#ff3df0', f: '#5ee7ff', h: '#ffd84d' };
  const TIMED = { x: { per: 2.6, on: 1.05, warn: 0.4 }, z: { per: 2.3, on: 0.9, warn: 0.35 }, k: { per: 3.1, on: 1.4, warn: 0.5 }, i: { per: 2.8, on: 1.1, warn: 0.45 }, j: { per: 3.6, on: 1.0, warn: 0.85 }, e: { per: 2.4, on: 0.5, warn: 0.6 } };
  const DOOR = { per: 3.4, open: 2.0 };

  /* =====================================================================
     OUTILS
     ===================================================================== */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const fmtT = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const IC = {
    back: '<path d="m15 18-6-6 6-6"/>', map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>', skins: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
    shop: '<path d="M4 7h16l-1.5 12a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>', coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
    swipe: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" opacity=".35"/>', check: '<path d="M20 6 9 17l-5-5"/>', gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/>', key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/>', heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>', relic: '<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="9.5" ry="3.5"/>', chest: '<path d="M4 10h16v9H4zM4 10a8 5 0 0 1 16 0"/><path d="M11 13h2"/>', trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', next: '<path d="m9 18 6-6-6-6"/>'
  };
  IC.flag = '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>';
  IC.prism = '<path d="M12 4l8 15H4z"/><path d="M12 4l1.5 15"/><path d="M3 7l2 1.5M21 7l-2 1.5"/>';
  IC.lava = '<path d="M12 3c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3-1-3 0-5 0-7z"/>';
  const ico = (n, c) => IC[n] ? `<svg class="gi ${c || ''}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>` : MG.icon(n, c);
  // clé PERMANENTE d'un niveau : "idDuMonde:index" (ex. "ruines:3")
  const lvKey = (wi, li) => WORLDS[wi].id + ':' + li;
  // li : numéro (niveau principal), 'd0'..'d2' (défis) ou 's' (niveau secret)
  const levelAt = (wi, li) => (typeof li === 'number' ? CONTENT[wi] && CONTENT[wi][li] : li === 's' ? SECRET[wi] : li && li[0] === 'd' ? CHAL[wi][+li.slice(1)] : null);
  const lvLabel = (wi, li) => { const L = levelAt(wi, li); return typeof li === 'number' ? (L && L.boss ? 'Boss' : `Niveau ${li + 1}`) : li === 's' ? 'Niveau secret' : `Défi ${+li.slice(1) + 1}`; };
  const col = (wi) => { const d = data(), id = WORLDS[wi].id; d.col = d.col || {}; return d.col[id] || (d.col[id] = {}); };
  // Sauvegarde v1 ("numéroDuMonde-niveau") → v2 ("id:niveau"), sans rien perdre.
  // Idempotente : si un ancien appareil réécrit l'ancien format, ses résultats sont refusionnés (meilleurs scores gardés).
  // Copie de secours de la v1 conservée dans d.bak.v1.
  function migrate(d) {
    if (!d) return d; const lv = d.lv || (d.lv = {}), old = Object.keys(lv).filter((k) => /^\d+-\d+$/.test(k));
    if (old.length) {
      d.bak = d.bak || {};
      if (!d.bak.v1) { d.bak.v1 = { at: Date.now(), lv: {} }; old.forEach((k) => (d.bak.v1.lv[k] = Object.assign({}, lv[k]))); }
      old.forEach((k) => {
        const [w, l] = k.split('-').map(Number), W = WORLDS.find((x) => x.oldIdx === w); if (!W) return;
        const nk = W.id + ':' + l, a = lv[nk] || {}, b = lv[k] || {};
        lv[nk] = { stars: Math.max(a.stars || 0, b.stars || 0), best: Math.max(a.best || 0, b.best || 0), time: a.time && b.time ? Math.min(a.time, b.time) : a.time || b.time || 0, done: (a.done || 0) + (b.done || 0) };
        delete lv[k];
      });
    }
    if (typeof d.last === 'string' && /^\d+-\d+$/.test(d.last)) { const [w, l] = d.last.split('-').map(Number), W = WORLDS.find((x) => x.oldIdx === w); d.last = W ? W.id + ':' + l : null; }
    d.v = 2; return d;
  }

  /* =====================================================================
     ÉTAT
     ===================================================================== */
  let api = null, root = null, cv = null, ctx = null, raf = 0, last = 0, ro = null, rTimer = 0;
  let G = null; // partie en cours
  const UI = { screen: 'home', cs: 32, dpr: 1, ox: 0, vw: 0, vh: 0, chunks: [], chunkWorld: -1, imgs: {}, pix: {}, hudEls: {}, ptr: null, skinTimer: 0, scoreRaf: 0, lowfx: false };
  const data = () => api.data;
  const settings = () => { const d = data(); d.set = Object.assign({ music: 0.55, sfx: 0.85, vib: true, lowfx: false, hints: true }, d.set || {}); return d.set; };

  /* =====================================================================
     AUDIO (synthèse : sons + musique par monde)
     ===================================================================== */
  const AU = { ac: null, music: null, sfx: null, noise: null };
  function audio() {
    const ac = MG.sfx.ctx(); if (!ac) return null;
    if (AU.ac !== ac) { AU.ac = ac; AU.music = ac.createGain(); AU.sfx = ac.createGain(); AU.music.connect(MG.sfx.out()); AU.sfx.connect(MG.sfx.out()); AU.noise = null; }
    applyVolumes(); return ac;
  }
  function applyVolumes() { if (!AU.ac) return; const s = settings(), m = MG.sfx.muted ? 0 : 1; AU.music.gain.value = s.music * 0.55 * m; AU.sfx.gain.value = s.sfx * 1.0 * m; }
  function tone(f, o) {
    const ac = AU.ac; if (!ac) return; const t0 = ac.currentTime + (o.t || 0), d = o.d || 0.12, osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t0); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.v || 0.1, t0 + (o.a || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g); g.connect(o.dest || AU.sfx); osc.start(t0); osc.stop(t0 + d + 0.03);
  }
  function noise(o) {
    const ac = AU.ac; if (!ac) return; const t0 = ac.currentTime + (o.t || 0), d = o.d || 0.2;
    if (!AU.noise) { const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; AU.noise = b; }
    const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = AU.noise; fl.type = o.type || 'lowpass'; fl.Q.value = o.q || 0.8; fl.frequency.setValueAtTime(o.f || 1500, t0); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.v || 0.08, t0 + (o.a || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    src.connect(fl); fl.connect(g); g.connect(o.dest || AU.sfx); src.start(t0, Math.random() * 0.5); src.stop(t0 + d + 0.05);
  }
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const SFX = {
    whoosh: () => noise({ d: 0.18, v: 0.035, f: 900, f2: 3200, type: 'bandpass', q: 1.4 }),
    bump: (k) => { tone(150, { f2: 90, d: 0.09, v: 0.07 * k, type: 'triangle' }); noise({ d: 0.06, v: 0.03 * k, f: 1200, f2: 300 }); },
    coin: (n) => { const f = midi(84 + Math.min(12, n)); tone(f, { d: 0.07, v: 0.045, type: 'square' }); tone(f * 1.5, { t: 0.035, d: 0.09, v: 0.03, type: 'square' }); },
    bonus: () => [0, 4, 7, 12].forEach((s, i) => tone(midi(76 + s), { t: i * 0.05, d: 0.18, v: 0.05, type: 'triangle' })),
    tele: () => { tone(300, { f2: 1600, d: 0.22, v: 0.06, type: 'sawtooth' }); noise({ d: 0.25, v: 0.04, f: 3000, f2: 600, type: 'bandpass', q: 3 }); },
    portal: () => { tone(900, { f2: 250, d: 0.18, v: 0.05, type: 'triangle' }); tone(260, { t: 0.12, f2: 1200, d: 0.2, v: 0.04, type: 'triangle' }); },
    boost: () => tone(420, { f2: 1100, d: 0.12, v: 0.05, type: 'square' }),
    shieldHit: () => { noise({ d: 0.3, v: 0.07, f: 5000, f2: 1200, type: 'highpass' }); tone(880, { f2: 300, d: 0.25, v: 0.05, type: 'triangle' }); },
    hit: () => { noise({ d: 0.35, v: 0.12, f: 1600, f2: 120 }); tone(220, { f2: 55, d: 0.4, v: 0.12, type: 'sawtooth' }); },
    fail: () => [7, 3, 0, -5].forEach((s, i) => tone(midi(62 + s), { t: 0.25 + i * 0.16, d: 0.3, v: 0.05, type: 'triangle' })),
    win: () => { [0, 4, 7, 12, 16].forEach((s, i) => tone(midi(72 + s), { t: i * 0.08, d: 0.32, v: 0.06, type: 'triangle' })); noise({ t: 0.35, d: 0.5, v: 0.03, f: 7000, f2: 3000, type: 'highpass' }); },
    star: (i) => { tone(midi(84 + i * 4), { d: 0.12, v: 0.06, type: 'triangle' }); tone(midi(91 + i * 4), { t: 0.06, d: 0.3, v: 0.05, type: 'triangle' }); },
    tap: () => tone(900, { d: 0.03, v: 0.035, type: 'triangle' }),
    buy: () => [0, 7, 12, 19].forEach((s, i) => tone(midi(72 + s), { t: i * 0.06, d: 0.2, v: 0.05, type: 'triangle' })),
    door: () => tone(110, { f2: 80, d: 0.12, v: 0.05, type: 'square' }),
    crumble: () => { noise({ d: 0.35, v: 0.07, f: 900, f2: 150 }); tone(120, { f2: 50, d: 0.25, v: 0.05, type: 'triangle' }); },
    grind: () => { noise({ d: 0.22, v: 0.04, f: 600, f2: 220, type: 'bandpass', q: 2 }); tone(70, { f2: 95, d: 0.2, v: 0.035, type: 'square' }); },
    arrow: () => noise({ d: 0.13, v: 0.035, f: 2500, f2: 5200, type: 'bandpass', q: 3 }),
    flag: () => [0, 5, 9].forEach((s, i) => tone(midi(79 + s), { t: i * 0.06, d: 0.22, v: 0.05, type: 'triangle' })),
    fly: () => [0, 7, 12, 16].forEach((s, i) => tone(midi(84 + s), { t: i * 0.045, d: 0.26, v: 0.03, type: 'sine' })),
    reveal: () => tone(1400, { f2: 700, d: 0.08, v: 0.03, type: 'square' }),
    ice: () => { noise({ d: 0.3, v: 0.05, f: 3000, f2: 900, type: 'bandpass', q: 1.5 }); tone(620, { f2: 300, d: 0.18, v: 0.035, type: 'triangle' }); },
    snow: () => noise({ d: 0.16, v: 0.04, f: 1800, f2: 500 }),
    prism: (on) => { if (on) { tone(880, { d: 0.12, v: 0.04, type: 'sine' }); tone(1320, { t: 0.06, d: 0.2, v: 0.03, type: 'sine' }); } else tone(660, { f2: 330, d: 0.16, v: 0.035, type: 'triangle' }); },
    cyc: () => { tone(220, { f2: 330, d: 0.06, v: 0.022, type: 'square' }); noise({ d: 0.06, v: 0.018, f: 3000, f2: 1200, type: 'bandpass' }); },
    gear: () => { tone(520, { d: 0.04, v: 0.03, type: 'square' }); tone(390, { t: 0.05, d: 0.05, v: 0.03, type: 'square' }); },
    boo: () => { tone(330, { f2: 160, d: 0.5, v: 0.05, type: 'sine' }); tone(250, { t: 0.08, f2: 120, d: 0.5, v: 0.04, type: 'triangle' }); },
    lava: () => { noise({ d: 0.5, v: 0.06, f: 500, f2: 120 }); tone(90, { f2: 60, d: 0.4, v: 0.05, type: 'sawtooth' }); },
    no: () => { tone(230, { f2: 190, d: 0.09, v: 0.05, type: 'triangle' }); tone(190, { t: 0.08, f2: 150, d: 0.1, v: 0.04, type: 'triangle' }); }
  };
  function sfx(n, a) { if (!audio() || MG.sfx.muted) return; try { SFX[n](a == null ? 1 : a); } catch (e) {} }
  const Music = {
    on: false, timer: 0, next: 0, step: 0, wi: 0, inten: 0, target: 0,
    start(wi) { const ac = audio(); this.wi = wi; if (!ac) { this.want = true; return; } this.want = false; this.on = true; this.step = 0; this.next = ac.currentTime + 0.1; clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 40); },
    stop() { this.on = false; this.want = false; clearInterval(this.timer); this.timer = 0; },
    tick() {
      const ac = AU.ac; if (!ac || !this.on) return;
      if (ac.state !== 'running') return;
      const M = WORLDS[this.wi].music, spb = 60 / M.bpm / 4;
      this.inten += (this.target - this.inten) * 0.08;
      if (this.next < ac.currentTime) this.next = ac.currentTime + 0.05;
      while (this.next < ac.currentTime + 0.2) { this.play(this.step, this.next, spb, M); this.next += spb; this.step = (this.step + 1) % 64; }
    },
    note(deg, oct, M) { const sc = M.scale, n = sc.length, o = Math.floor(deg / n); return M.root + 12 * (oct + o) + sc[((deg % n) + n) % n]; },
    voice(f, t, d, v, type, cut) {
      const ac = AU.ac, o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
      o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cut || 1800;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.3, d * 0.25)); g.gain.setTargetAtTime(0.0001, t + d * 0.7, d * 0.18);
      o.connect(fl); fl.connect(g); g.connect(AU.music); o.start(t); o.stop(t + d + 0.4);
    },
    play(st, t, spb, M) {
      const bar = Math.floor(st / 16), s = st % 16, root = M.prog[bar % M.prog.length], I = this.inten;
      if (s === 0) [0, 2, 4].forEach((k, j) => { this.voice(midi(this.note(root + k, 1, M)), t, spb * 16, 0.022, 'sawtooth', 700 + I * 900); this.voice(midi(this.note(root + k, 1, M)) * 1.006, t, spb * 16, 0.018, 'sawtooth', 600); });
      if (s === 0 || s === 8 || (I > 0.4 && (s === 4 || s === 12))) this.voice(midi(this.note(root, -1, M)), t, spb * 3.5, 0.11, 'sine', 400);
      if (s % 2 === 0) { const pat = [0, 2, 4, 2, 7, 4, 2, 4], deg = root + pat[(s / 2) % 8]; this.voice(midi(this.note(deg, 2, M)), t, spb * 1.6, 0.03 + I * 0.025, 'triangle', 2600); }
      if (I > 0.35) {
        if (s % 4 === 2) { const ac = AU.ac, src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); if (!AU.noise) noise({ d: 0.01, v: 0.0001 }); src.buffer = AU.noise; fl.type = 'highpass'; fl.frequency.value = 7000; g.gain.setValueAtTime(0.025 * I, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); src.connect(fl); fl.connect(g); g.connect(AU.music); src.start(t, Math.random() * 0.5); src.stop(t + 0.07); }
        if (s === 0 || s === 8) { const ac = AU.ac, o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18); g.gain.setValueAtTime(0.16 * I, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(AU.music); o.start(t); o.stop(t + 0.25); }
      }
    }
  };
  function vibrate(ms) { try { if (settings().vib && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  /* =====================================================================
     IMAGES
     ===================================================================== */
  function img(src) {
    if (UI.imgs[src]) return UI.imgs[src];
    const im = new Image(); im.decoding = 'async'; im.onload = () => { im.ok = true; }; im.src = MG.asset(src); UI.imgs[src] = im; return im;
  }
  const skinImg = (id) => img('maze/mk_' + id + '.webp');
  const itemsImg = () => img('maze/items.webp');
  // petits sprites pixel art (ennemis) : rangées de caractères → couleurs
  function pixSprite(key, rows, cols) {
    if (UI.pix[key]) return UI.pix[key];
    const h = rows.length, w = rows[0].length, k = document.createElement('canvas'); k.width = w; k.height = h; const c = k.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = rows[y][x]; if (ch === '.' || !cols[ch]) continue; c.fillStyle = cols[ch]; c.fillRect(x, y, 1, 1); }
    UI.pix[key] = k; return k;
  }
  const PX = {
    slime: [['....aaaa....', '..aabbbbaa..', '.abbbbbbbba.', '.bbwwbbwwbb.', 'abbwkbbwkbba', 'abbbbbbbbbba', 'abbbbccbbbba', '.aaaaaaaaaa.'],
      ['............', '....aaaa....', '..abbbbbba..', '.bbwwbbwwbb.', 'abbwkbbwkbba', 'abbbbccbbbba', 'abbbbbbbbbba', 'aaaaaaaaaaaa']],
    bat: [['a..........a', 'aa..bbbb..aa', 'aaabwkkwbaaa', '.aabbbbbbaa.', '...bbccbb...', '....b..b....', '............', '............'],
      ['............', '....bbbb....', '..abwkkwba..', '.aabbbbbbaa.', 'aa.bbccbb.aa', 'a...b..b...a', '............', '............']],
    chaser: [['...aaaaaa...', '..abbbbbba..', '.abbbbbbbba.', '.bwwbbbbwwb.', '.bwkbbbbwkb.', '.bbbbbbbbbb.', '.bbcbcbcbbb.', '.bbbbbbbbbb.', '.b.bb..bb.b.', '............'],
      ['...aaaaaa...', '..abbbbbba..', '.abbbbbbbba.', '.bwwbbbbwwb.', '.bkwbbbbkwb.', '.bbbbbbbbbb.', '.bbcbcbcbbb.', '.bbbbbbbbbb.', '..bb.bb.bb..', '............']],
    guard: [['.aaaaaaaaaa.', 'abbbbbbbbbba', 'abccbbbbccba', 'abwkbbbbwkba', 'abbbbbbbbbba', 'abbddddddbba', 'abbdeeeedbba', 'abbbbbbbbbba', 'aaaaaaaaaaaa'],
      ['.aaaaaaaaaa.', 'abbbbbbbbbba', 'abccbbbbccba', 'abkwbbbbkwba', 'abbbbbbbbbba', 'abbbddddbbba', 'abbbdeedbbba', 'abbbbbbbbbba', 'aaaaaaaaaaaa']]
  };
  const PXCOL = {
    slime: [{ a: '#1e7a4a', b: '#43d17c', c: '#1a5a38', w: '#ffffff', k: '#0b0a1e' }, { a: '#5b1f8a', b: '#a45cf0', c: '#3d1166', w: '#ffffff', k: '#0b0a1e' }, { a: '#16507a', b: '#3ab6f2', c: '#0f3a5a', w: '#fff', k: '#0b0a1e' }, { a: '#7a4510', b: '#f0a43a', c: '#5a300a', w: '#fff', k: '#1e0b04' }],
    bat: [{ a: '#4b2a8f', b: '#7e52d8', c: '#ffe066', w: '#ffef9e', k: '#ff4f7b' }, { a: '#0d3d7a', b: '#2b8fd9', c: '#ff4fd8', w: '#bff6ff', k: '#ff4f7b' }, { a: '#4a1466', b: '#a43ad6', c: '#5ee7ff', w: '#ffd0f5', k: '#ff4f7b' }, { a: '#6b2b07', b: '#c25a14', c: '#ffe066', w: '#fff1b0', k: '#ff4f7b' }],
    chaser: { a: '#7a0f3a', b: '#ff3d7f', c: '#ffffff', w: '#ffffff', k: '#1a0612' },
    guard: [{ a: '#2a1458', b: '#5d3aa8', c: '#3d2280', w: '#ffd84d', k: '#1a0b33', d: '#1a0b33', e: '#ff5e7a' }, { a: '#0a2a5a', b: '#2a6ab0', c: '#164a88', w: '#5ef2ff', k: '#04122a', d: '#04122a', e: '#ff4fd8' }, { a: '#2a0e4f', b: '#6b2fa0', c: '#4a1b78', w: '#ff9de9', k: '#140628', d: '#140628', e: '#5ee7ff' }, { a: '#5a2a08', b: '#c47a2a', c: '#8a4c14', w: '#fff3a6', k: '#2a1204', d: '#2a1204', e: '#ff4f4f' }]
  };

  /* =====================================================================
     NIVEAU : chargement, logique
     ===================================================================== */
  function loadLevel(wi, li) {
    const L = levelAt(wi, li), H = L.h, W = 11, grid = L.rows.map((r) => r.split(''));
    const g = {
      wi, li, L, W, H, grid, pal: WORLDS[wi].pal, time: 0, state: 'ready', coinsTotal: 0, got: 0, coinStreak: 0, exit: null,
      milo: { x: 0, y: 0, d: 2, moving: false, prog: 0, mt: 0, sp: 0, face: 1, pose: 'idle', poseT: 0, sq: 0, sqDir: 1, hitT: 0, phase: 0, px: 0, py: 0, lpx: 0, lpy: 0, prep: false, telT: 0, invT: 0, collected: 0, ghostY: 0 },
      bon: { shield: false, magnet: 0, speed: 0, slow: 0, tele: 0 }, buf: null, ents: [], timed: [], doors: [], torches: [], parts: [], trail: [], flyers: [], texts: [],
      cam: 0, camT: 0, shake: 0, hits: 0, deaths: 0, startY: 0, portals: {}, dead: false, endT: 0, slowK: 1, magnetR: 2.6, bonusDur: 1 + 0.2 * ((data().upg || {}).dur || 0),
      // V2 : interrupteurs (tog), grilles (gate), passages révélés, collection, règles de défi, cœurs, boss
      tog: 0, gate: false, rev: new Set(), crystals: 0, crTotal: 0, key: false, relic: false, chests: 0, rule: L.rule || null, exitOpen: !(L.rule && L.rule.t === 'allcoins'),
      hearts: heartsFor(wi, L), maxHearts: heartsFor(wi, L), boss: null, proj: [], warns: [], beams: [],
      // phase 3 : plaques multiples (sceaux), murs de grès (parité), obscurité, lucioles, pièges cachés, checkpoints
      platesN: 0, platesOn: 0, par: 0, parT: 1, hasPar: false, dark: L.dark || 0, light: L.dark || 0, fly: 0, seenI: new Set(), hidT: [], cp: null, cpOn: new Set(), respawns: 0, shrooms: [],
      // phase 4 : blocs gelés, lave montante
      ice: [], lava: L.lava || null, lavaY: H + 1, lavaHold: 0,
      // phase 5 : gravité (-1 = aucune), commandes inversées (s), oxygène (s)
      grav: -1, invT: 0, o2Max: L.o2 || 0, o2: L.o2 || 0,
      // phase 6 : engrenages (rotation 0-3, change à chaque arrêt)
      rot: 0, rotT: 1, hasRot: false,
      // phase 7 : prismes de lumière (cases allumées ; état au dernier arrêt pour les checkpoints), murs du néant (couleur active 0-2)
      lit: new Set(), litRest: new Set(), prisms: 0, cyc: 0, cycT: 1, hasCyc: false
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y][x];
      if (c === 'S') { g.milo.x = x; g.milo.y = y; grid[y][x] = ' '; }
      else if (c === 'E') g.exit = [x, y];
      else if (c === '.') g.coinsTotal++;
      else if (c >= '1' && c <= '4') (g.portals[c] = g.portals[c] || []).push([x, y]);
      else if (c === 'D' || c === 'w') g.doors.push({ x, y, ph: hash(x, y, 9), open: 1, hold: false, wasOpen: true, kind: c, per: c === 'w' ? 3.2 : DOOR.per, on: c === 'w' ? 2.1 : DOOR.open });
      else if (c === 'O') { g.ice.push({ x, y, fx: x, fy: y }); grid[y][x] = ' '; }
      else if (TIMED[c]) g.timed.push({ x, y, c, ph: 0 });
      else if (c === '*') g.crTotal++;
      else if (c === 'P') g.platesN++;
      else if (c === 'y' || c === 'Y') g.hasPar = true;
      else if (c >= '6' && c <= '9') g.hasRot = true;
      else if (c === 'l') g.prisms++;
      else if (c === 'd' || c === 'f' || c === 'h') g.hasCyc = true;
    }
    g.hidT = g.timed.filter((t) => t.c === 'i');
    if (L.boss) g.boss = { kind: L.boss.kind, name: L.boss.name, hp: L.boss.hp, max: L.boss.hp, phase: 0, next: 2.4, ti: 0, targets: L.boss.targets, hitT: 0, dead: false, deadT: 0, n: 0, calm: 0, eye: 0 };
    // phases : les pièges contigus d'un même type se déclenchent ensemble
    const seen = new Set();
    g.timed.forEach((t) => { if (seen.has(t)) return; const grp = [t], q = [t]; seen.add(t); while (q.length) { const a = q.pop(); g.timed.forEach((b) => { if (!seen.has(b) && b.c === a.c && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1) { seen.add(b); grp.push(b); q.push(b); } }); } const ph = hash(t.x, t.y, 3); grp.forEach((b) => (b.ph = ph)); });
    g.ents = L.ents.map((e, i) => Object.assign({ i, ex: e.a[0], ey: e.a[1], alive: true, home: e.a.slice(), tx: e.a[0], ty: e.a[1], fx: e.a[0], fy: e.a[1], k: 0, chase: false, eyes: 0, on: false }, JSON.parse(JSON.stringify(e))));
    // torches / décor animé
    if (WORLDS[wi].deco === 'roots') for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (grid[y][x] !== '#' && grid[y + 1][x] === '#' && hash(x, y, 5) < 0.1) g.shrooms.push({ x, y, h: hash(x, y, 6) });
    // Usine : mécanismes synchronisés — pièges temporisés, lasers et flèches avancent en vague
    if (WORLDS[wi].deco === 'bolts') { g.timed.forEach((t) => (t.ph = (t.y * 0.085) % 1)); g.ents.forEach((e) => { if (e.t === 'laser' || e.t === 'arrow') e.ph = +((e.a[1] * 0.085) % 1).toFixed(3); }); }
    if (WORLDS[wi].deco === 'vine' || WORLDS[wi].deco === 'sun' || WORLDS[wi].deco === 'ember' || WORLDS[wi].deco === 'banner') for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) if (grid[y][x] === '#' && grid[y + 1] && grid[y + 1][x] !== '#' && grid[y + 1][x] !== undefined) { const h = hash(x, y, 5); if (h < 0.12) g.torches.push({ x, y, h }); }
    g.startY = g.milo.y; g.milo.px = g.milo.x; g.milo.py = g.milo.y; g.milo.lpx = g.milo.px; g.milo.lpy = g.milo.py;
    g.cam = clamp(g.milo.y + 0.5 - viewRows() * 0.62, 0, Math.max(0, H - viewRows())); g.camT = g.cam;
    const u = data().upg || {};
    if (u.magStart) g.bon.magnet = 4;
    if ((u.shields || 0) > 0 && u.autoShield !== false && !(g.rule && g.rule.t === 'nohit')) { u.shields--; g.bon.shield = true; g.freeShield = true; }
    return g;
  }
  const viewRows = () => (UI.vh || 700) / (UI.cs || 32);
  // 3 cœurs à partir du monde 3 (et pour les boss) ; un défi « sans coup » reste à un seul cœur
  const heartsFor = (wi, L) => (L.boss || (wi >= 2 && !(L.rule && L.rule.t === 'nohit')) ? 3 : 1);
  const cell = (x, y) => (G.grid[y] && G.grid[y][x] !== undefined ? G.grid[y][x] : '#');
  function doorOpen(x, y) { const d = G.doors.find((q) => q.x === x && q.y === y); return !d || d.open > 0.5; }
  function passable(x, y) {
    const c = cell(x, y); if (c === '#') return false; if (c === 'D' || c === 'w') return doorOpen(x, y);
    if (G.ice.length && iceAt(x, y)) return false;
    if (c === 'a') return G.tog === 1; if (c === 'b') return G.tog === 0; if (c === 'g') return G.gate; if (c === 'E') return G.exitOpen;
    if (c === 'y') return G.par === 1; if (c === 'Y') return G.par === 0; if (c === 'U') return false;
    if (c === 'I') return lightOpen(); if (c === 'd' || c === 'f' || c === 'h') return VOIDC.indexOf(c) !== G.cyc;
    return true;
  }
  // porte de lumière : ouverte quand TOUS les prismes sont allumés en même temps
  const lightOpen = () => G.prisms > 0 && G.lit.size >= G.prisms;
  const solidAt = (x, y) => { const c = cell(x, y); return c === '#' || (c === 'H' && !G.rev.has(y * G.W + x)) || (c === 'a' && G.tog === 0) || (c === 'b' && G.tog === 1) || (c === 'g' && !G.gate) || (c === 'y' && G.par === 0) || (c === 'Y' && G.par === 1) || (c === 'I' && !lightOpen()) || ((c === 'd' || c === 'f' || c === 'h') && VOIDC.indexOf(c) === G.cyc) || (G.ice.length > 0 && !!iceAt(x, y)); };
  const iceAt = (x, y) => G.ice.find((b) => b.x === x && b.y === y);
  // bloc gelé : il glisse sur le sol nu et les objets (sans les ramasser) jusqu'au prochain obstacle — mêmes règles que le générateur
  const ICEOK = ' .BMVRT*LKQC';
  function pushIce(b, d) {
    let x = b.x, y = b.y, n = 0;
    for (;;) { const tx = x + DIRS[d][0], ty = y + DIRS[d][1], c = cell(tx, ty); if (!ICEOK.includes(c) || iceAt(tx, ty)) break; x = tx; y = ty; n++; }
    if (!n) return false;
    fxBurst(b.x + 0.5, b.y + 0.5, ['#ffffff', '#bfefff', '#8fd8ff'], 12, 3); b.x = x; b.y = y; sfx('ice'); G.shake = Math.max(G.shake, 0.18); vibrate(12); return true;
  }
  const timedState = (t, time) => { const T = TIMED[t.c], sl = G.slowK, per = T.per / sl, ph = ((time + t.ph * per) % per) / per, onF = T.on / T.per, warnF = T.warn / T.per; return ph < onF ? 'on' : ph > 1 - warnF ? 'warn' : 'off'; };

  function launch(d) {
    if (!G || G.state === 'dead' || G.state === 'win' || G.paused) return;
    const m = G.milo;
    if (m.moving) { G.buf = { d, t: G.time }; return; }
    if (G.state === 'ready') { G.state = 'play'; hideHint(); if (!data().seenTuto) { data().seenTuto = true; api.save(); } }
    const nx = m.x + DIRS[d][0], ny = m.y + DIRS[d][1];
    if (!passable(nx, ny)) {
      const ib = G.ice.length && iceAt(nx, ny); if (ib && pushIce(ib, d)) { m.pose = 'collect'; m.poseT = 0.25; m.sq = 0.4; m.sqDir = d % 2 === 0 ? 1 : 0; if (d === 1) m.face = 1; else if (d === 3) m.face = -1; return; }
      if (G.bon.tele > 0 && cell(nx, ny) === '#') { if (teleportThrough(d)) return; }
      m.sq = 0.5; m.sqDir = d % 2 === 0 ? 1 : 0; sfx('bump', 0.5); if (d === 1) m.face = 1; else if (d === 3) m.face = -1; return;
    }
    m.moving = true; m.d = d; m.prog = 0; m.mt = 0; m.sp = V0; m.prep = false;
    if (d === 1) m.face = 1; else if (d === 3) m.face = -1;
    m.pose = 'accel'; m.poseT = 0.14; m.collected = 0;
    sfx('whoosh'); G.trailBreak = true;
  }
  function teleportThrough(d) {
    const m = G.milo;
    for (let j = 2; j <= 4; j++) {
      const tx = m.x + DIRS[d][0] * j, ty = m.y + DIRS[d][1] * j;
      if (tx < 0 || tx >= G.W || ty < 0 || ty >= G.H) break;
      if (passable(tx, ty)) {
        G.bon.tele--; if (cell(m.x, m.y) === 'u') crumble(m.x, m.y); fxTeleport(m.x, m.y); m.x = tx; m.y = ty; m.px = tx; m.py = ty; m.lpx = tx; m.lpy = ty; G.trail.length = 0; fxTeleport(tx, ty);
        sfx('tele'); m.pose = 'teleport'; m.poseT = 0.35; m.invT = 0.4; floatText('Téléport !', tx, ty - 0.6, BONUS.T.color);
        enterTile(tx, ty, true);
        if (G.state === 'play' && passable(tx + DIRS[d][0], ty + DIRS[d][1])) { m.moving = true; m.d = d; m.prog = 0; m.mt = 0.2; m.sp = VMAX; }
        hud(); return true;
      }
    }
    return false;
  }
  // dalle fragile : s'effondre dès que Milo la quitte
  function crumble(x, y) { G.grid[y][x] = 'U'; sfx('crumble'); G.shake = Math.max(G.shake, 0.2); fxBurst(x + 0.5, y + 0.5, ['#c87a34', '#8a5a26', '#ffd45e'], 14, 2.5); }
  function stopMilo() {
    const m = G.milo; m.moving = false; m.prog = 0;
    // gravité : Milo retombe aussitôt dans le sens de la gravité tant qu'il n'est pas calé (mêmes règles que le générateur)
    if (G.grav >= 0 && G.state === 'play' && passable(m.x + DIRS[G.grav][0], m.y + DIRS[G.grav][1])) { m.moving = true; m.d = G.grav; m.mt = 0; m.sp = V0; G.trailBreak = true; if (G.grav === 1) m.face = 1; else if (G.grav === 3) m.face = -1; m.pose = 'accel'; m.poseT = 0.1; return; }
    if (G.hasRot && G.state === 'play') { G.rot = (G.rot + 1) & 3; G.rotT = 0; sfx('gear'); } // engrenages : un quart de tour à chaque arrêt
    if (G.hasPar && G.state === 'play') { G.par ^= 1; G.parT = 0; sfx('grind'); } // murs de grès : ils changent de place à chaque arrêt
    if (G.hasCyc && G.state === 'play') { G.cyc = (G.cyc + 1) % 3; G.cycT = 0; sfx('cyc'); hud(); } // murs du néant : la couleur active change à chaque arrêt
    if (G.prisms) G.litRest = new Set(G.lit); // état des prismes au dernier arrêt (c'est celui que le générateur vérifie pour les checkpoints)
    const k = clamp((m.sp - V0) / (VMAX - V0), 0.25, 1);
    m.sq = 0.55 * k + 0.2; m.sqDir = m.d % 2 === 0 ? 1 : 0; m.impD = m.d; m.impT = 0;
    G.shake = Math.max(G.shake, 0.18 * k); sfx('bump', k);
    fxImpact(m.x + 0.5 + DIRS[m.d][0] * 0.45, m.y + 0.5 + DIRS[m.d][1] * 0.45, m.d);
    if (m.collected > 0) { m.pose = 'collect'; m.poseT = 0.35; } else { m.pose = 'idle'; m.poseT = 0; }
    if (G.buf && G.time - G.buf.t < 0.35) { const d = G.buf.d; G.buf = null; launch(d); } else G.buf = null;
  }
  function enterTile(x, y, quiet) {
    const c = cell(x, y), m = G.milo;
    if (c === '.') collectCoin(x, y);
    else if (BONUS[c]) pickBonus(c, x, y);
    else if (c === 'E') { win(); return; }
    else if (c === 'o') { G.tog ^= 1; sfx('door'); fxBurst(x + 0.5, y + 0.5, [G.tog ? '#4fa8ff' : '#ff4f6d', '#ffffff'], 10, 3); vibrate(8); }
    else if (c === 'P') { G.grid[y][x] = 'p'; G.platesOn++; sfx('door'); vibrate(15); fxBurst(x + 0.5, y + 0.5, ['#ffd84d', '#ffffff'], 16, 3.5);
      if (G.platesOn >= G.platesN) { if (!G.gate) { G.gate = true; G.shake = Math.max(G.shake, 0.25); floatText('La grille s’ouvre !', x, y - 0.6, '#ffd84d'); } } else floatText(`Sceau ${G.platesOn}/${G.platesN}`, x, y - 0.6, '#ffd84d'); }
    else if (c === '*') { G.grid[y][x] = ' '; G.crystals++; sfx('star', Math.min(2, G.crystals - 1)); fxBurst(x + 0.5, y + 0.5, ['#d58bff', '#ffffff', '#8a5cff'], 18, 3.5); floatText(`Cristal ${G.crystals}/${G.crTotal}`, x, y - 0.5, '#e2b0ff'); hud(); }
    else if (c === 'K') { G.grid[y][x] = ' '; G.key = true; sfx('win'); fxBurst(x + 0.5, y + 0.5, ['#ffd84d', '#ffffff'], 26, 4.5); floatText('Clé secrète !', x, y - 0.6, '#ffd84d', true); vibrate(30); hud(); }
    else if (c === 'Q') { G.grid[y][x] = ' '; G.relic = true; sfx('win'); fxBurst(x + 0.5, y + 0.5, ['#5ef2ff', '#ffd84d', '#ffffff'], 30, 5); floatText('Relique trouvée !', x, y - 0.6, '#7af6ff', true); vibrate(30); hud(); }
    else if (c === 'C') { G.grid[y][x] = ' '; G.chests++; sfx('bonus'); fxBurst(x + 0.5, y + 0.5, ['#ffd84d', '#ffb340', '#ffffff'], 22, 4); floatText('Coffre +' + CHEST_COINS, x, y - 0.6, '#ffd84d', true); }
    else if (c === 'F') { const k = y * G.W + x; if (!G.cp || G.cp[0] !== x || G.cp[1] !== y) { const first = !G.cpOn.has(k); G.cp = [x, y]; G.cpOn.add(k); if (first) { sfx('flag'); fxBurst(x + 0.5, y + 0.3, ['#9dffb0', '#ffffff', '#3ee08a'], 18, 3.5); floatText('Checkpoint !', x, y - 0.6, '#9dffb0', true); vibrate(12); } } }
    else if (c === 'G') { if (G.grav !== m.d) { G.grav = m.d; sfx('portal'); fxBurst(x + 0.5, y + 0.5, ['#ff7ae0', '#5ee7ff', '#ffffff'], 18, 3.5); floatText('Gravité ' + '↑→↓←'[m.d], x, y - 0.6, '#ff9de9', true); vibrate(12); hud(); } }
    else if (c === 'r') { const was = G.invT > 0; G.invT = 8; if (!was) { sfx('tele'); fxBurst(x + 0.5, y + 0.5, ['#ff7ae0', '#ffffff'], 16, 3.5); floatText('Commandes inversées !', x, y - 0.6, '#ff7ae0', true); vibrate([15, 30, 15]); } hud(); }
    else if (c === 'A') { if (G.o2Max && G.o2 < G.o2Max - 0.3) { G.o2 = G.o2Max; sfx('fly'); for (let i = 0; i < (UI.lowfx ? 3 : 9); i++) addPart({ x: x + 0.3 + Math.random() * 0.4, y: y + 0.7, vx: (Math.random() - 0.5) * 0.6, vy: -1.5 - Math.random() * 1.5, g: 0, life: 0.7, t: 0, s: 0.08 + Math.random() * 0.06, c: '#bff8ff' }); floatText('Air !', x, y - 0.5, '#bff8ff'); hud(); } }
    else if (c === 'X') { G.grid[y][x] = ' '; sfx('boo'); fxBurst(x + 0.5, y + 0.5, ['#8dffb8', '#c6a8ff', '#1a0820'], 22, 4); floatText('Fausse sortie !', x, y - 0.6, '#8dffb8', true); G.shake = Math.max(G.shake, 0.4); if (m.invT <= 0) hurt('Une fausse sortie !'); }
    else if (c === 'L') { G.grid[y][x] = ' '; G.fly = 10; sfx('fly'); fxBurst(x + 0.5, y + 0.5, ['#f4ff9a', '#d8ff8a', '#ffffff'], 18, 3); floatText('Lucioles !', x, y - 0.6, '#e6ff9a', true); hud(); }
    else if (c === 'l') { const k = y * G.W + x, was = lightOpen(); if (G.lit.has(k)) G.lit.delete(k); else G.lit.add(k); const on = G.lit.has(k), op = lightOpen();
      sfx('prism', on ? 1 : 0); fxBurst(x + 0.5, y + 0.5, on ? ['#ffffff', '#5ef2ff', '#e0d0ff'] : ['#6a4aa8', '#2a1458'], on ? 16 : 8, on ? 3.5 : 2); vibrate(on ? 10 : 6);
      if (op) { floatText('La porte de lumière s’ouvre !', x, y - 0.6, '#e8fbff', true); G.shake = Math.max(G.shake, 0.25); }
      else floatText(on ? `Prisme ${G.lit.size}/${G.prisms}` : was ? 'La porte se referme !' : 'Prisme éteint', x, y - 0.6, on ? '#bff8ff' : '#b48cff', was); hud(); }
    else if (c === 'H' && !G.rev.has(y * G.W + x)) { G.rev.add(y * G.W + x); buildChunks(); sfx('portal'); fxBurst(x + 0.5, y + 0.5, ['#ffffff', G.pal.edge], 18, 3); floatText('Passage secret !', x, y - 0.6, '#ffffff', true); }
    if (G.boss && !G.boss.dead) { const t = G.boss.targets[G.boss.ti]; if (t && t[0] === x && t[1] === y) bossHit(); }
    else if (c in BOOSTDIR && !quiet) {
      const nd = BOOSTDIR[c]; if (nd !== m.d) { m.d = nd; if (nd === 1) m.face = 1; else if (nd === 3) m.face = -1; }
      m.sp = VMAX * 1.15; m.mt = ACC_T; m.pose = 'jump'; m.poseT = 0.2; sfx('boost'); fxBurst(x + 0.5, y + 0.5, ['#5ef2ff', '#ffffff'], 8, 2.5); G.trailBreak = true;
    } else if (c >= '6' && c <= '9' && !quiet) { // engrenage : direction = direction de départ + rotation
      const nd = (c.charCodeAt(0) - 54 + G.rot) % 4; if (nd !== m.d) { m.d = nd; if (nd === 1) m.face = 1; else if (nd === 3) m.face = -1; }
      m.sp = VMAX; m.mt = ACC_T; m.pose = 'jump'; m.poseT = 0.2; sfx('boost'); fxBurst(x + 0.5, y + 0.5, ['#ffb44a', '#ffffff'], 8, 2.5); G.trailBreak = true;
    } else if (c >= '1' && c <= '4' && !quiet) {
      const pair = G.portals[c], o = pair && pair.find((p) => p[0] !== x || p[1] !== y);
      if (o) { fxTeleport(x, y); m.x = o[0]; m.y = o[1]; m.px = o[0]; m.py = o[1]; m.lpx = m.px; m.lpy = m.py; G.trail.length = 0; fxTeleport(o[0], o[1]); sfx('portal'); m.pose = 'teleport'; m.poseT = 0.25; G.trailBreak = true; enterTile(o[0], o[1], true); }
    }
  }
  function collectCoin(x, y) {
    G.grid[y][x] = ' '; G.got++; G.milo.collected++; G.coinStreak++;
    sfx('coin', G.coinStreak % 12); fxCoin(x + 0.5, y + 0.5); bumpHud('coins');
  }
  function pickBonus(c, x, y) {
    const b = BONUS[c], m = G.milo; G.grid[y][x] = ' '; G.bonusUsed = true;
    if (b.id === 'shield') G.bon.shield = true;
    else if (b.id === 'tele') G.bon.tele++;
    else G.bon[b.id] = b.dur * G.bonusDur;
    sfx('bonus'); fxBurst(x + 0.5, y + 0.5, [b.color, '#ffffff'], 16, 3.5); floatText(b.name + ' !', x, y - 0.5, b.color);
    m.pose = b.id === 'shield' ? 'shield' : b.id === 'tele' ? 'teleport' : 'collect'; m.poseT = 0.45;
    vibrate(10); hud();
  }

  /* ---------- Mise à jour ---------- */
  function update(dt) {
    if (!G || G.paused) return;
    const m = G.milo;
    if (G.state === 'play') G.time += dt;
    G.slowK = G.bon.slow > 0 ? 0.45 : 1;
    ['magnet', 'speed', 'slow'].forEach((k) => { if (G.bon[k] > 0) { G.bon[k] = Math.max(0, G.bon[k] - (G.state === 'play' ? dt : 0)); if (!G.bon[k]) hud(); } });
    if (G.fly > 0 && G.state === 'play') { G.fly = Math.max(0, G.fly - dt); if (!G.fly) hud(); }
    if (G.invT > 0 && G.state === 'play') { G.invT = Math.max(0, G.invT - dt); if (!G.invT) { hud(); floatText('Commandes normales', G.milo.px, G.milo.py - 0.7, '#ffffff'); } }
    if (G.o2Max && G.state === 'play') G.o2 = Math.max(0, G.o2 - dt);
    if (G.dark) { const tl = G.dark + (G.fly > 0 ? 2.6 : 0); G.light += (tl - G.light) * Math.min(1, dt * 2.5); }
    G.parT += dt; G.rotT += dt; G.cycT += dt;
    G.ice.forEach((b) => { const k = dt * 18; b.fx += Math.sign(b.x - b.fx) * Math.min(Math.abs(b.x - b.fx), k); b.fy += Math.sign(b.y - b.fy) * Math.min(Math.abs(b.y - b.fy), k); });
    // lave montante : elle part du bas après un court délai ; elle blesse dès qu'elle atteint Milo
    if (G.lava && G.state === 'play') { if (G.lavaHold > 0) G.lavaHold -= dt; else if (G.time > G.lava.g) G.lavaY = Math.max(2.5, G.lavaY - G.lava.v * dt * G.slowK); }
    const T = G.time;
    // portes
    G.doors.forEach((d) => {
      const per = d.per / G.slowK, ph = ((T + d.ph * per) % per) / per, want = ph < d.on / d.per; d.warn = want && ph > (d.on - 0.55) / d.per;
      const onIt = (m.x === d.x && m.y === d.y) || (m.moving && m.x + DIRS[m.d][0] === d.x && m.y + DIRS[m.d][1] === d.y);
      const tgt = want || onIt ? 1 : 0; const was = d.open > 0.5; d.open += (tgt - d.open) * Math.min(1, dt * 14); if (Math.abs(d.open - tgt) < 0.02) d.open = tgt;
      if (was !== d.open > 0.5 && Math.abs(d.y - m.y) < 10) sfx('door');
    });
    // Milo
    m.lpx = m.px; m.lpy = m.py;
    if (m.moving && G.state === 'play') {
      m.mt += dt; const vmax = VMAX * (G.bon.speed > 0 ? 1.35 : 1);
      m.sp = Math.max(m.sp, Math.min(vmax, V0 + (vmax - V0) * clamp(m.mt / ACC_T, 0, 1)));
      if (m.sp > vmax) m.sp += (vmax - m.sp) * Math.min(1, dt * 4);
      m.prog += m.sp * dt;
      while (m.prog >= 1 && m.moving && G.state === 'play') {
        m.prog -= 1; const ox0 = m.x, oy0 = m.y; m.x += DIRS[m.d][0]; m.y += DIRS[m.d][1];
        if (cell(ox0, oy0) === 'u') crumble(ox0, oy0);
        const bx = m.x, by = m.y; enterTile(m.x, m.y);
        if (G.state !== 'play') break;
        if (m.x !== bx || m.y !== by) m.prog = 0;
        if (cell(m.x, m.y) === 'n') { sfx('snow'); fxBurst(m.x + 0.5, m.y + 0.7, ['#ffffff', '#dff4ff'], 10, 2.2); stopMilo(); break; } // neige : arrêt net
        if (!passable(m.x + DIRS[m.d][0], m.y + DIRS[m.d][1])) {
          if (G.bon.tele > 0 && cell(m.x + DIRS[m.d][0], m.y + DIRS[m.d][1]) === '#') { m.moving = false; m.prog = 0; if (teleportThrough(m.d)) continue; }
          const ib = G.ice.length && iceAt(m.x + DIRS[m.d][0], m.y + DIRS[m.d][1]); if (ib) pushIce(ib, m.d);
          stopMilo(); break;
        }
      }
      m.phase += m.sp * dt * 1.15;
      if (m.moving && m.poseT <= 0) m.pose = G.bon.speed > 0 || m.mt < ACC_T ? 'accel' : 'run';
    } else if (!m.moving && G.state === 'play') m.phase += dt * 2;
    if (m.moving) { m.px = m.x + DIRS[m.d][0] * m.prog; m.py = m.y + DIRS[m.d][1] * m.prog; } else { m.px = m.x; m.py = m.y; }
    if (m.poseT > 0) { m.poseT -= dt; if (m.poseT <= 0 && !m.moving && G.state !== 'dead' && G.state !== 'win') m.pose = 'idle'; }
    m.sq *= Math.pow(0.0006, dt); m.invT = Math.max(0, m.invT - dt); if (m.impT != null) m.impT += dt;
    if (!m.moving && G.coinStreak && G.state === 'play') G.coinStreak = 0;
    // pièges cachés : révélés tout près de Milo (ou à la lumière des lucioles), puis mémorisés
    if (G.hidT.length && G.state === 'play') for (const t of G.hidT) { if (G.seenI.has(t)) continue; const dd = Math.hypot(t.x - m.px, t.y - m.py); if (dd <= 2.3 || (G.fly > 0 && dd <= G.light - 0.6)) { G.seenI.add(t); sfx('reveal'); addPart({ x: t.x + 0.5, y: t.y + 0.5, ring: 1, life: 0.45, t: 0, c: '#b6ff5e' }); } }
    // aimant
    if (G.bon.magnet > 0 && G.state === 'play') {
      const R = G.magnetR, cx = Math.round(m.px), cy = Math.round(m.py);
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) { if (cell(x, y) !== '.') continue; const dx = x - m.px, dy = y - m.py; if (dx * dx + dy * dy <= R * R) { G.grid[y][x] = ' '; G.flyers.push({ x: x + 0.5, y: y + 0.5, t: 0 }); } }
    }
    for (let i = G.flyers.length - 1; i >= 0; i--) { const f = G.flyers[i]; f.t += dt; const tx = m.px + 0.5, ty = m.py + 0.5, k = Math.min(1, dt * (8 + f.t * 30)); f.x += (tx - f.x) * k; f.y += (ty - f.y) * k; if (Math.hypot(tx - f.x, ty - f.y) < 0.25 || f.t > 0.8) { G.flyers.splice(i, 1); G.got++; G.coinStreak++; sfx('coin', G.coinStreak % 12); fxCoin(f.x, f.y); bumpHud('coins'); } }
    // entités
    let danger = 0;
    G.ents.forEach((e) => { updEnt(e, dt, T); const dd = Math.hypot(e.fx - m.px, e.fy - m.py); if (dd < 3.5) danger = Math.max(danger, 1 - dd / 3.5); if (e.chase) danger = 1; });
    if (G.lava) danger = Math.max(danger, clamp(1 - (G.lavaY - m.py - 1) / 8, 0, 1));
    if (G.o2Max) danger = Math.max(danger, clamp(1 - G.o2 / (G.o2Max * 0.35), 0, 1));
    Music.target = clamp(danger * 1.2 + (G.bon.speed > 0 ? 0.6 : 0), 0, 1);
    // règles de défi
    if (G.rule && G.rule.t === 'timer' && G.state === 'play' && G.time > G.rule.s) die('Temps écoulé !');
    if (!G.exitOpen && G.got >= G.coinsTotal && G.exit) { G.exitOpen = true; sfx('win'); floatText('Sortie ouverte !', G.exit[0], G.exit[1] + 0.6, '#8ff0c0', true); }
    // boss, alertes, projectiles, rayons
    if (G.boss) updBoss(dt);
    for (let i = G.warns.length - 1; i >= 0; i--) { const w = G.warns[i]; if (G.state === 'play') w.t += dt * G.slowK; if (w.t >= w.dur) { G.warns.splice(i, 1); fireWarn(w); } }
    for (let i = G.proj.length - 1; i >= 0; i--) { const p = G.proj[i], vx = p.vx || 0, vy = p.vy || 0; p.x += vx * dt * G.slowK; p.y += vy * dt * G.slowK; p.rot += dt * 9;
      const tx = Math.floor(p.x + Math.sign(vx) * 0.3), ty = Math.floor(p.y + Math.sign(vy) * 0.3);
      if (ty >= G.H - 1 || tx <= 0 || tx >= G.W - 1 || solidAt(tx, ty)) { G.proj.splice(i, 1); fxBurst(p.x, p.y, { arrow: ['#e8e2d0', '#7a4a1e', '#ffd45e'], seed: ['#8a5a26', '#4a7a2a', '#b6ff5e'], icicle: ['#ffffff', '#bfefff', '#8fd8ff'], shard: ['#ffffff', '#bfefff', '#8fd8ff'], meteor: ['#ffb03a', '#ff5a1f', '#ffe066'], jet: ['#bff8ff', '#7af6e0', '#ffffff'], anchor: ['#8a9aa8', '#3a4a58', '#ffffff'], gear: ['#c8d0dc', '#ffb44a', '#ffffff'], sword: ['#e8eef8', '#8dffb8', '#ffffff'], chandelier: ['#ffd45e', '#fff3b0', '#8dffb8'] }[p.kind] || ['#b9a8d8', '#6b5a8a', '#ffffff'], 10, 3); if (Math.abs(ty - m.py) < 9) sfx('bump', 0.6); } }
    for (let i = G.beams.length - 1; i >= 0; i--) { const bm = G.beams[i]; bm.t += dt; if (bm.t > bm.dur) G.beams.splice(i, 1); }
    // collisions
    if (G.state === 'play' && m.invT <= 0 && G.lava && m.py + 0.85 > G.lavaY) { sfx('lava'); hurt('La lave !'); }
    if (G.state === 'play' && m.invT <= 0 && G.o2Max && G.o2 <= 0) { G.o2 = G.o2Max * 0.5; hurt('Plus d’air !'); }
    if (G.state === 'play' && m.invT <= 0) checkHits(T);
    // caméra : Milo un peu sous le centre (on monte), anticipation dans le sens du mouvement
    const vr = viewRows(), look = m.moving ? DIRS[m.d][1] * 2.2 : 0;
    G.camT = G.boss ? G.bossCam || 0 : clamp(m.py + 0.5 + look - vr * 0.58, -0.5, Math.max(-0.5, G.H - vr + 0.5));
    G.cam += (G.camT - G.cam) * (1 - Math.exp(-dt * (m.moving ? 7 : 4))); if (G.snapCam) { G.cam = G.camT; G.snapCam = false; }
    G.shake *= Math.pow(0.002, dt);
    // particules / traînée
    updParts(dt);
    if (m.moving || G.trail.length) updTrail(dt);
    if (G.state === 'dead' || G.state === 'win') G.endT += dt;
  }
  function updEnt(e, dt, T) {
    const sl = G.slowK, m = G.milo;
    e.anim = (e.anim || 0) + dt * sl;
    if (e.t === 'saw' || e.t === 'block' || e.t === 'slime' || e.t === 'bat') {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1, per = (2 * len) / (e.sp * sl);
      e.k = (e.k || e.ph * per) + dt; const u = (e.k % per) / per, tri = u < 0.5 ? u * 2 : 2 - u * 2, s = tri * tri * (3 - 2 * tri);
      e.fx = e.a[0] + (e.b[0] - e.a[0]) * s; e.fy = e.a[1] + (e.b[1] - e.a[1]) * s; e.dirx = Math.sign((e.b[0] - e.a[0]) * (u < 0.5 ? 1 : -1));
    } else if (e.t === 'laser') {
      const per = e.per / sl, ph = ((T + e.ph * per) % per) / per, onF = e.on / e.per; e.on = ph < onF; e.warn = !e.on && ph > 1 - 0.35 / e.per;
      e.fx = (e.a[0] + e.b[0]) / 2; e.fy = (e.a[1] + e.b[1]) / 2; if (e.on && !e.wasOn && Math.abs(e.fy - m.py) < 9) noise({ d: 0.12, v: 0.012, f: 4000, type: 'highpass' }); e.wasOn = e.on;
    } else if (e.t === 'ghost') {
      // fantôme : traverse les murs, lent ; il chasse quand Milo est proche puis rentre chez lui
      const dx = m.px - e.fx, dy = m.py - e.fy, d = Math.hypot(dx, dy);
      if (!e.chase && d < e.r && G.state === 'play') { e.chase = true; floatText('Bouh !', e.fx, e.fy - 0.6, '#c6a8ff'); sfx('boo'); }
      if (e.chase && d > e.r + 3) e.chase = false;
      if (G.state !== 'play') return;
      const tx = e.chase ? m.px : e.home[0], ty = e.chase ? m.py : e.home[1], ddx = tx - e.fx, ddy = ty - e.fy, dd = Math.hypot(ddx, ddy), sp = e.sp * sl * (e.chase ? 1 : 0.6);
      if (dd > 0.02) { const st = Math.min(dd, sp * dt); e.fx += (ddx / dd) * st; e.fy += (ddy / dd) * st; if (Math.abs(ddx) > 0.05) e.dirx = Math.sign(ddx); }
    } else if (e.t === 'arrow') {
      // tireur dans le mur : il s'allume 0,6 s avant le tir, la flèche traverse le couloir puis se plante dans le mur d'en face
      const per = e.per / sl, len = Math.abs(e.b[0] - e.a[0]) + Math.abs(e.b[1] - e.a[1]) + 1, fl = (len + 0.6) / e.sp, t = (T + e.ph * per) % per;
      e.warn = t > per - 0.6; e.on = t < fl; const pos = e.on ? t * e.sp - 0.55 : 0;
      e.fx = e.a[0] + DIRS[e.d][0] * pos; e.fy = e.a[1] + DIRS[e.d][1] * pos;
      if (e.on && !e.wasOn && Math.abs(e.a[1] - m.py) < 9) sfx('arrow'); e.wasOn = e.on;
    } else if (e.t === 'guard') {
      const per = e.per / sl, ph = ((T + e.ph * per) % per) / per; let s; // 0 = niche (b), 1 = couloir (a)
      if (ph < 0.42) s = 1; else if (ph < 0.52) s = 1 - (ph - 0.42) / 0.1; else if (ph < 0.9) s = 0; else s = (ph - 0.9) / 0.1;
      s = s * s * (3 - 2 * s); e.fx = e.b[0] + (e.a[0] - e.b[0]) * s; e.fy = e.b[1] + (e.a[1] - e.b[1]) * s;
    } else if (e.t === 'wisp') {
      const t = T * e.sp * sl + e.ph * 20; e.fx = e.a[0] + Math.sin(t * 0.9) * e.amp + Math.sin(t * 2.3) * 0.25; e.fy = e.a[1] + Math.sin(t * 1.37 + 1.3) * e.amp * 0.85 + Math.cos(t * 1.9) * 0.2;
    } else if (e.t === 'chaser') {
      const dist = Math.hypot(e.fx - m.px, e.fy - m.py);
      if (!e.chase && dist < e.r && G.state === 'play') { e.chase = true; floatText('!', e.fx, e.fy - 0.7, '#ff3d7f'); }
      if (e.chase && dist > e.r + 3.5) e.chase = false;
      if (G.state !== 'play') return;
      const goal = e.chase ? [m.x, m.y] : e.home;
      const sp = e.sp * sl * (e.chase ? 1 : 0.7);
      const dx = e.tx - e.fx, dy = e.ty - e.fy, d = Math.hypot(dx, dy);
      if (d < 0.02) { e.fx = e.tx; e.fy = e.ty; const nx = stepToward(e.tx, e.ty, goal[0], goal[1]); if (nx) { e.tx = nx[0]; e.ty = nx[1]; } }
      else { const st = Math.min(d, sp * dt); e.fx += (dx / d) * st; e.fy += (dy / d) * st; }
    }
  }
  function stepToward(sx, sy, gx, gy) {
    if (sx === gx && sy === gy) return null;
    const W = G.W, prev = new Map([[sy * W + sx, -1]]), q = [[sx, sy]];
    for (let qi = 0; qi < q.length && qi < 400; qi++) {
      const [x, y] = q[qi]; if (x === gx && y === gy) { let k = y * W + x, p = prev.get(k); while (p !== sy * W + sx && p !== -1) { k = p; p = prev.get(k); } return [k % W, Math.floor(k / W)]; }
      for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy, k = ny * W + nx; if (prev.has(k) || !passable(nx, ny) || Math.abs(ny - sy) > 12) continue; prev.set(k, y * W + x); q.push([nx, ny]); }
    }
    return null;
  }
  // collisions continues (sous-échantillonnage pour les grandes vitesses)
  function checkHits(T) {
    const m = G.milo, n = 3;
    for (let i = 1; i <= n; i++) {
      const cx = m.lpx + (m.px - m.lpx) * (i / n) + 0.5, cy = m.lpy + (m.py - m.lpy) * (i / n) + 0.5, hit = hitAt(cx, cy, T);
      if (hit) { hurt(hit); return; }
    }
  }
  function circRect(cx, cy, r, x0, y0, x1, y1) { const nx = clamp(cx, x0, x1), ny = clamp(cy, y0, y1); return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r; }
  function hitAt(cx, cy, T) {
    const r = R_MILO, tx = Math.floor(cx), ty = Math.floor(cy);
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      const c = cell(x, y); if (!TIMED[c]) continue;
      const t = G.timed.find((q) => q.x === x && q.y === y); if (t && timedState(t, T) === 'on' && circRect(cx, cy, r, x + 0.14, y + 0.14, x + 0.86, y + 0.86)) { if (c === 'i') { G.seenI.add(t); return 'Piège caché !'; } if (c === 'j') return 'Le geyser !'; if (c === 'e') return 'Écrasé par la presse !'; return c === 'x' ? 'Les pics !' : c === 'z' ? 'Zzzap !' : 'Cristal !'; }
    }
    for (const p of G.proj) if (Math.hypot(p.x - cx, p.y - cy) < r + p.r) return { arrow: 'Une flèche !', seed: 'Une graine épineuse !', icicle: 'Une stalactite !', shard: 'Un éclat de glace !', meteor: 'Une météorite !', jet: 'Un jet d’eau !', anchor: 'Une ancre !', gear: 'Une scie !', sword: 'Une épée !', chandelier: 'Un lustre !' }[p.kind] || 'Un rocher !';
    for (const bm of G.beams) { if (bm.t < 0.04) continue; if (bm.k === 'rows') { if (Math.floor(cy) >= bm.i && bm.t < bm.dur - 0.2) return bm.kind === 'shock' ? 'Le sol électrifié !' : bm.kind === 'voidf' ? 'Le néant !' : 'La lave !'; continue; } if (bm.k === 'row' && Math.floor(cy) === bm.i && !solidAt(Math.floor(cx), bm.i)) return bm.kind === 'quake' ? 'Le séisme !' : bm.kind === 'thorn' ? 'Les ronces !' : bm.kind === 'sand' ? 'Les sables mouvants !' : bm.kind === 'frost' ? 'Le souffle glacé !' : bm.kind === 'magma' ? 'Le magma !' : bm.kind === 'tentacle' ? 'Le tentacule !' : bm.kind === 'press' ? 'Écrasé par la presse !' : bm.kind === 'curse' ? 'La malédiction !' : 'Le laser !'; if (bm.k === 'col' && Math.floor(cx) === bm.i && !solidAt(bm.i, Math.floor(cy))) return 'Le laser !'; }
    for (const e of G.ents) {
      if (Math.abs(e.fy + 0.5 - cy) > 6 && e.t !== 'laser') continue;
      if (e.t === 'arrow') { if (!e.on) continue; const ax = Math.abs(e.fx + 0.5 - cx), ay = Math.abs(e.fy + 0.5 - cy), hz = e.d % 2 === 1; if ((hz ? ax : ay) < 0.32 + r * 0.6 && (hz ? ay : ax) < 0.1 + r) return 'Une flèche !'; continue; }
      if (e.t === 'laser') { if (!e.on) continue; const hor = laserHor(e); const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]) + 1, y0 = Math.min(e.a[1], e.b[1]), y1 = Math.max(e.a[1], e.b[1]) + 1; if (hor ? circRect(cx, cy, r, x0, (y0 + y1) / 2 - 0.1, x1, (y0 + y1) / 2 + 0.1) : circRect(cx, cy, r, (x0 + x1) / 2 - 0.1, y0, (x0 + x1) / 2 + 0.1, y1)) return 'Le laser !'; continue; }
      const ex = e.fx + 0.5, ey = e.fy + 0.5, d = Math.hypot(ex - cx, ey - cy);
      const er = e.t === 'saw' ? 0.4 : e.t === 'block' ? 0.38 : e.t === 'wisp' ? 0.26 : e.t === 'guard' ? 0.36 : e.t === 'ghost' ? 0.3 : 0.32;
      if (e.t === 'block') { if (circRect(cx, cy, r, ex - er, ey - er, ex + er, ey + er)) return 'Écrasé !'; continue; }
      if (d < r + er) return e.t === 'saw' ? 'La scie !' : e.t === 'chaser' ? 'Attrapé !' : e.t === 'ghost' ? 'Le fantôme !' : 'Aïe !';
    }
    return null;
  }
  function laserHor(e) { // vrai = faisceau horizontal (barre un couloir vertical)
    if (e._hor != null) return e._hor;
    if (e.a[0] !== e.b[0] || e.a[1] !== e.b[1]) return (e._hor = e.a[1] === e.b[1]);
    const x = e.a[0], y = e.a[1];
    return (e._hor = cell(x - 1, y) === '#' && cell(x + 1, y) === '#' ? true : !(cell(x, y - 1) === '#' && cell(x, y + 1) === '#'));
  }
  function hurt(why) {
    const m = G.milo;
    if (G.rule && G.rule.t === 'nohit') { die(why); return; }
    if (G.bon.shield) {
      G.bon.shield = false; m.invT = 1.1; G.hits++; sfx('shieldHit'); vibrate(25);
      fxBurst(m.px + 0.5, m.py + 0.5, ['#7fd6ff', '#ffffff', '#b8e8ff'], 22, 5); floatText('Bouclier !', m.px, m.py - 0.6, '#7fd6ff');
      m.pose = 'hurt'; m.poseT = 0.35; G.shake = 0.5; hud(); return;
    }
    if (G.hearts > 1) {
      G.hearts--; G.hits++; m.invT = 1.6; sfx('hit'); vibrate([30, 20, 30]); G.shake = 0.7;
      fxBurst(m.px + 0.5, m.py + 0.5, ['#ff5e7a', '#ffffff'], 20, 5); floatText(why + ' −1 cœur', m.px, m.py - 0.7, '#ff7aa8', true);
      m.pose = 'hurt'; m.poseT = 0.4; hud(); return;
    }
    die(why);
  }
  function die(why) {
    const m = G.milo; G.state = 'dead'; G.endT = 0; m.moving = false; m.pose = 'hurt'; m.poseT = 99; G.shake = 1; G.why = why;
    sfx('hit'); setTimeout(() => sfx('fail'), 150); vibrate([40, 30, 60]); Music.target = 0;
    fxBurst(m.px + 0.5, m.py + 0.5, ['#ffffff', skinById(data().skin).trail.b, '#ff5e9a'], 26, 6);
    floatText(why, m.px, m.py - 0.9, '#ff7aa8', true);
    const s = data().stats; s.deaths = (s.deaths || 0) + 1;
    const canCp = !!G.cp && !G.boss && !(G.rule && (G.rule.t === 'nohit' || G.rule.t === 'timer'));
    setTimeout(() => { if (G && G.state === 'dead') { if (canCp) cpOffer(); else endLevel(false); } }, canCp ? 1100 : 1500);
  }
  // checkpoint : Milo repart du dernier drapeau avec tous ses cœurs ; pièces, interrupteurs et dalles restent dans leur état
  function respawn() {
    if (!G || !G.cp) return; const m = G.milo, [x, y] = G.cp; closeModal();
    G.state = 'play'; G.endT = 0; G.why = null; G.paused = false; G.buf = null; G.trail.length = 0; G.coinStreak = 0;
    m.x = x; m.y = y; m.px = m.lpx = x; m.py = m.lpy = y; m.moving = false; m.prog = 0; m.pose = 'idle'; m.poseT = 0; m.invT = 2.2; m.sq = 0;
    if (G.lava) { G.lavaY = Math.max(G.lavaY, y + 6); G.lavaHold = 2.5; }
    if (G.o2Max) G.o2 = G.o2Max; G.invT = 0;
    if (G.prisms) G.lit = new Set(G.litRest);
    G.hearts = G.maxHearts; G.respawns++; G.snapCam = true; G.warns.length = 0; G.proj.length = 0; G.beams.length = 0;
    G.ents.forEach((e) => { if (e.t === 'chaser' || e.t === 'ghost') { e.fx = e.tx = e.home[0]; e.fy = e.ty = e.home[1]; e.chase = false; } });
    fxTeleport(x, y); floatText('Checkpoint !', x, y - 0.7, '#9dffb0', true); sfx('tele'); hud(); last = 0;
  }
  function cpOffer() {
    Music.target = 0;
    modal(`<div class="gpanel mz-panel lose"><div class="mz-pmilo">${spriteBox(data().skin || 'classic', 'fail')}</div><h3>Oups !</h3><p>${G.why || 'Milo s’est fait surprendre'}</p>
      <div class="mz-cpinfo">${ico('flag')}<span>Reprends au dernier checkpoint avec tes ${G.maxHearts} cœurs. Tes pièces restent gagnées, le chrono continue.</span></div>
      <div class="acts"><button class="gbtn" data-mz="cpgo">${ico('flag')}Reprendre au checkpoint</button><button class="gbtn light" data-mz="restart">${MG.icon('redo')}Recommencer</button><button class="gbtn light" data-mz="cpquit">${ico('map')}Abandonner</button></div></div>`);
  }
  function win() {
    const m = G.milo; G.state = 'win'; G.endT = 0; m.moving = false; m.pose = 'win'; m.poseT = 99;
    sfx('win'); vibrate(30); Music.target = 0;
    fxBurst(m.px + 0.5, m.py + 0.5, ['#ffd84d', '#ffffff', G.pal.edge], 34, 6);
    try { api.fx.confetti(70); } catch (e) {}
    setTimeout(() => { if (G && G.state === 'win') endLevel(true); }, 1100);
  }

  /* ---------- Boss : attaques signalées, cibles à activer, 3 phases ----------
     Équité : chaque attaque est annoncée (≥ 0,85 s) et laisse toujours une échappatoire. */
  const BOSSDEF = {
    guardian: { color: '#c69bff', warn: '#ff5e5e', ph: [{ every: 2.4, n: 1, warn: 1.05, sp: 10.5, quake: 0 }, { every: 2.05, n: 2, warn: 0.95, sp: 11.5, quake: 3 }, { every: 1.75, n: 3, warn: 0.85, sp: 12.5, quake: 2 }] },
    spider: { color: '#5ef2ff', warn: '#5ef2ff', ph: [{ every: 2.3, warn: 1.05 }, { every: 2.0, warn: 0.95, cols: true }, { every: 1.75, warn: 0.9, cols: true, cross: true, bots: 2 }] },
    // Esprit de la forêt : graines épineuses en colonne, ronces sur la rangée, puis la forêt s'assombrit et des feux follets chassent Milo
    spirit: { color: '#9dffb0', warn: '#b6ff5e', ph: [{ every: 2.35, n: 1, warn: 1.05, sp: 10, thorns: 0 }, { every: 2.05, n: 2, warn: 0.95, sp: 11, thorns: 3, dark: 3.3 }, { every: 1.8, n: 2, warn: 0.9, sp: 12, thorns: 2, dark: 2.9, bots: 2 }] },
    // Pharaon mécanique : volées de flèches sur la rangée (les piliers protègent), puis en colonne, puis en croix avec des scarabées
    pharaoh: { color: '#ffd45e', warn: '#ff7a3a', ph: [{ every: 2.3, warn: 1.05, sp: 11 }, { every: 2.0, warn: 0.95, sp: 12, cols: 2 }, { every: 1.75, warn: 0.9, sp: 13, cross: true, bots: 2 }] },
    // Titan de glace : éclats de glace sur la rangée (les piliers protègent), stalactites en colonne, souffle glacé, boules de neige
    titan: { color: '#bfefff', warn: '#8fd8ff', ph: [{ every: 2.3, warn: 1.05, sp: 10.5 }, { every: 2.0, warn: 0.95, sp: 11.5, cols: 2 }, { every: 1.75, warn: 0.9, sp: 12.5, cross: true, bots: 2 }] },
    // Golem volcanique : météorites en colonne, magma sur la rangée, puis la lave inonde le bas de l'arène ; esprits de braise
    // Léviathan : jets d'eau sur la rangée (les piliers protègent), ancres en colonne, tentacule ; il crache de l'encre puis lâche des piranhas
    leviathan: { color: '#7af6e0', warn: '#2ad8c4', ph: [{ every: 2.3, warn: 1.05, sp: 10.5 }, { every: 2.0, warn: 0.95, sp: 11.5, cols: 2, dark: 3.4 }, { every: 1.75, warn: 0.9, sp: 12.5, cross: true, bots: 2, dark: 3.0 }] },
    // Entité cosmique : rayons sur la rangée et la colonne, puis elle inverse tes commandes (annoncé) ; trous noirs en phase 3
    entity: { color: '#ff7ae0', warn: '#5ee7ff', ph: [{ every: 2.3, warn: 1.05 }, { every: 2.0, warn: 0.95, cols: true, invert: 4 }, { every: 1.75, warn: 0.9, cols: true, cross: true, bots: 2, invert: 3 }] },
    // Machine destructrice : scies en colonne, presses sur la rangée, puis sol électrifié en bas de l'arène ; robots
    machine: { color: '#ffb44a', warn: '#ff8a1f', ph: [{ every: 2.3, n: 1, warn: 1.05, sp: 11, quake: 0 }, { every: 2.0, n: 2, warn: 0.95, sp: 12, quake: 4, flood: 3 }, { every: 1.75, n: 2, warn: 0.9, sp: 13, quake: 3, flood: 3, bots: 2 }] },
    // Roi maudit : épées volantes sur la rangée (les piliers protègent), lustres qui tombent, malédiction ; les chandelles s'éteignent, fantômes
    king: { color: '#8dffb8', warn: '#3fe08a', ph: [{ every: 2.3, warn: 1.05, sp: 11 }, { every: 2.0, warn: 0.95, sp: 12, cols: 2, dark: 3.6 }, { every: 1.75, warn: 0.9, sp: 13, cross: true, bots: 2, dark: 3.2 }] },
    // Gardien des cristaux : rayons de lumière sur la rangée puis la colonne ; les cristaux s'éteignent, éclats vivants
    prism: { color: '#e0d0ff', warn: '#b48cff', ph: [{ every: 2.3, warn: 1.05 }, { every: 2.0, warn: 0.95, cols: true, dark: 3.6 }, { every: 1.75, warn: 0.9, cols: true, cross: true, bots: 2, dark: 3.2 }] },
    // Cœur du Néant (boss final, 9 PV) : il reprend les attaques de tous les gardiens (seq), inverse les commandes, puis le néant monte et la lumière s'éteint
    nexus: { color: '#ff3df0', warn: '#ff3df0', ph: [{ every: 2.3, warn: 1.05, seq: ['guardian', 'pharaoh', 'spider', 'spirit', 'titan'] }, { every: 2.05, warn: 0.95, invert: 5, seq: ['golem', 'king', 'entity', 'leviathan', 'machine'] }, { every: 1.85, warn: 0.95, flood: 4, bots: 2, dark: 3.6, seq: ['pharaoh', 'guardian', 'spider', 'king', 'titan', 'machine'] }] },
    golem: { color: '#ffb03a', warn: '#ff5a1f', ph: [{ every: 2.35, n: 1, warn: 1.05, sp: 10.5, quake: 0 }, { every: 2.05, n: 2, warn: 0.95, sp: 11.5, quake: 4, flood: 3 }, { every: 1.8, n: 2, warn: 0.9, sp: 12.5, quake: 3, flood: 3, bots: 2 }] }
  };
  const BCOL = { guardian: '#ffd84d', spider: '#5ef2ff', spirit: '#9dffb0', pharaoh: '#ffd45e', titan: '#bfefff', golem: '#ffb03a', leviathan: '#7af6e0', entity: '#ff7ae0', machine: '#ffb44a', king: '#8dffb8', prism: '#e0d0ff', nexus: '#ff3df0' };
  // rangée vue depuis un côté : première case pleine (la volée de flèches s'y arrête)
  function rowEnd(y, side) { if (side > 0) { for (let x = 1; x < G.W - 1; x++) if (solidAt(x, y)) return x; return G.W - 1; } for (let x = G.W - 2; x > 0; x--) if (solidAt(x, y)) return x; return 0; }
  const offCol = (mx) => { const c2 = mx + (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 2)); return clamp(c2 < 1 || c2 > G.W - 2 ? mx + (mx < 5 ? 3 : -3) : c2, 1, G.W - 2); };
  const bossPhase = (b) => (b.hp > (b.max * 2) / 3 ? 0 : b.hp > b.max / 3 ? 1 : 2);
  // destinations d'une glissade horizontale depuis (x, y) : sert à garder une case sûre
  function slideX(x, y, dx) { let k = x; while (passable(k + dx, y) && k + dx > 0 && k + dx < G.W - 1) k += dx; return k; }
  // un rocher lâché en haut de la colonne x s'arrête au premier mur : rangée d'arrêt
  function colEnd(x) { for (let y = 3; y < G.H - 1; y++) if (solidAt(x, y)) return y; return G.H - 1; }
  function bossAttack(b) {
    let kind = b.kind, P = BOSSDEF[kind].ph[b.phase]; const m = G.milo, mx = clamp(m.x, 1, G.W - 2), my = clamp(m.y, 3, G.H - 2);
    b.n++; b.eye = 0.7;
    if (kind === 'nexus') {
      if (P.flood && b.n % P.flood === 0) { G.warns.push({ k: 'flood', i: G.H - 3, t: 0, dur: P.warn + 0.3, fire: 'flood', bk: 'voidf', col: '#ff3df0' }); sfx('lava'); floatText('Le néant monte !', G.W / 2 - 0.5, G.H - 4.2, '#ff9df5', true); return; }
      if (P.invert && b.n % P.invert === 0 && !(G.invT > 0)) { G.warns.push({ k: 'inv', i: 0, t: 0, dur: 1.2, fire: 'invert' }); floatText('Inversion !', G.W / 2 - 0.5, 4.4, '#ff7ae0', true); sfx('tele'); }
      kind = P.seq[b.n % P.seq.length]; P = Object.assign({}, BOSSDEF[kind].ph[b.phase], { warn: P.warn, flood: 0, invert: 0 });
    }
    if (kind === 'guardian' || kind === 'spirit' || kind === 'golem' || kind === 'machine') {
      // Milo à l'abri sous un pilier : le boss frappe sa rangée (séisme / ronces / magma) ; le golem inonde aussi le bas de l'arène
      const rowEvery = P.quake || P.thorns, sp = kind === 'spirit', go = kind === 'golem', mc = kind === 'machine';
      if (P.flood && b.n % P.flood === 0) { G.warns.push({ k: 'flood', i: G.H - 3, t: 0, dur: P.warn + 0.3, fire: 'flood', bk: mc ? 'shock' : 'flood', col: mc ? '#ffe066' : '#ff5a1f' }); sfx(mc ? 'door' : 'lava'); floatText(mc ? 'Le sol s’électrifie !' : 'La lave monte !', G.W / 2 - 0.5, G.H - 4.2, mc ? '#ffe066' : '#ffb03a', true); return; }
      if ((rowEvery && b.n % rowEvery === 0) || colEnd(mx) <= my) { G.warns.push({ k: 'row', i: my, t: 0, dur: P.warn + 0.1, fire: sp ? 'thorn' : go ? 'magma' : mc ? 'press' : 'quake', col: sp ? '#b6ff5e' : go ? '#ff5a1f' : mc ? '#ffb44a' : '#ffb340' }); sfx('door'); return; }
      const dest = [slideX(mx, my, -1), slideX(mx, my, 1)].filter((x) => x !== mx), keep = dest.length ? dest[Math.floor(Math.random() * dest.length)] : -1;
      const cols = [mx]; for (let t = 0; cols.length < P.n && t < 40; t++) { const c2 = 1 + Math.floor(Math.random() * (G.W - 2)); if (c2 !== keep && !cols.some((q) => Math.abs(q - c2) < 2)) cols.push(c2); }
      cols.forEach((c2) => G.warns.push({ k: 'col', i: c2, t: 0, dur: P.warn, fire: sp ? 'seed' : go ? 'meteor' : mc ? 'gearProj' : 'rock', sp: P.sp, col: BOSSDEF[kind].warn, end: colEnd(c2) }));
    } else if (kind === 'pharaoh' || kind === 'titan' || kind === 'leviathan' || kind === 'king') {
      const def = BOSSDEF[kind], FX = { pharaoh: ['arrowRow', 'arrowCol', 'sand', '#ffd45e'], titan: ['shardRow', 'icicle', 'frost', '#bfefff'], leviathan: ['jetRow', 'anchor', 'tentacle', '#7af6e0'], king: ['swordRow', 'chandelier', 'curse', '#8dffb8'] }[kind], clear = (sd) => { if (sd > 0) { for (let x = 1; x < mx; x++) if (solidAt(x, my)) return false; } else { for (let x = G.W - 2; x > mx; x--) if (solidAt(x, my)) return false; } return true; };
      const sides = [1, -1].filter(clear), side = sides.length ? sides[Math.floor(Math.random() * sides.length)] : (Math.random() < 0.5 ? 1 : -1);
      const row = () => G.warns.push({ k: 'row', i: my, t: 0, dur: P.warn, fire: FX[0], side, sp: P.sp + 2, end: rowEnd(my, side), col: def.warn });
      const colA = (x) => G.warns.push({ k: 'col', i: x, t: 0, dur: P.warn, fire: FX[1], sp: P.sp + 1, end: colEnd(x), col: def.warn });
      const rowOk = sides.length > 0, colOk = colEnd(mx) > my;
      // Milo abrité de tous côtés : sables mouvants sur sa rangée (annoncés comme le reste) — aucune cachette parfaite
      if (!rowOk && !colOk) { G.warns.push({ k: 'row', i: my, t: 0, dur: P.warn + 0.1, fire: FX[2], col: FX[3] }); sfx('door'); return; }
      if (!rowOk) { colA(mx); return; }
      if (P.cross) { row(); if (colOk) colA(offCol(mx)); }
      else if (P.cols && b.n % 2 === 0 && colOk) { colA(mx); const dest = [slideX(mx, my, -1), slideX(mx, my, 1)].filter((x) => x !== mx), keep = dest.length ? dest[Math.floor(Math.random() * dest.length)] : -1; for (let t = 0; t < 30 && P.cols > 1; t++) { const c2 = 1 + Math.floor(Math.random() * (G.W - 2)); if (c2 !== keep && Math.abs(c2 - mx) >= 2) { colA(c2); break; } } }
      else row();
    } else {
      if (P.invert && b.n % P.invert === 0 && !(G.invT > 0)) { G.warns.push({ k: 'inv', i: 0, t: 0, dur: 1.2, fire: 'invert' }); floatText('Inversion !', G.W / 2 - 0.5, 4.4, '#ff7ae0', true); sfx('tele'); }
      const off = () => { const c2 = mx + (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 2)); return clamp(c2 < 1 || c2 > G.W - 2 ? mx + (mx < 5 ? 3 : -3) : c2, 1, G.W - 2); };
      if (P.cross) { G.warns.push({ k: 'row', i: my, t: 0, dur: P.warn, fire: 'laser' }); G.warns.push({ k: 'col', i: off(), t: 0, dur: P.warn, fire: 'laser' }); }
      else if (P.cols && b.n % 2 === 0) G.warns.push({ k: 'col', i: mx, t: 0, dur: P.warn, fire: 'laser' });
      else G.warns.push({ k: 'row', i: my, t: 0, dur: P.warn, fire: 'laser' });
    }
    sfx('whoosh');
  }
  function fireWarn(w) {
    if (!G.boss || G.boss.dead) return;
    if (w.fire === 'rock') { G.proj.push({ x: w.i + 0.5, y: 2.9, vy: w.sp, r: 0.4, rot: 0 }); sfx('boost'); }
    else if (w.fire === 'seed') { G.proj.push({ x: w.i + 0.5, y: 2.9, vy: w.sp, r: 0.36, rot: 0, kind: 'seed' }); sfx('boost'); }
    else if (w.fire === 'thorn') { G.beams.push({ k: 'row', i: w.i, t: 0, dur: 0.7, kind: 'thorn' }); G.shake = Math.max(G.shake, 0.4); sfx('crumble'); }
    else if (w.fire === 'arrowRow') { G.proj.push({ x: w.side > 0 ? 0.75 : G.W - 0.75, y: w.i + 0.5, vx: w.side * w.sp, vy: 0, r: 0.3, rot: 0, kind: 'arrow' }); sfx('arrow'); }
    else if (w.fire === 'arrowCol') { G.proj.push({ x: w.i + 0.5, y: 2.9, vx: 0, vy: w.sp, r: 0.3, rot: 0, kind: 'arrow' }); sfx('arrow'); }
    else if (w.fire === 'meteor') { G.proj.push({ x: w.i + 0.5, y: 2.9, vy: w.sp, r: 0.38, rot: 0, kind: 'meteor' }); sfx('boost'); }
    else if (w.fire === 'icicle') { G.proj.push({ x: w.i + 0.5, y: 2.9, vx: 0, vy: w.sp, r: 0.3, rot: 0, kind: 'icicle' }); sfx('ice'); }
    else if (w.fire === 'shardRow') { G.proj.push({ x: w.side > 0 ? 0.75 : G.W - 0.75, y: w.i + 0.5, vx: w.side * w.sp, vy: 0, r: 0.3, rot: 0, kind: 'shard' }); sfx('ice'); }
    else if (w.fire === 'gearProj') { G.proj.push({ x: w.i + 0.5, y: 2.9, vy: w.sp, r: 0.38, rot: 0, kind: 'gear' }); sfx('boost'); }
    else if (w.fire === 'swordRow') { G.proj.push({ x: w.side > 0 ? 0.75 : G.W - 0.75, y: w.i + 0.5, vx: w.side * w.sp, vy: 0, r: 0.3, rot: 0, kind: 'sword' }); sfx('whoosh'); }
    else if (w.fire === 'chandelier') { G.proj.push({ x: w.i + 0.5, y: 2.9, vx: 0, vy: w.sp, r: 0.36, rot: 0, kind: 'chandelier' }); sfx('boost'); }
    else if (w.fire === 'press') { G.beams.push({ k: 'row', i: w.i, t: 0, dur: 0.55, kind: 'press' }); G.shake = Math.max(G.shake, 0.6); sfx('bump', 1); }
    else if (w.fire === 'jetRow') { G.proj.push({ x: w.side > 0 ? 0.75 : G.W - 0.75, y: w.i + 0.5, vx: w.side * w.sp, vy: 0, r: 0.32, rot: 0, kind: 'jet' }); sfx('whoosh'); }
    else if (w.fire === 'anchor') { G.proj.push({ x: w.i + 0.5, y: 2.9, vx: 0, vy: w.sp, r: 0.34, rot: 0, kind: 'anchor' }); sfx('boost'); }
    else if (w.fire === 'invert') { G.invT = 4.5; floatText('Commandes inversées !', G.milo.px, G.milo.py - 0.8, '#ff7ae0', true); vibrate([15, 30, 15]); hud(); }
    else if (w.fire === 'frost' || w.fire === 'magma' || w.fire === 'tentacle' || w.fire === 'curse') { G.beams.push({ k: 'row', i: w.i, t: 0, dur: 0.6, kind: w.fire }); G.shake = Math.max(G.shake, 0.5); sfx(w.fire === 'frost' ? 'ice' : 'lava'); }
    else if (w.fire === 'flood') { G.beams.push({ k: 'rows', i: w.i, t: 0, dur: 2.2, kind: w.bk || 'flood' }); if (w.bk === 'voidf') sfx('boo'); G.shake = Math.max(G.shake, 0.7); sfx('lava'); }
    else if (w.fire === 'sand') { G.beams.push({ k: 'row', i: w.i, t: 0, dur: 0.6, kind: 'sand' }); G.shake = Math.max(G.shake, 0.5); sfx('crumble'); }
    else if (w.fire === 'quake') { G.beams.push({ k: 'row', i: w.i, t: 0, dur: 0.55, kind: 'quake' }); G.shake = Math.max(G.shake, 0.6); sfx('bump', 1); }
    else { G.beams.push({ k: w.k, i: w.i, t: 0, dur: 0.5, kind: 'laser' }); noise({ d: 0.35, v: 0.05, f: 2200, f2: 6000, type: 'bandpass' }); }
  }
  function spawnBots() {
    const look = { spirit: 'wisp', pharaoh: 'scarab', titan: 'snow', golem: 'ember', leviathan: 'fish', entity: 'void', king: 'ghostb', prism: 'gem', nexus: 'void' }[G.boss.kind] || null, sp = look === 'wisp' || look === 'void' ? 1.9 : look === 'snow' || look === 'gem' ? 2.0 : look === 'fish' ? 2.4 : 2.2;
    [[1, 3], [G.W - 2, 3]].forEach(([x, y]) => G.ents.push({ i: G.ents.length, t: 'chaser', bot: true, look, a: [x, y], ex: x, ey: y, alive: true, home: [x, y], tx: x, ty: y, fx: x, fy: y, k: 0, anim: 0, chase: true, eyes: 0, on: false, sp, r: 99 }));
    G.ents.forEach((e) => { if (e.bot) floatText('!', e.fx, e.fy - 0.7, '#ff3d7f'); });
  }
  function updBoss(dt) {
    const b = G.boss; b.hitT = Math.max(0, b.hitT - dt); b.eye = Math.max(0, b.eye - dt);
    if (b.dead) { b.deadT += dt; return; }
    if (G.state !== 'play') return;
    const ph = bossPhase(b);
    if (ph !== b.phase) { b.phase = ph; const PP = BOSSDEF[b.kind].ph[ph]; floatText(ph === 1 ? 'Il s’énerve !' : 'Dernière phase !', G.W / 2 - 0.5, 4.2, BOSSDEF[b.kind].color, true); G.shake = 0.8; sfx('fail'); if (PP.bots) spawnBots();
      if (PP.dark) { if (!G.dark) { G.light = 11; floatText(b.kind === 'leviathan' ? 'L’encre envahit l’eau…' : b.kind === 'king' ? 'Les chandelles s’éteignent…' : b.kind === 'prism' ? 'Les cristaux s’éteignent…' : b.kind === 'nexus' ? 'Le néant dévore la lumière…' : 'La forêt s’assombrit…', G.W / 2 - 0.5, 5.3, b.kind === 'leviathan' ? '#7af6e0' : b.kind === 'king' ? '#8dffb8' : b.kind === 'prism' ? '#e0d0ff' : b.kind === 'nexus' ? '#ff9df5' : '#b6ff5e'); } G.dark = PP.dark; } }
    if (b.calm > 0) { b.calm -= dt; return; }
    b.next -= dt * G.slowK; if (b.next <= 0) { bossAttack(b); b.next = BOSSDEF[b.kind].ph[b.phase].every; }
  }
  function bossHit() {
    const b = G.boss, t = b.targets[b.ti]; b.hp--; b.ti++; b.hitT = 0.6; b.calm = 1.1; G.warns.length = 0; G.shake = 0.9; vibrate(35);
    sfx('shieldHit'); setTimeout(() => sfx('star', 2), 120); G.zap = { x: t[0] + 0.5, y: t[1] + 0.5, t: 0 };
    fxBurst(G.W / 2, 1.7, ['#ffffff', BOSSDEF[b.kind].color, '#ffd84d'], 34, 6); hud();
    if (b.hp <= 0) {
      b.dead = true; b.deadT = 0; G.proj.length = 0; G.beams.length = 0; G.ents = G.ents.filter((e) => !e.bot);
      const fin = WORLDS[G.wi].id === 'finale'; floatText(fin ? 'Le Néant est vaincu !' : 'Boss vaincu !', G.W / 2 - 0.5, 4.5, '#ffd84d', true); sfx('win'); try { api.fx.confetti(fin ? 160 : 90); } catch (e) {}
      setTimeout(() => { if (G && G.boss && G.state === 'play') win(); }, 1700);
    } else floatText(`${b.hp} / ${b.max}`, t[0], t[1] - 0.7, '#ffd84d', true);
  }

  /* ---------- Particules, traînée, textes ---------- */
  const maxParts = () => (UI.lowfx ? 70 : 260);
  function addPart(p) { if (G.parts.length < maxParts()) G.parts.push(p); }
  function fxBurst(x, y, cols, n, sp) { if (UI.lowfx) n = Math.ceil(n / 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random()); addPart({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 4, life: 0.5 + Math.random() * 0.5, t: 0, s: 0.07 + Math.random() * 0.08, c: cols[i % cols.length], sq: Math.random() < 0.5 }); } }
  function fxCoin(x, y) { for (let i = 0; i < (UI.lowfx ? 2 : 5); i++) { const a = Math.random() * Math.PI * 2; addPart({ x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 1, g: 2, life: 0.35, t: 0, s: 0.06, c: i % 2 ? '#fff6c2' : '#ffd84d', sq: true }); } addPart({ x, y, ring: 1, life: 0.3, t: 0, c: '#ffe680' }); }
  function fxImpact(x, y, d) { const px = DIRS[d][1], py = -DIRS[d][0]; for (let i = 0; i < (UI.lowfx ? 3 : 8); i++) { const s = (Math.random() - 0.5) * 2; addPart({ x, y, vx: px * s * 3 - DIRS[d][0] * Math.random() * 2, vy: py * s * 3 - DIRS[d][1] * Math.random() * 2, g: 3, life: 0.3 + Math.random() * 0.2, t: 0, s: 0.05 + Math.random() * 0.05, c: i % 2 ? G.pal.edge : '#ffffff', sq: true }); } }
  function fxTeleport(x, y) { for (let i = 0; i < (UI.lowfx ? 5 : 16); i++) addPart({ x: x + 0.5 + (Math.random() - 0.5) * 0.7, y: y + 0.9, vx: 0, vy: -2 - Math.random() * 3, g: 0, life: 0.5 + Math.random() * 0.3, t: 0, s: 0.05 + Math.random() * 0.06, c: i % 2 ? '#e05cff' : '#ffffff', sq: true }); addPart({ x: x + 0.5, y: y + 0.5, ring: 1, life: 0.4, t: 0, c: '#e05cff' }); }
  function floatText(text, x, y, color, big) { G.texts.push({ text, x: x + 0.5, y: y + 0.5, t: 0, color, big }); }
  function updParts(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.t += dt; if (p.t >= p.life) { G.parts.splice(i, 1); continue; } if (!p.ring) { p.vy += (p.g || 0) * dt; p.vx *= 0.97; p.x += p.vx * dt; p.y += p.vy * dt; } }
    for (let i = G.texts.length - 1; i >= 0; i--) { const t = G.texts[i]; t.t += dt; if (t.t > 1) G.texts.splice(i, 1); }
  }
  function updTrail(dt) {
    const m = G.milo, now = G.time + G.endT;
    if (m.moving) {
      if (G.trailBreak) { G.trail.push({ br: true }); G.trailBreak = false; }
      G.trail.push({ x: m.px + 0.5, y: m.py + 0.5, t: now, sp: m.sp });
      const tr = skinById(data().skin).trail;
      if (!UI.lowfx && Math.random() < dt * (m.sp * 1.6)) {
        const kind = tr.kind, j = (Math.random() - 0.5) * 0.5, perp = m.d % 2 === 0 ? [j, 0] : [0, j];
        const col = kind === 'rainbow' ? `hsl(${(now * 360) % 360},100%,72%)` : Math.random() < 0.5 ? tr.p : tr.a;
        addPart({ x: m.px + 0.5 + perp[0] - DIRS[m.d][0] * 0.4, y: m.py + 0.5 + perp[1] - DIRS[m.d][1] * 0.4, vx: -DIRS[m.d][0] * 1.5 + (Math.random() - 0.5), vy: -DIRS[m.d][1] * 1.5 + (Math.random() - 0.5) + (kind === 'snow' ? 0.6 : kind === 'ember' ? -0.8 : 0), g: 0, life: 0.35 + Math.random() * 0.3, t: 0, s: kind === 'star' ? 0.1 : 0.05 + Math.random() * 0.04, c: col, star: kind === 'star', sq: kind !== 'snow' && kind !== 'ember' });
      }
    }
    while (G.trail.length && (G.trail[0].br || now - G.trail[0].t > 0.24)) G.trail.shift();
    if (G.trail.length > 60) G.trail.splice(0, G.trail.length - 60);
  }

  /* =====================================================================
     RENDU
     ===================================================================== */
  // Pré-rendu des murs/sol par blocs de 12 rangées (pixel art néon)
  const CH = 12, P = 8;
  function buildChunks() {
    UI.chunks = []; if (!G) return;
    const cs = UI.cs, d = UI.dpr, ps = (cs * d) / P, pal = G.pal, W = G.W, deco = WORLDS[G.wi].deco;
    const isW = (x, y) => { const c = cell(x, y); return c === '#' || (c === 'H' && !G.rev.has(y * W + x)); };
    for (let c0 = 0; c0 < G.H; c0 += CH) {
      const rows = Math.min(CH, G.H - c0), k = document.createElement('canvas'); k.width = Math.ceil(W * cs * d); k.height = Math.ceil(rows * cs * d); const c = k.getContext('2d');
      c.imageSmoothingEnabled = false;
      const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.floor(x * ps), Math.floor(y * ps), Math.ceil(w * ps), Math.ceil(h * ps)); };
      for (let ty = c0; ty < c0 + rows; ty++) for (let tx = 0; tx < W; tx++) {
        const ox = tx * P, oy = (ty - c0) * P;
        if (!isW(tx, ty)) {
          R(ox, oy, P, P, (tx + ty) % 2 ? pal.floor : pal.floor2);
          if (hash(tx, ty, 2) < 0.35) R(ox + Math.floor(hash(tx, ty, 4) * 7), oy + Math.floor(hash(tx, ty, 6) * 7), 1, 1, hexA(pal.mote, 0.12));
          if (isW(tx, ty - 1)) R(ox, oy, P, 2, 'rgba(0,0,0,.35)');
          if (isW(tx - 1, ty)) R(ox, oy, 1, P, 'rgba(0,0,0,.25)'); if (isW(tx + 1, ty)) R(ox + P - 1, oy, 1, P, 'rgba(0,0,0,.25)');
          continue;
        }
        let near = false; for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if ((xx || yy) && !isW(tx + xx, ty + yy) && cell(tx + xx, ty + yy) !== undefined && tx + xx >= 0 && tx + xx < W && ty + yy >= 0 && ty + yy < G.H) near = true;
        if (!near) { R(ox, oy, P, P, pal.deep); if (hash(tx, ty, 7) < 0.3) R(ox + 2 + Math.floor(hash(tx, ty, 8) * 4), oy + 2 + Math.floor(hash(tx, ty, 1) * 4), 1, 1, hexA(pal.edge, 0.12)); continue; }
        // briques
        for (let by = 0; by < 4; by++) for (let bx = -1; bx < 3; bx++) {
          const off = (by + ty) % 2 ? 2 : 0, x0 = ox + bx * 4 + off, w0 = 4, hv = hash(tx * 4 + bx, ty * 4 + by, 11);
          const xa = Math.max(ox, x0), xb = Math.min(ox + P, x0 + w0); if (xb <= xa) continue;
          R(xa, oy + by * 2, xb - xa, 2, hv < 0.33 ? pal.wall : hv < 0.75 ? pal.wall2 : pal.face);
          R(xa, oy + by * 2 + 1, xb - xa, 1, 'rgba(0,0,0,.18)');
          if (x0 >= ox && x0 < ox + P) R(x0, oy + by * 2, 1, 2, 'rgba(0,0,0,.28)');
        }
        if (!isW(tx, ty + 1)) R(ox, oy + P - 2, P, 2, pal.face);
        if (!isW(tx, ty - 1)) R(ox, oy, P, 1, hexA('#ffffff', 0.18));
        // mur fissuré : indice discret d'un passage secret
        if (cell(tx, ty) === 'H') { R(ox + 3, oy + 1, 1, 2, 'rgba(0,0,0,.6)'); R(ox + 4, oy + 3, 1, 2, 'rgba(0,0,0,.6)'); R(ox + 3, oy + 5, 1, 2, 'rgba(0,0,0,.6)'); R(ox + 5, oy + 2, 1, 1, hexA(pal.edge, 0.55)); R(ox + 2, oy + 4, 1, 1, hexA(pal.edge, 0.35)); }
      }
      // contours néon (lueur)
      c.save(); c.strokeStyle = pal.edge; c.lineWidth = Math.max(1, ps); c.lineCap = 'square';
      if (!UI.lowfx) { c.shadowColor = pal.glow; c.shadowBlur = ps * 3; }
      c.beginPath();
      for (let ty = c0; ty < c0 + rows; ty++) for (let tx = 0; tx < W; tx++) {
        if (!isW(tx, ty)) continue; const x0 = tx * cs * d, y0 = (ty - c0) * cs * d, s = cs * d, h = ps / 2;
        if (!isW(tx, ty - 1) && ty - 1 >= 0) { c.moveTo(x0, y0 + h); c.lineTo(x0 + s, y0 + h); }
        if (!isW(tx, ty + 1) && ty + 1 < G.H) { c.moveTo(x0, y0 + s - h); c.lineTo(x0 + s, y0 + s - h); }
        if (!isW(tx - 1, ty) && tx - 1 >= 0) { c.moveTo(x0 + h, y0); c.lineTo(x0 + h, y0 + s); }
        if (!isW(tx + 1, ty) && tx + 1 < W) { c.moveTo(x0 + s - h, y0); c.lineTo(x0 + s - h, y0 + s); }
      }
      c.stroke(); c.restore();
      // décor propre au monde
      for (let ty = c0; ty < c0 + rows; ty++) for (let tx = 0; tx < W; tx++) {
        const ox = tx * P, oy = (ty - c0) * P, h = hash(tx, ty, 13);
        if (deco === 'vine' && isW(tx, ty) && !isW(tx, ty + 1) && ty + 1 < G.H && h < 0.22) { const L = 2 + Math.floor(h * 20) % 4, vx = ox + 1 + Math.floor(hash(tx, ty, 14) * 5); for (let i = 0; i < L; i++) R(vx + (i % 2), oy + P + i, 1, 1, i % 3 ? '#3fae6a' : '#6fe39a'); R(vx + 1, oy + P + L - 1, 2, 1, '#2f8a52'); }
        if (deco === 'bolts' && isW(tx, ty) && h < 0.16) { R(ox + 1, oy + 1, 1, 1, '#c8d0dc'); R(ox + 6, oy + 1, 1, 1, '#c8d0dc'); R(ox + 1, oy + 6, 1, 1, '#8a929e'); R(ox + 6, oy + 6, 1, 1, '#8a929e'); }
        if (deco === 'bolts' && isW(tx, ty) && h > 0.9 && (!isW(tx, ty + 1) || !isW(tx, ty - 1))) { R(ox, oy + 3, P, 2, '#3a4048'); R(ox, oy + 3, P, 1, '#6a7480'); }
        if (deco === 'bolts' && !isW(tx, ty) && isW(tx, ty + 1) && ty + 1 < G.H && h < 0.12) for (let i = 0; i < 4; i++) R(ox + i * 2, oy + P - 1, 1, 1, i % 2 ? '#1a1d24' : '#ffb44a');
        if (deco === 'banner' && isW(tx, ty) && !isW(tx, ty + 1) && ty + 1 < G.H && h < 0.1) { const bx = ox + 2; R(bx, oy + P, 4, 4, '#8a1a3a'); R(bx, oy + P, 4, 1, '#ffd45e'); R(bx + 1, oy + P + 4, 2, 1, '#8a1a3a'); R(bx + 1, oy + P + 2, 2, 1, '#ffd45e'); }
        if (deco === 'banner' && isW(tx, ty) && h > 0.93) { R(ox + 3, oy + 2, 2, 3, hexA('#8dffb8', 0.35)); }
        if (deco === 'coral' && isW(tx, ty) && !isW(tx, ty - 1) && ty - 1 >= 0 && h < 0.3) { const cx = ox + 1 + Math.floor(hash(tx, ty, 18) * 5), col = h < 0.12 ? '#ff8aa8' : h < 0.22 ? '#ffb06b' : '#c78aff'; R(cx, oy - 2, 1, 2, col); R(cx - 1, oy - 3, 1, 1, col); R(cx + 1, oy - 3, 1, 2, col); R(cx + 2, oy - 4, 1, 1, hexA(col, 0.8)); }
        if (deco === 'coral' && !isW(tx, ty) && isW(tx, ty + 1) && ty + 1 < G.H && h < 0.14) { const vx = ox + 1 + Math.floor(hash(tx, ty, 19) * 5); for (let i = 0; i < 4; i++) R(vx + (i % 2), oy + P - 1 - i, 1, 1, i % 2 ? '#2fae7a' : '#4fd89a'); }
        if (deco === 'coral' && !isW(tx, ty) && h > 0.9) R(ox + 2 + Math.floor(h * 30) % 4, oy + 6, 1, 1, hexA('#ffe9b0', 0.25));
        if (deco === 'frost' && isW(tx, ty) && !isW(tx, ty - 1) && ty - 1 >= 0) { R(ox, oy, P, 1, '#f4fbff'); if (h < 0.5) R(ox + Math.floor(h * 10) % 6, oy + 1, 2, 1, '#dff4ff'); }
        if (deco === 'frost' && isW(tx, ty) && !isW(tx, ty + 1) && ty + 1 < G.H && h < 0.3) { const vx = ox + 1 + Math.floor(hash(tx, ty, 14) * 5), L = 2 + Math.floor(h * 20) % 3; for (let i = 0; i < L; i++) R(vx, oy + P + i, i < L - 1 ? 2 : 1, 1, i ? '#cfefff' : '#ffffff'); }
        if (deco === 'frost' && !isW(tx, ty) && h < 0.06) R(ox + 2 + Math.floor(h * 60) % 4, oy + 3, 1, 1, '#ffffff');
        if (deco === 'ember' && isW(tx, ty) && h < 0.12 && (!isW(tx - 1, ty) || !isW(tx + 1, ty) || !isW(tx, ty - 1) || !isW(tx, ty + 1))) { const cx = ox + 1 + Math.floor(hash(tx, ty, 16) * 4), cy = oy + 1 + Math.floor(hash(tx, ty, 17) * 3); R(cx, cy, 1, 1, hexA('#ffb03a', 0.9)); R(cx + 1, cy + 1, 1, 1, hexA('#ff7a1a', 0.85)); R(cx + 1, cy + 2, 1, 1, hexA('#ff5a1f', 0.7)); R(cx + 2, cy + 3, 1, 1, hexA('#ff5a1f', 0.5)); }
        if (deco === 'ember' && !isW(tx, ty) && h < 0.1) R(ox + 2 + Math.floor(h * 40) % 4, oy + 5, 1, 1, '#ff9a4a');
        if (deco === 'roots' && isW(tx, ty) && !isW(tx, ty + 1) && ty + 1 < G.H && h < 0.26) { const L = 2 + Math.floor(h * 30) % 4, vx = ox + 1 + Math.floor(hash(tx, ty, 14) * 5); for (let i = 0; i < L; i++) R(vx + (i > 1 ? 1 : 0), oy + P + i, 1, 1, i % 2 ? '#5a3a1c' : '#7a5228'); }
        if (deco === 'roots' && isW(tx, ty) && !isW(tx, ty - 1) && ty - 1 >= 0 && h > 0.68) { const mx = ox + Math.floor(hash(tx, ty, 15) * 5); R(mx, oy, 3, 1, '#3ee08a'); R(mx + 1, oy - 1, 1, 1, '#9dffb0'); }
        if (deco === 'glyph' && isW(tx, ty) && h < 0.1) { R(ox + 2, oy + 2, 4, 4, hexA(pal.edge, 0.5)); R(ox + 3, oy + 3, 2, 2, pal.deep); }
        if (deco === 'crystal' && isW(tx, ty) && !isW(tx, ty - 1) && ty - 1 >= 0 && h < 0.2) { const col = h < 0.1 ? '#ff7ae0' : '#5ee7ff'; R(ox + 3, oy - 3, 2, 3, col); R(ox + 2, oy - 1, 1, 1, col); R(ox + 5, oy - 2, 1, 2, col); R(ox + 3, oy - 3, 1, 1, '#ffffff'); }
        if (deco === 'crystal' && !isW(tx, ty) && h < 0.08) R(ox + 4, oy + 4, 1, 1, '#ffffff');
        if (deco === 'gems' && isW(tx, ty) && !isW(tx, ty - 1) && ty - 1 >= 0 && h < 0.24) { const col = ['#b48cff', '#5ef2ff', '#ff9de9'][Math.floor(hash(tx, ty, 22) * 3)], bx = ox + 1 + Math.floor(hash(tx, ty, 23) * 4); R(bx, oy - 2, 1, 2, hexA(col, 0.85)); R(bx + 1, oy - 4, 2, 4, col); R(bx + 1, oy - 4, 1, 1, '#ffffff'); R(bx + 3, oy - 2, 1, 2, hexA(col, 0.7)); }
        if (deco === 'gems' && isW(tx, ty) && h > 0.9) { R(ox + 3, oy + 3, 2, 2, hexA('#5ef2ff', 0.55)); R(ox + 3, oy + 3, 1, 1, '#ffffff'); }
        if (deco === 'gems' && !isW(tx, ty) && h < 0.05) R(ox + 2 + Math.floor(h * 80) % 4, oy + 2 + Math.floor(h * 120) % 4, 1, 1, '#ffd0ff');
        if (deco === 'glitch' && isW(tx, ty) && h < 0.1) { const yy = oy + 1 + Math.floor(hash(tx, ty, 24) * 6); R(ox, yy, P, 1, hexA('#ff3df0', 0.5)); R(ox + 1, yy, P - 1, 1, hexA('#5ee7ff', 0.35)); }
        if (deco === 'glitch' && isW(tx, ty) && h > 0.94) for (let i = 0; i < 3; i++) R(ox + 1 + Math.floor(hash(tx, ty, 25 + i) * 6), oy + 1 + Math.floor(hash(tx, ty, 28 + i) * 6), 1, 1, hexA('#ffffff', 0.5));
        if (deco === 'glitch' && !isW(tx, ty) && h < 0.04) R(ox + Math.floor(h * 150) % 7, oy + Math.floor(h * 200) % 7, 1, 1, hexA('#ffd84d', 0.45));
        if (deco === 'sun' && isW(tx, ty) && h < 0.09) { R(ox + 3, oy + 3, 2, 2, pal.accent); R(ox + 3, oy + 1, 2, 1, hexA(pal.accent, 0.6)); R(ox + 3, oy + 6, 2, 1, hexA(pal.accent, 0.6)); R(ox + 1, oy + 3, 1, 2, hexA(pal.accent, 0.6)); R(ox + 6, oy + 3, 1, 2, hexA(pal.accent, 0.6)); }
      }
      UI.chunks.push(k);
    }
  }
  function drawBg(c, w, h, t) {
    const pal = G.pal, g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, pal.bg1); g.addColorStop(1, pal.bg2); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const cs = UI.cs, n = UI.lowfx ? 12 : 34;
    for (let i = 0; i < n; i++) { const sx = (hash(i, 1, 21) * w), par = 0.25 + hash(i, 2, 21) * 0.4, sy = ((hash(i, 3, 21) * h * 1.5 - G.cam * cs * par) % (h * 1.5) + h * 1.5) % (h * 1.5) - h * 0.25, s = 1 + Math.floor(hash(i, 4, 21) * 3), a = 0.25 + 0.35 * Math.sin(t * (0.6 + hash(i, 5, 21)) + i);
      c.fillStyle = hexA(pal.mote, Math.max(0, a)); c.fillRect(Math.floor(sx), Math.floor(sy), s, s); }
  }
  function draw(dt) {
    if (!ctx || !G) return;
    const c = ctx, cs = UI.cs, d = UI.dpr, W = UI.vw, H = UI.vh, T = G.time + G.endT, now = performance.now() / 1000;
    c.setTransform(d, 0, 0, d, 0, 0); c.imageSmoothingEnabled = false;
    drawBg(c, W, H, now);
    let sx = 0, sy = 0; if (G.shake > 0.01 && !UI.lowfx) { sx = (Math.random() - 0.5) * G.shake * 6; sy = (Math.random() - 0.5) * G.shake * 6; }
    const ox = UI.ox + sx, oy = -G.cam * cs + sy;
    c.save(); c.translate(ox, oy);
    // halo du labyrinthe
    const r0 = Math.max(0, Math.floor(G.cam) - 1), r1 = Math.min(G.H, Math.ceil(G.cam + H / cs) + 1);
    for (let i = Math.floor(r0 / CH); i * CH < r1; i++) { const k = UI.chunks[i]; if (k) c.drawImage(k, 0, i * CH * cs, G.W * cs, (k.height / d)); }
    c.imageSmoothingEnabled = true;
    // torches
    G.torches.forEach((tc) => { if (tc.y < r0 - 1 || tc.y > r1) return; const x = tc.x * cs + cs / 2, y = (tc.y + 1) * cs - cs * 0.15, f = 0.8 + Math.sin(now * 12 + tc.h * 40) * 0.15 + Math.sin(now * 7.3 + tc.h * 9) * 0.1;
      const rg = c.createRadialGradient(x, y, 0, x, y, cs * 1.4); rg.addColorStop(0, hexA(WORLDS[G.wi].deco === 'sun' ? '#ffb340' : WORLDS[G.wi].deco === 'ember' ? '#ff5a1f' : WORLDS[G.wi].deco === 'banner' ? '#3fe08a' : '#ffa53d', 0.32 * f)); rg.addColorStop(1, 'rgba(255,150,40,0)'); c.fillStyle = rg; c.fillRect(x - cs * 1.4, y - cs * 1.4, cs * 2.8, cs * 2.8);
      c.fillStyle = WORLDS[G.wi].deco === 'banner' ? '#8dffb8' : '#ffd36b'; c.fillRect(x - cs * 0.07, y - cs * 0.28 * f, cs * 0.14, cs * 0.24 * f); c.fillStyle = WORLDS[G.wi].deco === 'banner' ? '#e8fff0' : '#fff4c2'; c.fillRect(x - cs * 0.035, y - cs * 0.18 * f, cs * 0.07, cs * 0.12 * f); c.fillStyle = '#6b3a14'; c.fillRect(x - cs * 0.06, y - cs * 0.04, cs * 0.12, cs * 0.16); });
    // champignons lumineux (Forêt)
    G.shrooms.forEach((sh) => { if (sh.y < r0 - 1 || sh.y > r1) return; const x = sh.x * cs + cs * (0.25 + (sh.h * 4) % 0.5), y = (sh.y + 1) * cs - cs * 0.04, pu = 0.75 + 0.25 * Math.sin(now * 2 + sh.h * 30);
      const rg = c.createRadialGradient(x, y - cs * 0.15, 0, x, y - cs * 0.15, cs * 0.9); rg.addColorStop(0, hexA('#7dffcf', 0.28 * pu)); rg.addColorStop(1, 'rgba(125,255,207,0)'); c.fillStyle = rg; c.fillRect(x - cs * 0.9, y - cs * 1.05, cs * 1.8, cs * 1.8);
      c.fillStyle = '#d8f0e0'; c.fillRect(x - cs * 0.03, y - cs * 0.16, cs * 0.06, cs * 0.16); c.fillStyle = hexA('#5effc0', 0.7 + 0.3 * pu); c.beginPath(); c.ellipse(x, y - cs * 0.17, cs * 0.12, cs * 0.08, 0, Math.PI, 0); c.fill(); });
    // cases spéciales
    for (let y = r0; y < r1; y++) for (let x = 0; x < G.W; x++) {
      const ch = G.grid[y][x]; if (ch === '#' || ch === ' ') continue;
      const px = x * cs, py = y * cs;
      if (ch === '.') { const tw = 0.75 + 0.25 * Math.sin(now * 4 + x * 1.7 + y * 0.9), s = cs * 0.2; c.fillStyle = hexA('#ffd84d', 0.22 * tw); c.fillRect(px + cs / 2 - s, py + cs / 2 - s, s * 2, s * 2); c.fillStyle = '#ffd84d'; c.fillRect(px + cs / 2 - s / 2, py + cs / 2 - s / 2, s, s); c.fillStyle = '#fff6c2'; c.fillRect(px + cs / 2 - s / 2, py + cs / 2 - s / 2, s / 2, s / 2); }
      else if (BONUS[ch]) drawBonus(c, ch, px, py, now);
      else if (ch === 'E') drawExit(c, px, py, now);
      else if (TIMED[ch]) { const t = G.timed.find((q) => q.x === x && q.y === y), st = t ? timedState(t, T) : 'off';
        if (ch === 'i' && !G.seenI.has(t)) { if (st === 'on') { c.globalAlpha = 0.13; drawTimed(c, ch, px, py, st, now); c.globalAlpha = 1; } } else drawTimed(c, ch, px, py, st, now); }
      else if (ch === 'D') drawDoor(c, px, py, G.doors.find((q) => q.x === x && q.y === y));
      else if (ch === 'w') drawPlat(c, px, py, G.doors.find((q) => q.x === x && q.y === y), now);
      else if (ch in BOOSTDIR) drawBoost(c, BOOSTDIR[ch], px, py, now);
      else if (ch >= '1' && ch <= '4') drawPortal(c, ch, px, py, now);
      else if (ch >= '6' && ch <= '9') drawGear(c, ch, px, py, now);
      else if (ch === 'X') drawFake(c, px, py, now);
      else if (ch === 'l' || ch === 'I') drawPrism(c, ch, x, y, px, py, now);
      else if (ch === 'd' || ch === 'f' || ch === 'h') drawVoid(c, ch, px, py, now);
      else if ('gPpoab*KQCFLuUyYnAGr'.includes(ch)) drawMech(c, ch, px, py, now);
      if (ch === 'E' && !G.exitOpen) drawExitLock(c, px, py);
    }
    // blocs gelés
    G.ice.forEach((b) => { if (b.fy < r0 - 1 || b.fy > r1) return; drawIce(c, b.fx * cs, b.fy * cs); });
    if (G.boss) drawBossLayer(c, now);
    // aimant : pièces en vol
    G.flyers.forEach((f) => { c.fillStyle = '#ffd84d'; c.fillRect(f.x * cs - cs * 0.1, f.y * cs - cs * 0.1, cs * 0.2, cs * 0.2); });
    // entités
    G.ents.forEach((e) => { if (e.fy < r0 - 2 || e.fy > r1 + 1) return; drawEnt(c, e, now); });
    // traînée + Milo
    drawTrail(c, now);
    drawMilo(c, now);
    if (G.lava) drawLava(c, now, r1);
    // particules (additif)
    c.globalCompositeOperation = 'lighter';
    G.parts.forEach((p) => { const k = 1 - p.t / p.life; if (p.ring) { c.strokeStyle = hexA(p.c, k * 0.9); c.lineWidth = cs * 0.06; c.beginPath(); c.arc(p.x * cs, p.y * cs, cs * (0.15 + (1 - k) * 0.6), 0, 7); c.stroke(); return; }
      c.fillStyle = p.c.startsWith('#') ? hexA(p.c, k) : p.c; const s = p.s * cs * (0.5 + k * 0.5);
      if (p.star) { c.save(); c.translate(p.x * cs, p.y * cs); c.rotate(p.t * 4); c.fillRect(-s / 2, -s / 6, s, s / 3); c.fillRect(-s / 6, -s / 2, s / 3, s); c.restore(); } else if (p.sq) c.fillRect(p.x * cs - s / 2, p.y * cs - s / 2, s, s); else { c.beginPath(); c.arc(p.x * cs, p.y * cs, s / 2, 0, 7); c.fill(); } });
    c.globalCompositeOperation = 'source-over';
    if (WORLDS[G.wi].deco === 'glitch' && !UI.lowfx && now % 3.7 < 0.14) { const n0 = Math.floor(now / 3.7); for (let i = 0; i < 3; i++) { const yy = (G.cam + hash(n0, i, 31) * (H / cs)) * cs, hh = cs * (0.12 + hash(i, n0, 32) * 0.35), dx = (hash(i, 7, Math.floor(now * 30)) - 0.5) * cs * 0.5; c.fillStyle = hexA(i % 2 ? '#5ee7ff' : '#ff3df0', 0.16); c.fillRect(dx, yy, G.W * cs, hh); } }
    // obscurité (Forêt, phase 2 de l'Esprit) : ce qui doit rester lisible est redessiné par-dessus
    if (G.dark) { c.restore(); drawDark(c, W, H, ox, oy, now); c.save(); c.translate(ox, oy); drawOverDark(c, now); }
    // textes
    G.texts.forEach((t) => { const k = t.t, a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4), y = (t.y - k * 0.9) * cs; c.font = `900 ${Math.round(cs * (t.big ? 0.62 : 0.46))}px system-ui,-apple-system,sans-serif`; c.textAlign = 'center'; c.lineWidth = cs * 0.12; c.strokeStyle = hexA('#14062e', a * 0.9); c.strokeText(t.text, t.x * cs, y); c.fillStyle = t.color.startsWith('#') ? hexA(t.color, a) : t.color; c.fillText(t.text, t.x * cs, y); });
    c.restore();
    // vignette
    if (!UI.lowfx) { if (!UI.vig || UI.vig.w !== W || UI.vig.h !== H) { const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); UI.vig = { w: W, h: H, g }; } c.fillStyle = UI.vig.g; c.fillRect(0, 0, W, H); }
    if (G.bon.slow > 0) { c.fillStyle = 'rgba(120,110,255,.08)'; c.fillRect(0, 0, W, H); }
    if (G.invT > 0) { const a = 0.18 + 0.08 * Math.sin(now * 6); c.strokeStyle = `rgba(255,122,224,${a})`; c.lineWidth = 14; c.strokeRect(0, 0, W, H); }
    if (G.o2Max && G.o2 < G.o2Max * 0.3 && G.state === 'play') { const a = (0.3 - G.o2 / G.o2Max) * 1.2 * (0.6 + 0.4 * Math.sin(now * 8)); c.strokeStyle = `rgba(80,200,255,${a})`; c.lineWidth = 18; c.strokeRect(0, 0, W, H); }
    // lave sous l'écran : le bas de l'écran rougeoie quand elle approche
    if (G.lava) { const below = G.lavaY - (G.cam + H / cs); if (below > -0.5 && below < 10) { const a = 0.55 * (1 - Math.max(0, below) / 10), g = c.createLinearGradient(0, H - H * 0.28, 0, H); g.addColorStop(0, 'rgba(255,90,31,0)'); g.addColorStop(1, `rgba(255,90,31,${a})`); c.fillStyle = g; c.fillRect(0, H - H * 0.28, W, H * 0.28); } }
  }
  function drawDark(c, W, H, ox, oy, now) {
    const cs = UI.cs, q = 0.5, kw = Math.ceil(W * q), kh = Math.ceil(H * q), m = G.milo;
    let k = UI.darkCv; if (!k) k = UI.darkCv = document.createElement('canvas'); if (k.width !== kw || k.height !== kh) { k.width = kw; k.height = kh; }
    const x = k.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, kw, kh); x.fillStyle = G.boss ? 'rgba(2,7,5,.95)' : 'rgba(2,7,5,.9)'; x.fillRect(0, 0, kw, kh);
    x.globalCompositeOperation = 'destination-out';
    const L = [[m.px + 0.5, m.py + 0.5, G.light * (0.97 + 0.03 * Math.sin(now * 9)), 1]], r0 = Math.max(0, Math.floor(G.cam) - 3), r1 = Math.min(G.H, G.cam + H / cs + 3);
    if (G.exit) L.push([G.exit[0] + 0.5, G.exit[1] + 0.5, 2.3, 0.9]);
    for (let y = r0; y < r1; y++) for (let xx = 0; xx < G.W; xx++) { const ch = G.grid[y][xx]; if (ch === 'L') L.push([xx + 0.5, y + 0.5, 1.15, 0.75]); else if (ch === 'l') L.push([xx + 0.5, y + 0.5, G.lit.has(y * G.W + xx) ? 1.6 : 0.75, 0.75]); else if (ch === 'I' && !lightOpen()) L.push([xx + 0.5, y + 0.5, 0.9, 0.6]); else if (ch === 'F') L.push([xx + 0.5, y + 0.5, G.cpOn.has(y * G.W + xx) ? 1.9 : 1.0, 0.8]); else if (ch === '*') L.push([xx + 0.5, y + 0.5, 0.8, 0.55]); }
    G.shrooms.forEach((sh) => { if (sh.y > r0 && sh.y < r1) L.push([sh.x + 0.5, sh.y + 0.85, 1.05, 0.6]); });
    if (G.boss) { L.push([G.W / 2, 1.6, 3.4, 0.85]); const t = !G.boss.dead && G.boss.targets[G.boss.ti]; if (t) L.push([t[0] + 0.5, t[1] + 0.5, 1.7, 0.9]); }
    for (const [lx, ly, r, a] of L) { const sx = (ox + lx * cs) * q, sy = (oy + ly * cs) * q, rr = r * cs * q; if (sx + rr < 0 || sx - rr > kw || sy + rr < 0 || sy - rr > kh) continue;
      const g = x.createRadialGradient(sx, sy, 0, sx, sy, rr); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.5, `rgba(0,0,0,${a * 0.88})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(sx - rr, sy - rr, rr * 2, rr * 2); }
    c.save(); c.setTransform(UI.dpr, 0, 0, UI.dpr, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(k, 0, 0, W, H); c.restore();
  }
  // par-dessus l'obscurité : yeux des ennemis, lucioles autour de Milo, alertes et projectiles du boss
  function drawOverDark(c, now) {
    const cs = UI.cs, m = G.milo;
    G.ents.forEach((e) => { if (e.look === 'wisp') { drawEnt(c, e, now); return; } if (e.t !== 'slime' && e.t !== 'bat' && e.t !== 'chaser') return; const x = (e.fx + 0.5) * cs, y = (e.fy + 0.42) * cs; c.fillStyle = e.t === 'bat' ? '#ff4f7b' : '#ffef9e'; c.globalAlpha = 0.85; c.fillRect(x - cs * 0.16, y, cs * 0.08, cs * 0.06); c.fillRect(x + cs * 0.08, y, cs * 0.08, cs * 0.06); c.globalAlpha = 1; });
    if (G.fly > 0) { const k = Math.min(1, G.fly / 2); for (let i = 0; i < 6; i++) { const a = now * (1.6 + i * 0.13) + i * 1.7, r = 0.55 + 0.25 * Math.sin(now * 2 + i), fx = (m.px + 0.5 + Math.cos(a) * r) * cs, fy = (m.py + 0.45 + Math.sin(a * 1.3) * r * 0.7) * cs; const rg = c.createRadialGradient(fx, fy, 0, fx, fy, cs * 0.22); rg.addColorStop(0, hexA('#f4ff9a', 0.95 * k)); rg.addColorStop(1, 'rgba(216,255,138,0)'); c.fillStyle = rg; c.fillRect(fx - cs * 0.22, fy - cs * 0.22, cs * 0.44, cs * 0.44); } }
    if (G.boss) { drawWarns(c, now); drawProj(c); }
  }
  // grilles, plaques, interrupteurs, barrières, cristaux, clé, relique, coffre, checkpoints, lucioles, dalles, murs de grès
  function drawMech(c, ch, px, py, now) {
    const cs = UI.cs, x = px + cs / 2, y = py + cs / 2, bob = Math.sin(now * 3 + px * 0.1) * cs * 0.06, glow = (col, r, a) => { const g = c.createRadialGradient(x, y + bob, 0, x, y + bob, cs * r); g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0)); c.fillStyle = g; c.fillRect(x - cs * r, y - cs * r + bob, cs * r * 2, cs * r * 2); };
    if (ch === 'g') {
      if (G.gate) { c.fillStyle = 'rgba(255,216,77,.10)'; c.fillRect(px + cs * 0.08, py + cs * 0.08, cs * 0.84, cs * 0.84); return; }
      c.fillStyle = '#1e1206'; c.fillRect(px, py + cs * 0.06, cs, cs * 0.88);
      c.fillStyle = '#c99a3a'; for (let i = 0; i < 4; i++) c.fillRect(px + cs * (0.1 + i * 0.24), py + cs * 0.06, cs * 0.09, cs * 0.88);
      c.fillStyle = '#ffd84d'; c.fillRect(px, py + cs * 0.06, cs, cs * 0.1); c.fillRect(px, py + cs * 0.84, cs, cs * 0.1); return;
    }
    if (ch === 'P' || ch === 'p') {
      const on = ch === 'p'; if (!on) glow('#ffd84d', 0.7, 0.25 + 0.15 * Math.sin(now * 4));
      c.fillStyle = on ? '#5a4410' : '#8a6a1a'; c.fillRect(px + cs * 0.14, py + cs * 0.14, cs * 0.72, cs * 0.72);
      c.fillStyle = on ? '#9a7a24' : '#ffd84d'; c.fillRect(px + cs * 0.22, py + cs * (on ? 0.28 : 0.2), cs * 0.56, cs * 0.5);
      c.fillStyle = on ? '#5a4410' : '#fff3b0'; c.fillRect(px + cs * 0.42, py + cs * 0.36, cs * 0.16, cs * 0.16); return;
    }
    if (ch === 'o') {
      const red = G.tog === 0; glow(red ? '#ff4f6d' : '#4fa8ff', 0.75, 0.35);
      c.fillStyle = '#16102e'; c.beginPath(); c.arc(x, y, cs * 0.34, 0, 7); c.fill();
      c.fillStyle = red ? '#ff4f6d' : '#5a2030'; c.beginPath(); c.arc(x, y, cs * 0.27, Math.PI / 2, Math.PI * 1.5); c.fill();
      c.fillStyle = red ? '#1a3a66' : '#4fa8ff'; c.beginPath(); c.arc(x, y, cs * 0.27, -Math.PI / 2, Math.PI / 2); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = cs * 0.05; c.beginPath(); c.arc(x, y, cs * 0.34, now * 2, now * 2 + 1.6); c.stroke(); return;
    }
    if (ch === 'a' || ch === 'b') {
      const red = ch === 'a', solid = red ? G.tog === 0 : G.tog === 1, col = red ? '#ff4f6d' : '#4fa8ff';
      if (solid) { c.fillStyle = hexA(col, 0.92); c.fillRect(px + cs * 0.04, py + cs * 0.04, cs * 0.92, cs * 0.92); c.fillStyle = hexA('#ffffff', 0.35); c.fillRect(px + cs * 0.04, py + cs * 0.04, cs * 0.92, cs * 0.12);
        c.fillStyle = hexA('#000000', 0.2); for (let i = 0; i < 3; i++) c.fillRect(px + cs * (0.16 + i * 0.28), py + cs * 0.2, cs * 0.1, cs * 0.66); }
      else { c.strokeStyle = hexA(col, 0.5); c.lineWidth = cs * 0.05; c.setLineDash([cs * 0.12, cs * 0.1]); c.strokeRect(px + cs * 0.12, py + cs * 0.12, cs * 0.76, cs * 0.76); c.setLineDash([]); }
      return;
    }
    if (ch === '*') {
      glow('#c77dff', 0.8, 0.45); const s = cs * 0.3, yy = y + bob;
      c.fillStyle = '#9b4dff'; c.beginPath(); c.moveTo(x, yy - s * 1.25); c.lineTo(x + s, yy - s * 0.2); c.lineTo(x, yy + s * 1.2); c.lineTo(x - s, yy - s * 0.2); c.closePath(); c.fill();
      c.fillStyle = '#e2b6ff'; c.beginPath(); c.moveTo(x, yy - s * 1.25); c.lineTo(x + s, yy - s * 0.2); c.lineTo(x, yy); c.closePath(); c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(x - s * 0.35, yy - s * 0.6, s * 0.22, s * 0.22); return;
    }
    if (ch === 'K') {
      glow('#ffd84d', 0.9, 0.5); const yy = y + bob; c.strokeStyle = '#ffd84d'; c.lineWidth = cs * 0.1;
      c.beginPath(); c.arc(x - cs * 0.14, yy, cs * 0.14, 0, 7); c.stroke(); c.fillStyle = '#ffd84d'; c.fillRect(x - cs * 0.02, yy - cs * 0.05, cs * 0.34, cs * 0.1); c.fillRect(x + cs * 0.2, yy, cs * 0.07, cs * 0.14); c.fillRect(x + cs * 0.08, yy, cs * 0.07, cs * 0.1); return;
    }
    if (ch === 'Q') {
      glow('#5ef2ff', 1, 0.5); const yy = y + bob; c.strokeStyle = '#ffd84d'; c.lineWidth = cs * 0.07; c.beginPath(); c.ellipse(x, yy, cs * 0.34, cs * 0.12, now, 0, 7); c.stroke();
      const g = c.createRadialGradient(x - cs * 0.06, yy - cs * 0.06, 0, x, yy, cs * 0.22); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#7af6ff'); g.addColorStop(1, '#1a6a9a'); c.fillStyle = g; c.beginPath(); c.arc(x, yy, cs * 0.22, 0, 7); c.fill(); return;
    }
    if (ch === 'F') {
      const tx = Math.round(px / cs), ty = Math.round(py / cs), on = G.cpOn.has(ty * G.W + tx), cur = on && G.cp && G.cp[0] === tx && G.cp[1] === ty, wv = Math.sin(now * 5 + tx) * cs * 0.04;
      if (on) glow('#9dffb0', 0.9, cur ? 0.5 : 0.3);
      c.fillStyle = '#2a2040'; c.fillRect(px + cs * 0.26, py + cs * 0.8, cs * 0.36, cs * 0.1); c.fillStyle = '#c8c0d8'; c.fillRect(px + cs * 0.36, py + cs * 0.12, cs * 0.06, cs * 0.7);
      c.fillStyle = on ? '#3ee08a' : '#6a6080'; c.beginPath(); c.moveTo(px + cs * 0.42, py + cs * 0.14); c.lineTo(px + cs * 0.82, py + cs * 0.26 + wv); c.lineTo(px + cs * 0.42, py + cs * 0.44); c.fill();
      if (on) { c.fillStyle = '#e9fff0'; c.fillRect(px + cs * 0.5, py + cs * 0.24, cs * 0.08, cs * 0.08); } return;
    }
    if (ch === 'L') {
      glow('#d8ff8a', 0.85, 0.4); const yy = y + bob; c.fillStyle = 'rgba(200,240,255,.22)'; c.fillRect(x - cs * 0.17, yy - cs * 0.2, cs * 0.34, cs * 0.42); c.strokeStyle = 'rgba(220,250,255,.7)'; c.lineWidth = cs * 0.04; c.strokeRect(x - cs * 0.17, yy - cs * 0.2, cs * 0.34, cs * 0.42);
      c.fillStyle = '#8a6a3a'; c.fillRect(x - cs * 0.2, yy - cs * 0.28, cs * 0.4, cs * 0.09);
      for (let i = 0; i < 3; i++) { const a = now * (2 + i) + i * 2.1, fx = x + Math.cos(a) * cs * 0.09, fy = yy + Math.sin(a * 1.4) * cs * 0.1; c.fillStyle = '#f4ff9a'; c.fillRect(fx - cs * 0.03, fy - cs * 0.03, cs * 0.06, cs * 0.06); } return;
    }
    if (ch === 'A') { // poche d'air : bulles qui montent
      glow('#bff8ff', 0.75, 0.3); for (let i = 0; i < 4; i++) { const k = (now * 0.8 + i * 0.25 + px * 0.01) % 1, bx = x + Math.sin(now * 2 + i * 1.7) * cs * 0.14, by = y + cs * 0.35 - k * cs * 0.7, r = cs * (0.06 + (i % 2) * 0.05) * (0.6 + k * 0.5);
        c.strokeStyle = hexA('#e6fdff', 0.9 * (1 - k * 0.6)); c.lineWidth = cs * 0.035; c.beginPath(); c.arc(bx, by, r, 0, 7); c.stroke(); c.fillStyle = hexA('#ffffff', 0.6 * (1 - k)); c.fillRect(bx - r * 0.4, by - r * 0.5, r * 0.3, r * 0.3); }
      c.strokeStyle = 'rgba(191,248,255,.8)'; c.lineWidth = cs * 0.05; c.beginPath(); c.arc(x, y + cs * 0.05, cs * 0.24, 0, 7); c.stroke(); return; }
    if (ch === 'G') { // orbe de gravité
      const r = cs * 0.3; glow('#ff7ae0', 0.9, 0.4); c.save(); c.translate(x, y + bob); c.rotate(now * 1.4);
      for (let i = 0; i < 3; i++) { c.strokeStyle = hexA(i % 2 ? '#5ee7ff' : '#ff7ae0', 0.8); c.lineWidth = cs * 0.05; c.beginPath(); c.ellipse(0, 0, r * 1.1, r * 0.4, (i * Math.PI) / 3, 0, 7); c.stroke(); }
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.6); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#a040ff'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 0.55, 0, 7); c.fill(); c.restore(); return; }
    if (ch === 'r') { // étoile inversée
      glow('#ff7ae0', 0.8, 0.35); c.save(); c.translate(x, y + bob); c.rotate(-now * 2); c.fillStyle = '#ff7ae0'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5, rr = i % 2 ? cs * 0.13 : cs * 0.32; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = cs * 0.045; c.beginPath(); c.moveTo(-cs * 0.12, -cs * 0.04); c.lineTo(cs * 0.12, -cs * 0.04); c.moveTo(cs * 0.12, cs * 0.06); c.lineTo(-cs * 0.12, cs * 0.06); c.stroke(); c.restore(); return; }
    if (ch === 'n') {
      c.fillStyle = '#eaf6ff'; c.beginPath(); c.ellipse(x, y + cs * 0.12, cs * 0.44, cs * 0.3, 0, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x - cs * 0.08, y + cs * 0.02, cs * 0.3, cs * 0.18, 0, 0, 7); c.fill();
      c.fillStyle = '#bcdcf4'; c.fillRect(x - cs * 0.36, y + cs * 0.3, cs * 0.72, cs * 0.06); c.fillStyle = '#ffffff'; if (Math.sin(now * 3 + px) > 0.6) c.fillRect(x + cs * 0.15, y - cs * 0.05, cs * 0.06, cs * 0.06); return;
    }
    if ((ch === 'u' || ch === 'U') && WORLDS[G.wi].deco === 'frost') {
      if (ch === 'U') { c.fillStyle = '#04122a'; c.fillRect(px + cs * 0.04, py + cs * 0.04, cs * 0.92, cs * 0.92); c.fillStyle = hexA('#3a7fc0', 0.4 + 0.2 * Math.sin(now * 2 + px)); c.fillRect(px + cs * 0.18, py + cs * 0.3, cs * 0.64, cs * 0.12); c.fillStyle = '#cfefff'; c.fillRect(px + cs * 0.04, py + cs * 0.04, cs * 0.2, cs * 0.12); c.fillRect(px + cs * 0.7, py + cs * 0.8, cs * 0.22, cs * 0.1); return; }
      const tx = Math.round(px / cs), ty = Math.round(py / cs), on = G.milo.x === tx && G.milo.y === ty, j = on ? (Math.random() - 0.5) * cs * 0.05 : 0;
      c.fillStyle = 'rgba(191,239,255,.45)'; c.fillRect(px + cs * 0.06 + j, py + cs * 0.06, cs * 0.88, cs * 0.88); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(px + cs * 0.06 + j, py + cs * 0.06, cs * 0.88, cs * 0.08);
      c.strokeStyle = '#ffffff'; c.lineWidth = cs * 0.045; c.beginPath(); c.moveTo(px + cs * 0.15 + j, py + cs * 0.25); c.lineTo(px + cs * 0.5 + j, py + cs * 0.5); c.lineTo(px + cs * 0.85 + j, py + cs * 0.3); c.moveTo(px + cs * 0.5 + j, py + cs * 0.5); c.lineTo(px + cs * 0.35 + j, py + cs * 0.88); c.moveTo(px + cs * 0.5 + j, py + cs * 0.5); c.lineTo(px + cs * 0.8 + j, py + cs * 0.82); c.stroke(); return;
    }
    if (ch === 'u') {
      const tx = Math.round(px / cs), ty = Math.round(py / cs), on = G.milo.x === tx && G.milo.y === ty, j = on ? (Math.random() - 0.5) * cs * 0.05 : 0;
      c.fillStyle = '#8a5a26'; c.fillRect(px + cs * 0.06 + j, py + cs * 0.06, cs * 0.88, cs * 0.88); c.fillStyle = '#b07a3a'; c.fillRect(px + cs * 0.06 + j, py + cs * 0.06, cs * 0.88, cs * 0.12);
      c.strokeStyle = '#3a1e08'; c.lineWidth = cs * 0.05; c.beginPath(); c.moveTo(px + cs * 0.2 + j, py + cs * 0.3); c.lineTo(px + cs * 0.45 + j, py + cs * 0.5); c.lineTo(px + cs * 0.38 + j, py + cs * 0.82); c.moveTo(px + cs * 0.45 + j, py + cs * 0.5); c.lineTo(px + cs * 0.8 + j, py + cs * 0.42); c.stroke(); return;
    }
    if (ch === 'U') { c.fillStyle = '#0a0402'; c.fillRect(px + cs * 0.04, py + cs * 0.04, cs * 0.92, cs * 0.92); c.fillStyle = '#3a1e08'; c.fillRect(px + cs * 0.04, py + cs * 0.04, cs * 0.92, cs * 0.12); c.fillStyle = 'rgba(255,190,110,.1)'; c.fillRect(px + cs * 0.22, py + cs * 0.34, cs * 0.56, cs * 0.46); return; }
    if (ch === 'y' || ch === 'Y') {
      const sun = ch === 'y', solid = sun ? G.par === 0 : G.par === 1, col = sun ? '#ffb340' : '#4fd8e0', k = Math.min(1, G.parT * 5), lift = solid ? k : 1 - k;
      c.strokeStyle = hexA(col, 0.5); c.lineWidth = cs * 0.05; c.strokeRect(px + cs * 0.1, py + cs * 0.1, cs * 0.8, cs * 0.8);
      if (lift > 0.02) { const hh = cs * 0.88 * lift; c.fillStyle = '#a0521a'; c.fillRect(px + cs * 0.04, py + cs * 0.94 - hh, cs * 0.92, hh); c.fillStyle = '#c87a34'; c.fillRect(px + cs * 0.04, py + cs * 0.94 - hh, cs * 0.92, Math.min(hh, cs * 0.16)); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(px + cs * 0.04, py + cs * 0.88, cs * 0.92, cs * 0.06); }
      const sy = y - lift * cs * 0.06; c.fillStyle = hexA(col, solid ? 1 : 0.55);
      if (sun) { c.beginPath(); c.arc(x, sy, cs * 0.12, 0, 7); c.fill(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; c.fillRect(x + Math.cos(a) * cs * 0.21 - cs * 0.03, sy + Math.sin(a) * cs * 0.21 - cs * 0.03, cs * 0.06, cs * 0.06); } }
      else { c.beginPath(); c.arc(x, sy, cs * 0.17, 0, 7); c.fill(); c.fillStyle = lift > 0.5 ? '#a0521a' : G.pal.floor; c.beginPath(); c.arc(x + cs * 0.08, sy - cs * 0.05, cs * 0.14, 0, 7); c.fill(); }
      return;
    }
    if (ch === 'C') {
      glow('#ffb340', 0.7, 0.3); c.fillStyle = '#7a3e12'; c.fillRect(px + cs * 0.16, py + cs * 0.32, cs * 0.68, cs * 0.5); c.fillStyle = '#a8561c'; c.fillRect(px + cs * 0.16, py + cs * 0.22, cs * 0.68, cs * 0.22);
      c.fillStyle = '#ffd84d'; c.fillRect(px + cs * 0.16, py + cs * 0.42, cs * 0.68, cs * 0.07); c.fillRect(px + cs * 0.44, py + cs * 0.38, cs * 0.12, cs * 0.18);
    }
  }
  // prisme de lumière « l » (s'allume / s'éteint à chaque passage) et porte de lumière « I »
  function drawPrism(c, ch, tx, ty, px, py, now) {
    const cs = UI.cs, x = px + cs / 2, y = py + cs / 2;
    if (ch === 'I') {
      const n = G.prisms, on = G.lit.size;
      if (lightOpen()) { c.strokeStyle = hexA('#e8fbff', 0.3 + 0.15 * Math.sin(now * 4 + tx)); c.lineWidth = cs * 0.04; c.setLineDash([cs * 0.1, cs * 0.1]); c.strokeRect(px + cs * 0.1, py + cs * 0.1, cs * 0.8, cs * 0.8); c.setLineDash([]); return; }
      const gg = c.createRadialGradient(x, y, 0, x, y, cs * 0.9); gg.addColorStop(0, 'rgba(224,208,255,.35)'); gg.addColorStop(1, 'rgba(180,140,255,0)'); c.fillStyle = gg; c.fillRect(px - cs * 0.4, py - cs * 0.4, cs * 1.8, cs * 1.8);
      c.fillStyle = 'rgba(180,140,255,.3)'; c.fillRect(px, py + cs * 0.04, cs, cs * 0.92);
      for (let i = 0; i < 4; i++) { const a = 0.5 + 0.45 * Math.sin(now * 7 + i * 1.3 + tx + ty); c.fillStyle = hexA(i % 2 ? '#5ef2ff' : '#ffffff', a); c.fillRect(px + cs * (0.12 + i * 0.24), py + cs * 0.06, cs * 0.07, cs * 0.88); }
      c.fillStyle = '#b48cff'; c.fillRect(px, py + cs * 0.02, cs, cs * 0.08); c.fillRect(px, py + cs * 0.9, cs, cs * 0.08);
      for (let i = 0; i < n; i++) { const dx = x + (i - (n - 1) / 2) * cs * 0.27, s = cs * 0.1; c.fillStyle = i < on ? '#ffffff' : '#2a1458'; c.beginPath(); c.moveTo(dx, y - s * 1.1); c.lineTo(dx + s * 1.1, y + s * 0.9); c.lineTo(dx - s * 1.1, y + s * 0.9); c.closePath(); c.fill(); c.strokeStyle = '#e0d0ff'; c.lineWidth = cs * 0.025; c.stroke(); }
      return;
    }
    const lit = G.lit.has(ty * G.W + tx), s = cs * 0.3, bob = lit ? Math.sin(now * 3 + tx) * cs * 0.04 : 0, yy = y - cs * 0.04 + bob;
    if (lit) { const g = c.createRadialGradient(x, yy, 0, x, yy, cs * 1.1); g.addColorStop(0, 'rgba(232,251,255,.6)'); g.addColorStop(1, 'rgba(94,242,255,0)'); c.fillStyle = g; c.fillRect(x - cs * 1.1, yy - cs * 1.1, cs * 2.2, cs * 2.2);
      c.save(); c.translate(x, yy); c.rotate(now * 0.8); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = cs * 0.035; for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, -cs * 0.36); c.lineTo(0, -cs * 0.48); c.stroke(); } c.restore(); }
    // prisme triangulaire sur socle (les cristaux à collectionner restent des losanges)
    c.fillStyle = lit ? '#5a2aa0' : '#1c0c40'; c.fillRect(x - cs * 0.34, y + cs * 0.27, cs * 0.68, cs * 0.1);
    const tri = () => { c.beginPath(); c.moveTo(x, yy - s * 1.15); c.lineTo(x + s * 1.05, yy + s * 0.78); c.lineTo(x - s * 1.05, yy + s * 0.78); c.closePath(); };
    c.fillStyle = lit ? '#f4fdff' : '#3a1e70'; tri(); c.fill();
    c.fillStyle = lit ? '#5ef2ff' : '#5a3a98'; c.beginPath(); c.moveTo(x, yy - s * 1.15); c.lineTo(x + s * 1.05, yy + s * 0.78); c.lineTo(x + s * 0.1, yy + s * 0.78); c.closePath(); c.fill();
    c.strokeStyle = lit ? '#ffffff' : 'rgba(154,122,224,.85)'; c.lineWidth = cs * 0.04; tri(); c.stroke();
    if (!lit && Math.sin(now * 2.2 + tx * 1.7 + ty) > 0.85) { c.fillStyle = 'rgba(224,208,255,.7)'; c.fillRect(x - cs * 0.03, yy - s * 0.6, cs * 0.06, cs * 0.06); }
  }
  // mur du néant : plein quand sa couleur est active, en pointillés sinon ; la prochaine couleur active clignote doucement
  function drawVoid(c, ch, px, py, now) {
    const cs = UI.cs, i = VOIDC.indexOf(ch), col = VCOL[ch], solid = i === G.cyc, prev = i === (G.cyc + 2) % 3, next = i === (G.cyc + 1) % 3, k = Math.min(1, G.cycT * 6), lift = solid ? k : prev ? 1 - k : 0;
    if (lift > 0.02) { const m = cs * 0.44 * (1 - lift), x0 = px + cs * 0.04 + m, y0 = py + cs * 0.04 + m, w = cs * 0.92 - 2 * m;
      c.fillStyle = '#07070d'; c.fillRect(x0, y0, w, w); c.fillStyle = hexA(col, 0.5 * lift); c.fillRect(x0, y0, w, w);
      c.fillStyle = 'rgba(0,0,0,.35)'; for (let j = 0; j < 4; j++) { const sy = py + cs * (0.12 + j * 0.22); if (sy > y0 && sy < y0 + w) c.fillRect(x0, sy, w, cs * 0.05); }
      if (solid && Math.sin(now * 13 + px * 0.7 + py) > 0.95) { c.fillStyle = hexA(col, 0.85); c.fillRect(px + cs * 0.12, py + cs * (0.3 + 0.3 * Math.sin(now * 40)), cs * 0.9, cs * 0.07); } }
    c.strokeStyle = hexA(col, solid ? 0.95 : next ? 0.45 + 0.3 * Math.sin(now * 6) : 0.38); c.lineWidth = cs * (solid ? 0.07 : 0.05); if (!solid) c.setLineDash([cs * 0.1, cs * 0.08]); c.strokeRect(px + cs * 0.08, py + cs * 0.08, cs * 0.84, cs * 0.84); c.setLineDash([]);
    const x = px + cs / 2, y = py + cs / 2, r = cs * 0.12; c.fillStyle = solid ? '#ffffff' : hexA(col, next ? 0.75 : 0.5);
    if (i === 0) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } else if (i === 1) { c.beginPath(); c.moveTo(x, y - r * 1.2); c.lineTo(x + r * 1.15, y + r * 0.85); c.lineTo(x - r * 1.15, y + r * 0.85); c.closePath(); c.fill(); } else c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawExitLock(c, px, py) {
    const cs = UI.cs, left = G.coinsTotal - G.got; c.fillStyle = 'rgba(10,5,30,.72)'; c.fillRect(px + cs * 0.1, py + cs * 0.1, cs * 0.8, cs * 0.8);
    c.fillStyle = '#ffd84d'; c.fillRect(px + cs * 0.32, py + cs * 0.42, cs * 0.36, cs * 0.3); c.strokeStyle = '#ffd84d'; c.lineWidth = cs * 0.07; c.beginPath(); c.arc(px + cs / 2, py + cs * 0.42, cs * 0.12, Math.PI, 0); c.stroke();
    c.font = `900 ${Math.round(cs * 0.3)}px system-ui,sans-serif`; c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.fillText(String(left), px + cs / 2, py + cs * 0.06 + cs * 1.1);
  }
  // boss : alertes, rayons, rochers, cible à activer, créature
  // alertes du boss (au-dessus de l'obscurité quand il fait noir)
  function drawWarns(c, now) {
    const b = G.boss, cs = UI.cs, def = BOSSDEF[b.kind];
    G.warns.forEach((w) => { const k = w.t / w.dur, a = 0.1 + 0.22 * k + 0.08 * Math.sin(now * 20), colr = w.col || def.warn; c.fillStyle = hexA(colr, a);
      if (w.k === 'col') { c.fillRect(w.i * cs, 3 * cs, cs, ((w.end || G.H - 1) - 3) * cs); c.fillStyle = hexA(colr, 0.9); c.beginPath(); c.moveTo(w.i * cs + cs * 0.2, 3 * cs + cs * 0.15); c.lineTo(w.i * cs + cs * 0.8, 3 * cs + cs * 0.15); c.lineTo(w.i * cs + cs / 2, 3 * cs + cs * 0.6); c.fill(); }
      else if (w.k === 'inv') { const a2 = 0.35 + 0.35 * Math.sin(now * 18); c.strokeStyle = hexA('#ff7ae0', a2); c.lineWidth = cs * 0.25; c.strokeRect(cs * 0.9, 2.9 * cs, (G.W - 1.8) * cs, (G.H - 3.8) * cs); }
      else if (w.k === 'flood') { c.fillRect(cs, w.i * cs, (G.W - 2) * cs, (G.H - 1 - w.i) * cs); c.fillStyle = hexA(colr, 0.95); for (let x = 1; x < G.W - 1; x += 2) { c.beginPath(); c.moveTo(x * cs + cs * 0.3, w.i * cs + cs * 0.1); c.lineTo(x * cs + cs * 0.7, w.i * cs + cs * 0.1); c.lineTo(x * cs + cs / 2, w.i * cs - cs * 0.3); c.fill(); } }
      else if (w.side) { const x0 = w.side > 0 ? 1 : w.end + 1, x1 = w.side > 0 ? w.end : G.W - 1; c.fillRect(x0 * cs, w.i * cs, (x1 - x0) * cs, cs); c.fillStyle = hexA(colr, 0.95); const ax = w.side > 0 ? cs * 1.1 : (G.W - 1) * cs - cs * 0.1; c.beginPath(); c.moveTo(ax + w.side * cs * 0.5, w.i * cs + cs / 2); c.lineTo(ax, w.i * cs + cs * 0.2); c.lineTo(ax, w.i * cs + cs * 0.8); c.fill(); }
      else { c.fillRect(cs, w.i * cs, (G.W - 2) * cs, cs); c.fillStyle = hexA(colr, 0.9); c.fillRect(cs * 0.6, w.i * cs + cs * 0.3, cs * 0.25, cs * 0.4); c.fillRect((G.W - 1) * cs + cs * 0.15, w.i * cs + cs * 0.3, cs * 0.25, cs * 0.4); } });
  }
  // projectiles : rochers, graines épineuses, flèches
  function drawProj(c) {
    const cs = UI.cs;
    G.proj.forEach((p) => { const x = p.x * cs, y = p.y * cs, r = p.r * cs;
      if (p.kind === 'arrow') { c.save(); c.translate(x, y); c.rotate(Math.atan2(p.vy || 0, p.vx || 0)); c.fillStyle = '#7a4a1e'; c.fillRect(-cs * 0.42, -cs * 0.04, cs * 0.7, cs * 0.08); c.fillStyle = '#e8e2d0'; c.beginPath(); c.moveTo(cs * 0.42, 0); c.lineTo(cs * 0.24, -cs * 0.12); c.lineTo(cs * 0.24, cs * 0.12); c.fill(); c.fillStyle = '#ff5e5e'; c.fillRect(-cs * 0.46, -cs * 0.11, cs * 0.13, cs * 0.07); c.fillRect(-cs * 0.46, cs * 0.04, cs * 0.13, cs * 0.07); c.restore(); return; }
      if (p.kind === 'gear') { c.save(); c.translate(x, y); c.rotate(p.rot * 1.5); c.fillStyle = '#c8d0dc'; for (let i = 0; i < 10; i++) { c.rotate(Math.PI / 5); c.fillRect(-cs * 0.06, -r * 1.15, cs * 0.12, r * 0.3); } c.beginPath(); c.arc(0, 0, r * 0.9, 0, 7); c.fill(); c.fillStyle = '#4a5260'; c.beginPath(); c.arc(0, 0, r * 0.35, 0, 7); c.fill(); c.restore(); return; }
      if (p.kind === 'sword') { c.save(); c.translate(x, y); c.rotate(Math.atan2(p.vy || 0, p.vx || 0)); c.fillStyle = '#e8eef8'; c.beginPath(); c.moveTo(cs * 0.45, 0); c.lineTo(cs * 0.05, -cs * 0.07); c.lineTo(cs * 0.05, cs * 0.07); c.closePath(); c.fill(); c.fillRect(-cs * 0.15, -cs * 0.05, cs * 0.22, cs * 0.1); c.fillStyle = '#ffd45e'; c.fillRect(-cs * 0.18, -cs * 0.15, cs * 0.06, cs * 0.3); c.fillStyle = '#8a1a3a'; c.fillRect(-cs * 0.36, -cs * 0.04, cs * 0.18, cs * 0.08); c.restore(); return; }
      if (p.kind === 'chandelier') { c.save(); c.translate(x, y); c.strokeStyle = '#ffd45e'; c.lineWidth = cs * 0.06; c.beginPath(); c.moveTo(-cs * 0.36, 0); c.quadraticCurveTo(0, cs * 0.2, cs * 0.36, 0); c.stroke(); c.beginPath(); c.moveTo(0, -cs * 0.3); c.lineTo(0, cs * 0.12); c.stroke();
        [-0.36, 0, 0.36].forEach((dx) => { c.fillStyle = '#fff3e0'; c.fillRect(dx * cs - cs * 0.04, -cs * 0.14 + (dx ? 0 : cs * 0.08), cs * 0.08, cs * 0.14); c.fillStyle = '#8dffb8'; c.beginPath(); c.arc(dx * cs, -cs * 0.2 + (dx ? 0 : cs * 0.08), cs * 0.05, 0, 7); c.fill(); }); c.restore(); return; }
      if (p.kind === 'jet') { c.save(); c.translate(x, y); c.rotate(Math.atan2(p.vy || 0, p.vx || 0)); const g = c.createLinearGradient(-cs * 0.9, 0, cs * 0.35, 0); g.addColorStop(0, 'rgba(191,248,255,0)'); g.addColorStop(1, 'rgba(191,248,255,.95)'); c.fillStyle = g; c.beginPath(); c.ellipse(-cs * 0.25, 0, cs * 0.62, cs * 0.16, 0, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cs * 0.28, 0, cs * 0.12, 0, 7); c.fill(); c.restore(); return; }
      if (p.kind === 'anchor') { c.save(); c.translate(x, y); c.strokeStyle = '#8a9aa8'; c.lineWidth = cs * 0.09; c.beginPath(); c.moveTo(0, -cs * 0.34); c.lineTo(0, cs * 0.3); c.moveTo(-cs * 0.16, -cs * 0.2); c.lineTo(cs * 0.16, -cs * 0.2); c.stroke(); c.beginPath(); c.arc(0, cs * 0.06, cs * 0.26, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); c.fillStyle = '#5a6a78'; c.beginPath(); c.arc(0, -cs * 0.38, cs * 0.07, 0, 7); c.fill(); c.restore(); return; }
      if (p.kind === 'icicle') { c.save(); c.translate(x, y); c.fillStyle = '#e6f7ff'; c.beginPath(); c.moveTo(-cs * 0.16, -cs * 0.4); c.lineTo(cs * 0.16, -cs * 0.4); c.lineTo(0, cs * 0.38); c.closePath(); c.fill(); c.fillStyle = '#8fd8ff'; c.beginPath(); c.moveTo(0, -cs * 0.4); c.lineTo(cs * 0.16, -cs * 0.4); c.lineTo(0, cs * 0.38); c.closePath(); c.fill(); c.restore(); return; }
      if (p.kind === 'shard') { c.save(); c.translate(x, y); c.rotate(Math.atan2(p.vy || 0, p.vx || 0)); c.fillStyle = '#e6f7ff'; c.beginPath(); c.moveTo(cs * 0.42, 0); c.lineTo(-cs * 0.1, -cs * 0.16); c.lineTo(-cs * 0.4, 0); c.lineTo(-cs * 0.1, cs * 0.16); c.closePath(); c.fill(); c.fillStyle = 'rgba(143,216,255,.8)'; c.fillRect(-cs * 0.4, -cs * 0.03, cs * 0.6, cs * 0.06); c.restore(); return; }
      if (p.kind === 'meteor') { const tg = c.createLinearGradient(x, y - cs * 1.2, x, y); tg.addColorStop(0, 'rgba(255,90,31,0)'); tg.addColorStop(1, 'rgba(255,176,58,.8)'); c.fillStyle = tg; c.beginPath(); c.moveTo(x - r * 0.8, y); c.lineTo(x, y - cs * 1.2); c.lineTo(x + r * 0.8, y); c.fill();
        const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#ffe066'); g.addColorStop(0.5, '#a0401a'); g.addColorStop(1, '#3a1208'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); return; }
      if (p.kind === 'seed') { c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x, y + r * 0.9, r * 0.9, r * 0.3, 0, 0, 7); c.fill(); c.save(); c.translate(x, y); c.rotate(Math.sin(p.rot) * 0.4); c.fillStyle = '#8a5a26'; c.beginPath(); c.ellipse(0, r * 0.15, r * 0.75, r * 0.85, 0, 0, 7); c.fill(); c.fillStyle = '#4a7a2a'; c.beginPath(); c.ellipse(0, -r * 0.45, r * 0.85, r * 0.42, 0, 0, 7); c.fill(); c.fillStyle = '#b6ff5e'; for (let i = -1; i <= 1; i++) c.fillRect(i * r * 0.45 - r * 0.07, -r * 0.65, r * 0.14, r * 0.14); c.fillStyle = '#2a1a08'; c.fillRect(-r * 0.06, -r * 1.0, r * 0.12, r * 0.32); c.restore(); return; }
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x, y + r * 0.9, r * 0.9, r * 0.3, 0, 0, 7); c.fill();
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#b9a8d8'); g.addColorStop(1, '#4a3a6a'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(30,15,50,.7)'; c.lineWidth = cs * 0.05; c.beginPath(); c.arc(x, y, r * 0.55, p.rot, p.rot + 2); c.stroke();
    });
  }
  // boss : alertes, rayons, rochers, cible à activer, créature
  function drawBossLayer(c, now) {
    const b = G.boss, cs = UI.cs, def = BOSSDEF[b.kind];
    if (!G.dark) drawWarns(c, now);
    G.beams.forEach((bm) => { const a = 1 - bm.t / bm.dur;
      if (bm.kind === 'shock') { const fa = Math.min(1, bm.t / 0.15, (bm.dur - bm.t) / 0.3); c.fillStyle = hexA('#ffe066', 0.18 * fa); c.fillRect(cs, bm.i * cs, (G.W - 2) * cs, (G.H - 1 - bm.i) * cs); c.strokeStyle = hexA('#fff3b0', 0.9 * fa); c.lineWidth = cs * 0.06;
        for (let yy = bm.i; yy < G.H - 1; yy++) { c.beginPath(); for (let x = 1; x <= G.W - 1; x += 0.5) { const py2 = yy * cs + cs / 2 + (Math.random() - 0.5) * cs * 0.6; if (x === 1) c.moveTo(x * cs, py2); else c.lineTo(x * cs, py2); } c.stroke(); } return; }
      if (bm.kind === 'voidf') { const fa = Math.min(1, bm.t / 0.15, (bm.dur - bm.t) / 0.3); c.fillStyle = hexA('#05000a', 0.82 * fa); c.fillRect(cs, bm.i * cs, (G.W - 2) * cs, (G.H - 1 - bm.i) * cs);
        for (let yy = bm.i; yy < G.H - 1; yy++) for (let x = 1; x < G.W - 1; x++) if (Math.random() < 0.35) { c.fillStyle = hexA(['#ff3df0', '#5ee7ff', '#ffd84d'][(x + yy) % 3], 0.6 * fa); c.fillRect(x * cs + Math.random() * cs * 0.6, yy * cs + Math.random() * cs * 0.85, cs * 0.4, cs * 0.08); }
        c.strokeStyle = hexA('#ff3df0', 0.9 * fa); c.lineWidth = cs * 0.07; c.beginPath(); c.moveTo(cs, bm.i * cs); c.lineTo((G.W - 1) * cs, bm.i * cs); c.stroke(); return; }
      if (bm.kind === 'press') { for (let x = 1; x < G.W - 1; x++) { if (solidAt(x, bm.i)) continue; const px = x * cs, py = bm.i * cs, k = Math.min(1, bm.t / 0.08); c.globalAlpha = a; c.fillStyle = '#8a929e'; c.fillRect(px + cs * 0.06, py - cs * 0.6 * (1 - k), cs * 0.88, cs * 0.9); c.fillStyle = '#ffb44a'; c.fillRect(px + cs * 0.06, py + cs * 0.7 - cs * 0.6 * (1 - k), cs * 0.88, cs * 0.1); c.globalAlpha = 1; } return; }
      if (bm.kind === 'curse') { for (let x = 1; x < G.W - 1; x++) { if (solidAt(x, bm.i)) continue; const px = x * cs + cs / 2, py = bm.i * cs + cs * 0.9, hh = cs * (0.6 + 0.2 * Math.sin(now * 20 + x)), g = c.createLinearGradient(0, py - hh, 0, py); g.addColorStop(0, 'rgba(141,255,184,0)'); g.addColorStop(1, hexA('#8dffb8', 0.9 * a)); c.fillStyle = g; c.beginPath(); c.moveTo(px - cs * 0.3, py); c.quadraticCurveTo(px - cs * 0.2, py - hh * 0.6, px, py - hh); c.quadraticCurveTo(px + cs * 0.2, py - hh * 0.6, px + cs * 0.3, py); c.fill(); } return; }
      if (bm.kind === 'flood') { const fa = Math.min(1, bm.t / 0.2, (bm.dur - bm.t) / 0.4), ly = bm.i * cs + (1 - fa) * cs * 1.5, g = c.createLinearGradient(0, ly, 0, (G.H - 1) * cs); g.addColorStop(0, '#ffb03a'); g.addColorStop(0.3, '#ff5a1f'); g.addColorStop(1, '#8a1a04'); c.fillStyle = g; c.globalAlpha = 0.92;
        c.beginPath(); c.moveTo(cs, (G.H - 1) * cs); for (let x = 4; x <= (G.W - 1) * 4; x++) c.lineTo((x * cs) / 4, ly + Math.sin(now * 4 + x) * cs * 0.07); c.lineTo((G.W - 1) * cs, (G.H - 1) * cs); c.closePath(); c.fill(); c.globalAlpha = 1; return; }
      if (bm.kind === 'tentacle') { const gr = Math.min(1, bm.t / 0.12), y0 = bm.i * cs + cs / 2; c.save(); c.globalAlpha = a; c.strokeStyle = '#3a8a7a'; c.lineWidth = cs * 0.5 * gr; c.lineCap = 'round'; c.beginPath(); for (let x = 1; x <= G.W - 1; x += 0.25) { const yy = y0 + Math.sin(x * 1.6 + now * 8) * cs * 0.12; if (x === 1) c.moveTo(x * cs, yy); else c.lineTo(x * cs, yy); } c.stroke();
        c.strokeStyle = '#7af6e0'; c.lineWidth = cs * 0.12 * gr; c.stroke(); c.fillStyle = '#ffd0e0'; for (let x = 1.5; x < G.W - 1; x += 1) { if (solidAt(Math.floor(x), bm.i)) continue; c.beginPath(); c.arc(x * cs, y0 + Math.sin(x * 1.6 + now * 8) * cs * 0.12 + cs * 0.12, cs * 0.06, 0, 7); c.fill(); } c.restore(); return; }
      if (bm.kind === 'quake' || bm.kind === 'sand' || bm.kind === 'frost' || bm.kind === 'magma') { for (let x = 1; x < G.W - 1; x++) { if (solidAt(x, bm.i)) continue; c.fillStyle = hexA({ sand: '#ffd45e', frost: '#e6f7ff', magma: '#ff5a1f' }[bm.kind] || '#ffb340', a); for (let j = 0; j < 3; j++) { const sx = x * cs + cs * (0.1 + j * 0.3); c.beginPath(); c.moveTo(sx, bm.i * cs + cs * 0.9); c.lineTo(sx + cs * 0.13, bm.i * cs + cs * (0.25 - a * 0.1)); c.lineTo(sx + cs * 0.26, bm.i * cs + cs * 0.9); c.fill(); } } return; }
      if (bm.kind === 'thorn') { const gr = Math.min(1, bm.t / 0.12); for (let x = 1; x < G.W - 1; x++) { if (solidAt(x, bm.i)) continue; const px = x * cs, py = bm.i * cs; c.fillStyle = hexA('#2f6a1e', a); c.fillRect(px, py + cs * 0.66, cs, cs * 0.14); c.fillStyle = hexA('#b6ff5e', a); for (let j = 0; j < 3; j++) { const sx = px + cs * (0.06 + j * 0.32); c.beginPath(); c.moveTo(sx, py + cs * 0.74); c.lineTo(sx + cs * 0.11, py + cs * (0.74 - 0.55 * gr)); c.lineTo(sx + cs * 0.22, py + cs * 0.74); c.fill(); } } return; }
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = hexA(def.color, 0.55 * a); if (!UI.lowfx) { c.shadowColor = def.color; c.shadowBlur = cs * 0.6; }
      if (bm.k === 'row') { c.fillRect(cs, bm.i * cs + cs * 0.22, (G.W - 2) * cs, cs * 0.56); c.fillStyle = hexA('#ffffff', 0.9 * a); c.fillRect(cs, bm.i * cs + cs * 0.42, (G.W - 2) * cs, cs * 0.16); }
      else { c.fillRect(bm.i * cs + cs * 0.22, 3 * cs, cs * 0.56, (G.H - 4) * cs); c.fillStyle = hexA('#ffffff', 0.9 * a); c.fillRect(bm.i * cs + cs * 0.42, 3 * cs, cs * 0.16, (G.H - 4) * cs); }
      c.restore(); });
    if (!G.dark) drawProj(c);
    // cible à activer
    const t = !b.dead && b.targets[b.ti];
    if (t) { const x = (t[0] + 0.5) * cs, y = (t[1] + 0.5) * cs, pu = 0.5 + 0.5 * Math.sin(now * 5), colr = BCOL[b.kind] || '#ffd84d';
      const g = c.createRadialGradient(x, y, 0, x, y, cs * 1.1); g.addColorStop(0, hexA(colr, 0.55)); g.addColorStop(1, hexA(colr, 0)); c.fillStyle = g; c.fillRect(x - cs * 1.1, y - cs * 1.1, cs * 2.2, cs * 2.2);
      c.strokeStyle = colr; c.lineWidth = cs * 0.08; c.beginPath(); c.arc(x, y, cs * (0.3 + pu * 0.1), 0, 7); c.stroke(); c.fillStyle = colr;
      if (b.kind === 'spider') c.fillRect(x - cs * 0.14, y - cs * 0.14, cs * 0.28, cs * 0.28);
      else if (b.kind === 'pharaoh') { c.lineWidth = cs * 0.07; c.beginPath(); c.ellipse(x, y - cs * 0.12, cs * 0.08, cs * 0.1, 0, 0, 7); c.stroke(); c.fillRect(x - cs * 0.04, y - cs * 0.03, cs * 0.08, cs * 0.28); c.fillRect(x - cs * 0.16, y + cs * 0.02, cs * 0.32, cs * 0.07); }
      else if (b.kind === 'machine') { c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c.lineTo(x + Math.cos(a) * cs * 0.22, y + Math.sin(a) * cs * 0.22); } c.closePath(); c.fill(); c.fillStyle = '#1a1d24'; c.beginPath(); c.arc(x, y, cs * 0.09, 0, 7); c.fill(); }
      else if (b.kind === 'king') { c.beginPath(); c.moveTo(x - cs * 0.22, y + cs * 0.14); c.lineTo(x - cs * 0.22, y - cs * 0.12); c.lineTo(x - cs * 0.1, y); c.lineTo(x, y - cs * 0.2); c.lineTo(x + cs * 0.1, y); c.lineTo(x + cs * 0.22, y - cs * 0.12); c.lineTo(x + cs * 0.22, y + cs * 0.14); c.closePath(); c.fill(); }
      else if (b.kind === 'leviathan') { c.lineWidth = cs * 0.06; c.beginPath(); c.moveTo(x, y + cs * 0.24); c.lineTo(x, y - cs * 0.2); [-0.15, 0, 0.15].forEach((dx) => { c.moveTo(x + dx * cs, y - cs * 0.06); c.lineTo(x + dx * cs, y - cs * 0.24); }); c.moveTo(x - cs * 0.15, y - cs * 0.06); c.lineTo(x + cs * 0.15, y - cs * 0.06); c.stroke(); }
      else if (b.kind === 'entity') { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + now, rr = i % 2 ? cs * 0.08 : cs * 0.24; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }
      else if (b.kind === 'prism') { c.beginPath(); c.moveTo(x, y - cs * 0.26); c.lineTo(x + cs * 0.16, y); c.lineTo(x, y + cs * 0.26); c.lineTo(x - cs * 0.16, y); c.closePath(); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(x - cs * 0.04, y - cs * 0.12, cs * 0.08, cs * 0.08); }
      else if (b.kind === 'nexus') { ['#ff3df0', '#5ee7ff', '#ffd84d'].forEach((col, i) => { const a = now * 2 + (i * Math.PI * 2) / 3; c.fillStyle = col; c.beginPath(); c.arc(x + Math.cos(a) * cs * 0.13, y + Math.sin(a) * cs * 0.13, cs * 0.08, 0, 7); c.fill(); }); }
      else if (b.kind === 'titan') { c.lineWidth = cs * 0.06; for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; c.beginPath(); c.moveTo(x - Math.cos(a) * cs * 0.22, y - Math.sin(a) * cs * 0.22); c.lineTo(x + Math.cos(a) * cs * 0.22, y + Math.sin(a) * cs * 0.22); c.stroke(); } }
      else if (b.kind === 'golem') { c.beginPath(); c.moveTo(x, y - cs * 0.24); c.lineTo(x + cs * 0.17, y); c.lineTo(x, y + cs * 0.24); c.lineTo(x - cs * 0.17, y); c.closePath(); c.fill(); c.fillStyle = '#fff3b0'; c.fillRect(x - cs * 0.05, y - cs * 0.05, cs * 0.1, cs * 0.1); }
      else if (b.kind === 'spirit') { c.beginPath(); c.moveTo(x, y - cs * 0.24); c.quadraticCurveTo(x + cs * 0.2, y, x, y + cs * 0.24); c.quadraticCurveTo(x - cs * 0.2, y, x, y - cs * 0.24); c.fill(); c.strokeStyle = '#1e4a1a'; c.lineWidth = cs * 0.03; c.beginPath(); c.moveTo(x, y - cs * 0.2); c.lineTo(x, y + cs * 0.2); c.stroke(); }
      else { c.fillRect(x - cs * 0.05, y - cs * 0.2, cs * 0.1, cs * 0.4); c.fillRect(x - cs * 0.16, y - cs * 0.05, cs * 0.32, cs * 0.1); } }
    if (G.zap) { G.zap.t += 1 / 60; const a = 1 - G.zap.t / 0.4; if (a <= 0) G.zap = null; else { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = hexA(def.color, a); c.lineWidth = cs * 0.18 * a; c.beginPath(); c.moveTo(G.zap.x * cs, G.zap.y * cs); c.lineTo(G.W / 2 * cs, 1.8 * cs); c.stroke(); c.restore(); } }
    drawBoss(c, now);
  }
  function drawBoss(c, now) {
    const b = G.boss, cs = UI.cs, k = b.dead ? Math.max(0, 1 - b.deadT / 1.3) : 1; if (k <= 0) return;
    const EYE = { spider: ['#5ef2ff', '#ffd84d', '#ff4fd8'], guardian: ['#c9a8ff', '#ffb340', '#ff4f6d'], spirit: ['#b6ff5e', '#ffd45e', '#ff5ef0'], pharaoh: ['#5ef2ff', '#ffb340', '#ff4f4f'], titan: ['#8fd8ff', '#ffffff', '#7a8cff'], golem: ['#ffb03a', '#ff5a1f', '#ffe066'], leviathan: ['#7af6e0', '#ffd45e', '#ff5e7a'], entity: ['#5ee7ff', '#ff7ae0', '#ffffff'], machine: ['#ff4f4f', '#ffb44a', '#ffffff'], king: ['#8dffb8', '#ffd45e', '#ff4f6d'], prism: ['#5ef2ff', '#ff9de9', '#ffffff'], nexus: ['#ffd84d', '#ff3df0', '#5ee7ff'] }, eye = EYE[b.kind][b.phase], open = 0.35 + b.eye * 0.9;
    c.save(); c.globalAlpha = k; c.translate((G.W / 2) * cs + (b.hitT > 0 ? (Math.random() - 0.5) * cs * 0.25 : 0), 1.55 * cs + Math.sin(now * 1.7) * cs * 0.07); if (b.dead) c.rotate(Math.sin(b.deadT * 30) * 0.05);
    if (b.kind === 'guardian') {
      const w = cs * 6.2, h = cs * 2.5;
      c.fillStyle = '#2a1b4a'; c.fillRect(-w / 2 - cs * 0.2, -h / 2 + cs * 0.15, w + cs * 0.4, h);
      const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#7a62a8'); g.addColorStop(1, '#3a2a62'); c.fillStyle = g; c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = '#9a84c8'; c.fillRect(-w / 2, -h / 2, w, cs * 0.22); c.fillStyle = '#2a1b4a'; c.fillRect(-w / 2 + cs * 0.6, -cs * 0.55, w - cs * 1.2, cs * 0.16);
      c.fillStyle = '#ffd84d'; [-2.2, -1.1, 1.1, 2.2].forEach((dx) => c.fillRect(dx * cs - cs * 0.08, -h / 2 + cs * 0.35, cs * 0.16, cs * 0.16));
      [-1.35, 1.35].forEach((dx) => { const ex = dx * cs, ey = cs * 0.05; const gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.8); gg.addColorStop(0, hexA(eye, 0.8)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.8, ey - cs * 0.8, cs * 1.6, cs * 1.6); c.fillStyle = eye; c.fillRect(ex - cs * 0.42, ey - cs * 0.22 * open, cs * 0.84, cs * 0.44 * open); c.fillStyle = '#ffffff'; c.fillRect(ex - cs * 0.12, ey - cs * 0.08 * open, cs * 0.24, cs * 0.16 * open); });
      c.fillStyle = '#1a1030'; c.fillRect(-cs * 0.9, cs * 0.62, cs * 1.8, cs * (0.14 + b.eye * 0.3));
      c.strokeStyle = 'rgba(20,10,40,.8)'; c.lineWidth = cs * 0.06; for (let i = 0; i < b.max - b.hp; i++) { const sx = (hash(i, 3, 77) - 0.5) * w * 0.9; c.beginPath(); c.moveTo(sx, -h / 2); c.lineTo(sx + cs * 0.2, -h / 2 + cs * 0.5); c.lineTo(sx - cs * 0.1, -h / 2 + cs * 0.9); c.stroke(); }
    } else if (b.kind === 'spirit') {
      const w = cs * 5.4, h = cs * 2.5, sw = Math.sin(now * 1.3) * 0.08; c.lineCap = 'round';
      [-1, 1].forEach((sd) => { c.strokeStyle = '#3a2412'; c.lineWidth = cs * 0.26; c.beginPath(); c.moveTo(sd * w * 0.26, -h * 0.28); c.quadraticCurveTo(sd * w * 0.46, -h * 0.7, sd * w * 0.6, -h * 0.48 + sw * cs); c.stroke();
        c.lineWidth = cs * 0.15; c.beginPath(); c.moveTo(sd * w * 0.4, -h * 0.55); c.lineTo(sd * w * 0.37, -h * 0.82 + sw * cs); c.moveTo(sd * w * 0.52, -h * 0.58); c.lineTo(sd * w * 0.7, -h * 0.76 - sw * cs); c.stroke();
        [[0.37, -0.82], [0.7, -0.76], [0.6, -0.48]].forEach(([fx, fy], i) => { const lx = sd * w * fx, ly = h * fy + (i % 2 ? -sw : sw) * cs; c.fillStyle = '#2fb86a'; c.fillRect(lx - cs * 0.17, ly - cs * 0.13, cs * 0.34, cs * 0.26); c.fillStyle = '#9dffb0'; c.fillRect(lx - cs * 0.07, ly - cs * 0.13, cs * 0.14, cs * 0.08); }); });
      // racines qui pendent sous le visage
      c.strokeStyle = '#4a2e14'; c.lineWidth = cs * 0.12; for (let i = -2; i <= 2; i++) { const rx = i * cs * 0.42, wv = Math.sin(now * 2 + i) * cs * 0.08; c.beginPath(); c.moveTo(rx, cs * 0.9); c.quadraticCurveTo(rx + wv, cs * 1.25, rx - wv * 0.5, cs * (1.45 - Math.abs(i) * 0.12)); c.stroke(); }
      c.lineCap = 'butt';
      // couronne de feuillage
      for (let i = 0; i < 11; i++) { const a = Math.PI * (1.08 + (i / 10) * 0.84), lx = Math.cos(a) * cs * 1.55, ly = Math.sin(a) * cs * 1.35 - cs * 0.1 + Math.sin(now * 1.6 + i) * cs * 0.04; c.fillStyle = i % 3 ? '#2fb86a' : '#1e7a44'; c.beginPath(); c.arc(lx, ly, cs * 0.3, 0, 7); c.fill(); c.fillStyle = '#9dffb0'; c.fillRect(lx - cs * 0.06, ly - cs * 0.16, cs * 0.12, cs * 0.08); }
      const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#7a5a34'); g.addColorStop(1, '#2e1c0c'); c.fillStyle = g; c.beginPath(); c.ellipse(0, cs * 0.05, cs * 1.38, cs * 1.22, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(30,16,6,.7)'; c.lineWidth = cs * 0.07; [-1.1, -0.4, 0.4, 1.1].forEach((dx) => { c.beginPath(); c.moveTo(dx * cs, -h * 0.42); c.quadraticCurveTo(dx * cs * 1.12, 0, dx * cs * 0.9, h * 0.42); c.stroke(); });
      [-0.75, 0.75].forEach((dx) => { const ex = dx * cs, ey = -cs * 0.12, gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.9); gg.addColorStop(0, hexA(eye, 0.85)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.9, ey - cs * 0.9, cs * 1.8, cs * 1.8);
        c.fillStyle = '#120a04'; c.beginPath(); c.ellipse(ex, ey, cs * 0.36, cs * 0.24, dx > 0 ? -0.25 : 0.25, 0, 7); c.fill(); c.fillStyle = eye; c.beginPath(); c.ellipse(ex, ey, cs * 0.24, cs * 0.12 * open, dx > 0 ? -0.25 : 0.25, 0, 7); c.fill(); });
      c.fillStyle = '#120a04'; c.beginPath(); c.ellipse(0, cs * 0.6, cs * 0.42, cs * (0.1 + b.eye * 0.22), 0, 0, 7); c.fill(); c.fillStyle = hexA(eye, 0.6); c.beginPath(); c.ellipse(0, cs * 0.64, cs * 0.24, cs * (0.04 + b.eye * 0.1), 0, 0, 7); c.fill();
      c.strokeStyle = hexA(eye, 0.75); c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const sx = (hash(i, 5, 77) - 0.5) * w * 0.48; c.beginPath(); c.moveTo(sx, -h / 2 + cs * 0.12); c.lineTo(sx + cs * 0.18, -h / 2 + cs * 0.5); c.lineTo(sx - cs * 0.08, -h / 2 + cs * 0.85); c.stroke(); }
    } else if (b.kind === 'machine') {
      const w = cs * 5.4, h = cs * 2.6;
      [-1, 1].forEach((sd) => { c.save(); c.translate(sd * w * 0.44, -cs * 0.2); c.rotate(now * sd * 1.6); c.fillStyle = '#6a7480'; for (let i = 0; i < 10; i++) { c.rotate(Math.PI / 5); c.fillRect(-cs * 0.09, -cs * 0.72, cs * 0.18, cs * 0.22); } c.beginPath(); c.arc(0, 0, cs * 0.55, 0, 7); c.fill(); c.fillStyle = '#2c323c'; c.beginPath(); c.arc(0, 0, cs * 0.2, 0, 7); c.fill(); c.restore();
        c.fillStyle = '#4a5260'; c.fillRect(sd * w * 0.3 - cs * 0.14, cs * 0.3, cs * 0.28, cs * 0.9 + Math.sin(now * 5 + sd) * cs * 0.15); c.fillStyle = '#ffb44a'; c.fillRect(sd * w * 0.3 - cs * 0.2, cs * 1.1 + Math.sin(now * 5 + sd) * cs * 0.15, cs * 0.4, cs * 0.12); });
      const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#8a929e'); g.addColorStop(1, '#3a4048'); c.fillStyle = g; c.fillRect(-w * 0.28, -h * 0.45, w * 0.56, h * 0.85);
      c.fillStyle = '#c8d0dc'; for (let i = 0; i < 6; i++) { c.fillRect(-w * 0.26 + i * w * 0.1, -h * 0.42, cs * 0.08, cs * 0.08); c.fillRect(-w * 0.26 + i * w * 0.1, h * 0.32, cs * 0.08, cs * 0.08); }
      for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#1a1d24' : '#ffb44a'; c.fillRect(-w * 0.28 + i * w * 0.0933, -h * 0.5, w * 0.0933, cs * 0.12); }
      [-0.7, 0.7].forEach((dx) => { const ex = dx * cs, ey = -cs * 0.25, gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.8); gg.addColorStop(0, hexA(eye, 0.8)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.8, ey - cs * 0.8, cs * 1.6, cs * 1.6);
        c.fillStyle = '#14161c'; c.beginPath(); c.arc(ex, ey, cs * 0.3, 0, 7); c.fill(); c.fillStyle = eye; c.beginPath(); c.arc(ex, ey, cs * 0.14 * (0.6 + open * 0.5), 0, 7); c.fill(); c.strokeStyle = '#6a7480'; c.lineWidth = cs * 0.05; c.beginPath(); c.arc(ex, ey, cs * 0.3, 0, 7); c.stroke(); });
      c.fillStyle = '#14161c'; c.fillRect(-cs * 0.8, cs * 0.3, cs * 1.6, cs * (0.3 + b.eye * 0.25)); c.fillStyle = hexA(eye, 0.4 + b.eye * 0.5); for (let i = 0; i < 6; i++) c.fillRect(-cs * 0.7 + i * cs * 0.26, cs * 0.36, cs * 0.12, cs * (0.18 + b.eye * 0.2));
      c.strokeStyle = 'rgba(20,20,24,.85)'; c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const sx = (hash(i, 19, 77) - 0.5) * w * 0.4; c.beginPath(); c.moveTo(sx, -h * 0.4); c.lineTo(sx + cs * 0.16, -h * 0.1); c.lineTo(sx - cs * 0.1, h * 0.15); c.stroke(); }
    } else if (b.kind === 'king') {
      const h = cs * 2.6, fl = 0.85 + 0.15 * Math.sin(now * 3);
      c.save(); c.globalAlpha = 0.92 * fl;
      c.fillStyle = '#5a1a4a'; c.beginPath(); c.moveTo(-cs * 2.4, h * 0.45); c.quadraticCurveTo(-cs * 1.6, -h * 0.1, -cs * 0.8, h * 0.05); c.lineTo(cs * 0.8, h * 0.05); c.quadraticCurveTo(cs * 1.6, -h * 0.1, cs * 2.4, h * 0.45); c.closePath(); c.fill();
      c.fillStyle = '#e8e0ff'; for (let i = 0; i < 9; i++) c.fillRect(-cs * 2.2 + i * cs * 0.55, h * 0.3, cs * 0.18, cs * 0.18);
      const g = c.createLinearGradient(0, -h * 0.4, 0, h * 0.4); g.addColorStop(0, '#d8fff0'); g.addColorStop(1, '#5aa88a'); c.fillStyle = g; c.beginPath(); c.ellipse(0, -cs * 0.05, cs * 1.05, cs * 1.15, 0, 0, 7); c.fill();
      c.fillStyle = '#e8f8f0'; c.beginPath(); c.moveTo(-cs * 0.75, cs * 0.35); c.quadraticCurveTo(0, cs * 1.6, cs * 0.75, cs * 0.35); c.quadraticCurveTo(0, cs * 0.75, -cs * 0.75, cs * 0.35); c.fill();
      c.restore();
      c.fillStyle = '#ffd45e'; c.beginPath(); c.moveTo(-cs * 0.95, -cs * 0.85); c.lineTo(-cs * 0.95, -cs * 1.45); c.lineTo(-cs * 0.5, -cs * 1.1); c.lineTo(0, -cs * 1.65); c.lineTo(cs * 0.5, -cs * 1.1); c.lineTo(cs * 0.95, -cs * 1.45); c.lineTo(cs * 0.95, -cs * 0.85); c.closePath(); c.fill();
      [[-0.5, -1.05, '#ff4f6d'], [0, -1.25, '#5ee7ff'], [0.5, -1.05, '#ff4f6d']].forEach(([gx, gy, gc]) => { c.fillStyle = gc; c.beginPath(); c.arc(gx * cs, gy * cs, cs * 0.09, 0, 7); c.fill(); });
      [-0.42, 0.42].forEach((dx) => { const ex = dx * cs, ey = -cs * 0.25, gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.75); gg.addColorStop(0, hexA(eye, 0.85)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.75, ey - cs * 0.75, cs * 1.5, cs * 1.5);
        c.fillStyle = '#0a1a14'; c.beginPath(); c.ellipse(ex, ey, cs * 0.22, cs * 0.26, 0, 0, 7); c.fill(); c.fillStyle = eye; c.beginPath(); c.arc(ex, ey, cs * 0.09 * (0.6 + open * 0.6), 0, 7); c.fill(); });
      c.fillStyle = '#0a1a14'; c.beginPath(); c.ellipse(0, cs * 0.32, cs * 0.32, cs * (0.06 + b.eye * 0.18), 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(10,40,30,.8)'; c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const sx = (hash(i, 21, 77) - 0.5) * cs * 1.4; c.beginPath(); c.moveTo(sx, -cs * 0.9); c.lineTo(sx + cs * 0.16, -cs * 0.5); c.lineTo(sx - cs * 0.08, -cs * 0.15); c.stroke(); }
    } else if (b.kind === 'leviathan') {
      const w = cs * 5.6, h = cs * 2.6, sw = Math.sin(now * 1.6);
      [-1, 1].forEach((sd) => { c.fillStyle = '#167a8e'; c.beginPath(); c.moveTo(sd * w * 0.22, -h * 0.2); c.quadraticCurveTo(sd * w * 0.5, -h * (0.55 + sw * 0.05), sd * w * 0.48, h * 0.1); c.quadraticCurveTo(sd * w * 0.36, -h * 0.05, sd * w * 0.22, h * 0.15); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(122,246,224,.6)'; c.lineWidth = cs * 0.04; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(sd * w * 0.24, -h * 0.1 + i * cs * 0.12); c.lineTo(sd * w * (0.3 + i * 0.05), -h * 0.45 + i * cs * 0.15); c.stroke(); } });
      const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#2a9a8e'); g.addColorStop(1, '#0a3e4c'); c.fillStyle = g; c.beginPath(); c.ellipse(0, -cs * 0.05, w * 0.27, h * 0.44, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(10,62,76,.5)'; for (let i = 0; i < 12; i++) { const sx = ((i % 4) - 1.5) * cs * 0.42, sy = -h * 0.3 + Math.floor(i / 4) * cs * 0.3; c.beginPath(); c.arc(sx, sy, cs * 0.14, 0, Math.PI); c.fill(); }
      c.fillStyle = '#ffd45e'; [[-1.2, 0.3], [1.2, 0.3], [-0.9, -0.6], [0.9, -0.6]].forEach(([fx, fy]) => { c.globalAlpha = 0.5 + 0.5 * Math.sin(now * 3 + fx); c.fillRect(fx * cs - cs * 0.05, fy * cs - cs * 0.05, cs * 0.1, cs * 0.1); }); c.globalAlpha = 1;
      [-0.6, 0.6].forEach((dx) => { const ex = dx * cs, ey = -cs * 0.25, gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.8); gg.addColorStop(0, hexA(eye, 0.8)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.8, ey - cs * 0.8, cs * 1.6, cs * 1.6);
        c.fillStyle = '#04141a'; c.beginPath(); c.ellipse(ex, ey, cs * 0.3, cs * 0.2, dx > 0 ? 0.3 : -0.3, 0, 7); c.fill(); c.fillStyle = eye; c.beginPath(); c.ellipse(ex, ey, cs * 0.08, cs * 0.17 * open, 0, 0, 7); c.fill(); });
      const jaw = cs * (0.12 + b.eye * 0.35); c.fillStyle = '#04141a'; c.beginPath(); c.ellipse(0, cs * 0.5, cs * 0.7, jaw, 0, 0, 7); c.fill(); c.fillStyle = '#e8f8f0'; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * cs * 0.18 - cs * 0.06, cs * 0.5 - jaw * 0.7); c.lineTo(i * cs * 0.18 + cs * 0.06, cs * 0.5 - jaw * 0.7); c.lineTo(i * cs * 0.18, cs * 0.5 - jaw * 0.7 + cs * 0.16); c.closePath(); c.fill(); }
      c.strokeStyle = hexA('#ffd45e', 0.8); c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const sx = (hash(i, 15, 77) - 0.5) * w * 0.36; c.beginPath(); c.moveTo(sx, -h * 0.4); c.lineTo(sx + cs * 0.16, -h * 0.12); c.lineTo(sx - cs * 0.1, h * 0.1); c.stroke(); }
    } else if (b.kind === 'entity') {
      const R0 = cs * 1.3;
      for (let i = 0; i < 3; i++) { c.save(); c.rotate(now * (0.4 + i * 0.25) * (i % 2 ? -1 : 1)); c.strokeStyle = hexA(i === 1 ? '#5ee7ff' : '#ff7ae0', 0.7); c.lineWidth = cs * 0.07; c.beginPath(); c.ellipse(0, 0, R0 * (1.5 + i * 0.35), R0 * (0.45 + i * 0.1), 0, 0, 7); c.stroke();
        for (let j = 0; j < 5; j++) { const a = (j / 5) * Math.PI * 2; c.fillStyle = '#ffffff'; c.fillRect(Math.cos(a) * R0 * (1.5 + i * 0.35) - cs * 0.04, Math.sin(a) * R0 * (0.45 + i * 0.1) - cs * 0.04, cs * 0.08, cs * 0.08); } c.restore(); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + now * 0.6, l = cs * (1.4 + Math.sin(now * 3 + i) * 0.2); c.strokeStyle = hexA('#ff7ae0', 0.35); c.lineWidth = cs * 0.06; c.beginPath(); c.moveTo(Math.cos(a) * R0 * 0.8, Math.sin(a) * R0 * 0.8); c.lineTo(Math.cos(a) * l * 1.2, Math.sin(a) * l * 0.8); c.stroke(); }
      const g = c.createRadialGradient(0, 0, 0, 0, 0, R0); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#e8d0ff'); g.addColorStop(1, '#5a1aa0'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, R0 * 0.85, 0, 7); c.fill();
      const ir = R0 * 0.42, ox2 = Math.sin(now * 0.9) * cs * 0.15; c.fillStyle = eye; c.beginPath(); c.arc(ox2, 0, ir, 0, 7); c.fill(); c.fillStyle = '#05010f'; c.beginPath(); c.ellipse(ox2, 0, ir * 0.35, ir * (0.3 + open * 0.5), 0, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(ox2 - ir * 0.5, -ir * 0.55, ir * 0.25, ir * 0.25);
      c.strokeStyle = 'rgba(30,0,60,.8)'; c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const a = hash(i, 17, 77) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * R0 * 0.85, Math.sin(a) * R0 * 0.85); c.lineTo(Math.cos(a) * R0 * 0.5, Math.sin(a) * R0 * 0.5 + cs * 0.1); c.stroke(); }
    } else if (b.kind === 'prism') {
      const R0 = cs * 1.25, sp = now * 0.8;
      for (let i = 0; i < 6; i++) { const a = sp + (i / 6) * Math.PI * 2, s = cs * (0.2 + (i % 2) * 0.08); c.save(); c.translate(Math.cos(a) * cs * 2.35, Math.sin(a) * cs * 0.55); c.rotate(a * 2); c.fillStyle = ['#b48cff', '#5ef2ff', '#ff9de9'][i % 3]; c.beginPath(); c.moveTo(0, -s * 1.4); c.lineTo(s * 0.6, 0); c.lineTo(0, s * 1.4); c.lineTo(-s * 0.6, 0); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(-s * 0.15, -s * 0.8, s * 0.25, s * 0.5); c.restore(); }
      const hg = c.createRadialGradient(0, 0, 0, 0, 0, R0 * 1.8); hg.addColorStop(0, hexA(eye, 0.35)); hg.addColorStop(1, hexA(eye, 0)); c.fillStyle = hg; c.fillRect(-R0 * 1.8, -R0 * 1.8, R0 * 3.6, R0 * 3.6);
      const pts = [[0, -1.25], [0.85, -0.45], [0.7, 0.6], [0, 1.15], [-0.7, 0.6], [-0.85, -0.45]], fc = ['#e8d8ff', '#b48cff', '#7a4ad0', '#5a2aa0', '#8a5ae0', '#d0b8ff'];
      for (let i = 0; i < 6; i++) { const p1 = pts[i], p2 = pts[(i + 1) % 6]; c.fillStyle = fc[i]; c.beginPath(); c.moveTo(0, 0); c.lineTo(p1[0] * R0, p1[1] * R0); c.lineTo(p2[0] * R0, p2[1] * R0); c.closePath(); c.fill(); }
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = cs * 0.04; c.beginPath(); pts.forEach(([qx, qy], i) => (i ? c.lineTo(qx * R0, qy * R0) : c.moveTo(qx * R0, qy * R0))); c.closePath(); c.stroke();
      const ir = cs * 0.38, ey = -cs * 0.05, gg = c.createRadialGradient(0, ey, 0, 0, ey, cs * 0.9); gg.addColorStop(0, hexA(eye, 0.7)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(-cs * 0.9, ey - cs * 0.9, cs * 1.8, cs * 1.8);
      c.fillStyle = '#1a0b33'; c.beginPath(); c.ellipse(0, ey, ir, ir * 0.7, 0, 0, 7); c.fill(); c.fillStyle = eye; c.beginPath(); c.ellipse(0, ey, ir * 0.55, ir * 0.55 * (0.3 + open * 0.6), 0, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(-ir * 0.35, ey - ir * 0.35, ir * 0.22, ir * 0.22);
      c.strokeStyle = 'rgba(26,11,51,.85)'; c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const a = hash(i, 23, 77) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * R0 * 0.75, Math.sin(a) * R0 * 0.75); c.lineTo(Math.cos(a + 0.3) * R0 * 0.42, Math.sin(a + 0.3) * R0 * 0.42); c.lineTo(Math.cos(a - 0.2) * R0 * 0.22, Math.sin(a - 0.2) * R0 * 0.22); c.stroke(); }
    } else if (b.kind === 'nexus') {
      const R0 = cs * 1.2, gl = Math.sin(now * 23) > 0.93 ? (Math.random() - 0.5) * cs * 0.3 : 0, VC = ['#ff3df0', '#5ee7ff', '#ffd84d'];
      for (let i = 0; i < 3; i++) { c.save(); c.rotate(now * (0.5 + i * 0.3) * (i % 2 ? -1 : 1) + i); c.strokeStyle = hexA(VC[i], 0.75); c.lineWidth = cs * 0.08; c.setLineDash([cs * 0.5, cs * 0.25]); c.beginPath(); c.ellipse(0, 0, R0 * (1.55 + i * 0.3), R0 * (0.42 + i * 0.08), 0, 0, 7); c.stroke(); c.restore(); } c.setLineDash([]);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + now * 0.4, l = R0 * (1.1 + 0.25 * Math.sin(now * 3 + i * 1.7)); c.strokeStyle = 'rgba(0,0,0,.85)'; c.lineWidth = cs * 0.14; c.lineCap = 'round'; c.beginPath(); c.moveTo(Math.cos(a) * R0 * 0.7, Math.sin(a) * R0 * 0.7); c.quadraticCurveTo(Math.cos(a + 0.4) * l, Math.sin(a + 0.4) * l * 0.8, Math.cos(a + 0.2) * l * 1.25, Math.sin(a + 0.2) * l); c.stroke(); } c.lineCap = 'butt';
      c.save(); c.globalCompositeOperation = 'lighter'; [[-1, 0, VC[0]], [1, 0, VC[1]], [0, 1, VC[2]]].forEach(([dx, dy, col]) => { c.fillStyle = hexA(col, 0.45); c.beginPath(); c.arc(dx * cs * 0.08 + gl, dy * cs * 0.08, R0 * 0.86, 0, 7); c.fill(); }); c.restore();
      const g = c.createRadialGradient(0, 0, 0, 0, 0, R0 * 0.85); g.addColorStop(0, '#1a1a26'); g.addColorStop(0.7, '#000000'); g.addColorStop(1, '#2a2a3a'); c.fillStyle = g; c.beginPath(); c.arc(gl, 0, R0 * 0.8, 0, 7); c.fill();
      const ir = R0 * 0.38; c.fillStyle = eye; c.beginPath(); c.ellipse(gl, 0, ir, ir * (0.25 + open * 0.55), 0, 0, 7); c.fill(); c.fillStyle = '#000000'; c.beginPath(); c.ellipse(gl, 0, ir * 0.3, ir * (0.2 + open * 0.4), 0, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(gl - ir * 0.6, -ir * 0.5, ir * 0.22, ir * 0.22);
      c.strokeStyle = hexA('#ffffff', 0.8); c.lineWidth = cs * 0.04; for (let i = 0; i < b.max - b.hp; i++) { const a = hash(i, 29, 77) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * R0 * 0.8, Math.sin(a) * R0 * 0.8); c.lineTo(Math.cos(a + 0.25) * R0 * 0.5, Math.sin(a + 0.25) * R0 * 0.5); c.stroke(); }
    } else if (b.kind === 'titan') {
      const w = cs * 5.4, h = cs * 2.6;
      for (let i = -3; i <= 3; i++) { const px = i * cs * 0.52, ph = cs * (0.55 + (3 - Math.abs(i)) * 0.2); c.fillStyle = i % 2 ? '#bfefff' : '#8fd8ff'; c.beginPath(); c.moveTo(px - cs * 0.27, -h * 0.3); c.lineTo(px, -h * 0.3 - ph); c.lineTo(px + cs * 0.27, -h * 0.3); c.fill(); }
      const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#f4fbff'); g.addColorStop(1, '#3a7fc0'); c.fillStyle = g; c.beginPath(); c.moveTo(-w * 0.3, -h * 0.34); c.lineTo(w * 0.3, -h * 0.34); c.lineTo(w * 0.36, h * 0.08); c.lineTo(w * 0.22, h * 0.42); c.lineTo(-w * 0.22, h * 0.42); c.lineTo(-w * 0.36, h * 0.08); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = cs * 0.04; c.beginPath(); c.moveTo(-w * 0.3, -h * 0.34); c.lineTo(-w * 0.1, h * 0.04); c.lineTo(-w * 0.22, h * 0.42); c.moveTo(w * 0.3, -h * 0.34); c.lineTo(w * 0.1, h * 0.04); c.lineTo(w * 0.22, h * 0.42); c.stroke();
      [-0.62, 0.62].forEach((dx) => { const ex = dx * cs, ey = -cs * 0.16, gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.8); gg.addColorStop(0, hexA(eye, 0.8)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.8, ey - cs * 0.8, cs * 1.6, cs * 1.6);
        c.fillStyle = '#0a1a3a'; c.beginPath(); c.ellipse(ex, ey, cs * 0.32, cs * 0.18, 0, 0, 7); c.fill(); c.fillStyle = eye; c.beginPath(); c.ellipse(ex, ey, cs * 0.2, cs * 0.1 * open, 0, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(ex - cs * 0.38, ey - cs * 0.32, cs * 0.76, cs * 0.1); });
      c.fillStyle = '#0a1a3a'; c.beginPath(); c.ellipse(0, cs * 0.5, cs * 0.4, cs * (0.08 + b.eye * 0.2), 0, 0, 7); c.fill();
      if (b.eye > 0.05) { c.fillStyle = hexA('#e6f7ff', b.eye * 0.6); for (let i = 0; i < 5; i++) { c.beginPath(); c.arc((i - 2) * cs * 0.22, cs * (0.75 + Math.sin(now * 5 + i) * 0.08), cs * 0.12, 0, 7); c.fill(); } }
      for (let i = -2; i <= 2; i++) { c.fillStyle = '#cfefff'; c.beginPath(); c.moveTo(i * cs * 0.3 - cs * 0.11, h * 0.4); c.lineTo(i * cs * 0.3 + cs * 0.11, h * 0.4); c.lineTo(i * cs * 0.3, h * 0.4 + cs * (0.42 - Math.abs(i) * 0.08)); c.closePath(); c.fill(); }
      c.strokeStyle = 'rgba(20,60,120,.8)'; c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const sx = (hash(i, 11, 77) - 0.5) * w * 0.4; c.beginPath(); c.moveTo(sx, -h * 0.34); c.lineTo(sx + cs * 0.16, -h * 0.05); c.lineTo(sx - cs * 0.1, h * 0.2); c.stroke(); }
    } else if (b.kind === 'golem') {
      const w = cs * 5.6, h = cs * 2.6, pu = 0.7 + 0.3 * Math.sin(now * 4);
      [-1, 1].forEach((sd) => { c.fillStyle = '#3a1a10'; c.beginPath(); c.arc(sd * w * 0.43, cs * 0.35, cs * 0.72, 0, 7); c.fill(); c.strokeStyle = hexA('#ff7a1a', pu); c.lineWidth = cs * 0.05; c.beginPath(); c.moveTo(sd * w * 0.43 - cs * 0.3, cs * 0.1); c.lineTo(sd * w * 0.43, cs * 0.4); c.lineTo(sd * w * 0.43 + cs * 0.2, cs * 0.75); c.stroke(); });
      const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#6a3020'); g.addColorStop(1, '#2a0e06'); c.fillStyle = g; c.beginPath(); [[-0.3, -0.42], [-0.1, -0.5], [0.12, -0.47], [0.3, -0.38], [0.34, 0.05], [0.24, 0.42], [-0.22, 0.44], [-0.34, 0.06]].forEach(([fx, fy], i) => (i ? c.lineTo(fx * w, fy * h) : c.moveTo(fx * w, fy * h))); c.closePath(); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = hexA('#ff7a1a', 0.55 * pu); c.lineWidth = cs * 0.07; c.beginPath(); c.moveTo(-w * 0.26, -h * 0.3); c.lineTo(-w * 0.12, -h * 0.1); c.lineTo(-w * 0.2, h * 0.2); c.moveTo(w * 0.2, -h * 0.4); c.lineTo(w * 0.12, -h * 0.15); c.lineTo(w * 0.26, h * 0.12); c.stroke(); c.restore();
      [-0.6, 0.6].forEach((dx) => { const ex = dx * cs, ey = -cs * 0.2, gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.85); gg.addColorStop(0, hexA(eye, 0.85)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.85, ey - cs * 0.85, cs * 1.7, cs * 1.7);
        c.fillStyle = '#140402'; c.fillRect(ex - cs * 0.32, ey - cs * 0.14, cs * 0.64, cs * 0.28); c.fillStyle = eye; c.fillRect(ex - cs * 0.22, ey - cs * 0.07 * open, cs * 0.44, cs * 0.14 * open); });
      c.fillStyle = '#140402'; c.fillRect(-cs * 0.6, cs * 0.42, cs * 1.2, cs * (0.14 + b.eye * 0.3)); c.fillStyle = hexA('#ffb03a', 0.5 + b.eye * 0.5); c.fillRect(-cs * 0.45, cs * 0.48, cs * 0.9, cs * (0.05 + b.eye * 0.16));
      c.strokeStyle = hexA('#ffe066', 0.9); c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const sx = (hash(i, 13, 77) - 0.5) * w * 0.4; c.beginPath(); c.moveTo(sx, -h * 0.45); c.lineTo(sx + cs * 0.18, -h * 0.12); c.lineTo(sx - cs * 0.08, h * 0.16); c.stroke(); }
    } else if (b.kind === 'pharaoh') {
      const w = cs * 5.2, h = cs * 2.6;
      [-1, 1].forEach((sd) => { c.save(); c.translate(sd * w * 0.47, cs * 0.15); c.rotate(now * sd * 1.2); c.fillStyle = '#8a6a2a'; for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.fillRect(-cs * 0.1, -cs * 0.6, cs * 0.2, cs * 0.24); } c.beginPath(); c.arc(0, 0, cs * 0.44, 0, 7); c.fill(); c.fillStyle = '#3a2a0a'; c.beginPath(); c.arc(0, 0, cs * 0.15, 0, 7); c.fill(); c.restore(); });
      c.save(); c.beginPath(); c.moveTo(-w * 0.24, -h * 0.52); c.lineTo(w * 0.24, -h * 0.52); c.lineTo(w * 0.4, h * 0.42); c.lineTo(-w * 0.4, h * 0.42); c.closePath(); c.clip();
      for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#1f4fa8' : '#e8b84a'; c.fillRect(-w / 2, -h * 0.52 + i * cs * 0.17, w, cs * 0.17); } c.restore();
      const g = c.createLinearGradient(0, -h * 0.42, 0, h * 0.3); g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#b07a1e'); c.fillStyle = g; c.beginPath(); c.moveTo(-w * 0.19, -h * 0.4); c.lineTo(w * 0.19, -h * 0.4); c.lineTo(w * 0.16, h * 0.18); c.quadraticCurveTo(0, h * 0.38, -w * 0.16, h * 0.18); c.closePath(); c.fill();
      c.fillStyle = '#ffd45e'; c.fillRect(-cs * 0.1, -h * 0.58, cs * 0.2, cs * 0.42); c.fillStyle = '#1f4fa8'; c.fillRect(-cs * 0.06, -h * 0.53, cs * 0.12, cs * 0.12);
      [-0.55, 0.55].forEach((dx) => { const ex = dx * cs, ey = -cs * 0.24, gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.8); gg.addColorStop(0, hexA(eye, 0.8)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.8, ey - cs * 0.8, cs * 1.6, cs * 1.6);
        c.fillStyle = '#14101e'; c.beginPath(); c.ellipse(ex, ey, cs * 0.34, cs * 0.17, 0, 0, 7); c.fill(); c.fillRect(ex + (dx > 0 ? cs * 0.18 : -cs * 0.48), ey + cs * 0.04, cs * 0.3, cs * 0.06);
        c.fillStyle = eye; c.beginPath(); c.arc(ex, ey, cs * 0.12 * (0.6 + open * 0.5), 0, 7); c.fill(); c.strokeStyle = '#14101e'; c.lineWidth = cs * 0.03; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(now * 3) * cs * 0.12, ey + Math.sin(now * 3) * cs * 0.12); c.stroke(); });
      c.fillStyle = '#3a2a0a'; c.fillRect(-cs * 0.4, cs * 0.26, cs * 0.8, cs * (0.08 + b.eye * 0.22)); c.fillStyle = hexA(eye, 0.6); c.fillRect(-cs * 0.3, cs * 0.29, cs * 0.6, cs * (0.03 + b.eye * 0.1));
      for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#1f4fa8' : '#e8b84a'; c.fillRect(-cs * 0.17, h * 0.26 + i * cs * 0.13, cs * 0.34, cs * 0.13); }
      c.strokeStyle = 'rgba(60,30,0,.8)'; c.lineWidth = cs * 0.05; for (let i = 0; i < b.max - b.hp; i++) { const sx = (hash(i, 9, 77) - 0.5) * w * 0.34; c.beginPath(); c.moveTo(sx, -h * 0.4); c.lineTo(sx + cs * 0.16, -h * 0.1); c.lineTo(sx - cs * 0.1, h * 0.14); c.stroke(); }
    } else {
      for (let i = 0; i < 4; i++) [-1, 1].forEach((sd) => { const a = Math.sin(now * 6 + i * 1.3 + (sd > 0 ? 1 : 0)) * 0.25, bx = sd * cs * (0.9 + i * 0.25), by = -cs * 0.2 + i * cs * 0.22;
        c.strokeStyle = '#1a3a66'; c.lineWidth = cs * 0.2; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + sd * cs * 1.1, by - cs * (0.6 - a)); c.lineTo(bx + sd * cs * 1.9, by + cs * (0.7 + a)); c.stroke();
        c.strokeStyle = '#5ef2ff'; c.lineWidth = cs * 0.05; c.beginPath(); c.moveTo(bx + sd * cs * 1.1, by - cs * (0.6 - a)); c.lineTo(bx + sd * cs * 1.9, by + cs * (0.7 + a)); c.stroke(); });
      const g = c.createRadialGradient(0, -cs * 0.2, cs * 0.2, 0, 0, cs * 1.6); g.addColorStop(0, '#3a6ab0'); g.addColorStop(1, '#0a1a3a'); c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, cs * 1.6, cs * 1.05, 0, 0, 7); c.fill();
      c.strokeStyle = '#5ef2ff'; c.lineWidth = cs * 0.06; c.beginPath(); c.ellipse(0, 0, cs * 1.6, cs * 1.05, 0, 0, 7); c.stroke();
      [-0.75, -0.25, 0.25, 0.75].forEach((dx, i) => { const ex = dx * cs, ey = cs * (i === 0 || i === 3 ? 0.05 : -0.1), gg = c.createRadialGradient(ex, ey, 0, ex, ey, cs * 0.5); gg.addColorStop(0, hexA(eye, 0.9)); gg.addColorStop(1, hexA(eye, 0)); c.fillStyle = gg; c.fillRect(ex - cs * 0.5, ey - cs * 0.5, cs, cs); c.fillStyle = eye; c.beginPath(); c.arc(ex, ey, cs * 0.13 * (0.7 + open * 0.4), 0, 7); c.fill(); });
      c.fillStyle = hexA(eye, 0.5 + 0.5 * Math.sin(now * 8)); c.fillRect(-cs * 0.5, cs * 0.5, cs, cs * 0.12);
    }
    if (b.hitT > 0) { c.globalCompositeOperation = 'lighter'; c.fillStyle = hexA('#ffffff', b.hitT * 0.7); c.fillRect(-cs * 3.6, -cs * 1.5, cs * 7.2, cs * 3); }
    c.restore();
  }
  function drawBonus(c, ch, px, py, now) {
    const b = BONUS[ch], cs = UI.cs, bob = Math.sin(now * 3 + px) * cs * 0.06, x = px + cs / 2, y = py + cs / 2 + bob, s = cs * 0.9;
    const rg = c.createRadialGradient(x, y, 0, x, y, cs * 0.7); rg.addColorStop(0, hexA(b.color, 0.45)); rg.addColorStop(1, hexA(b.color, 0)); c.fillStyle = rg; c.fillRect(x - cs, y - cs, cs * 2, cs * 2);
    const im = itemsImg();
    if (b.icon >= 0 && im.ok) c.drawImage(im, b.icon * 64, 0, 64, 64, x - s / 2, y - s / 2, s, s);
    else { // sablier « ralenti »
      c.save(); c.translate(x, y); c.fillStyle = '#c8c0ff'; c.strokeStyle = '#6b5cf0'; c.lineWidth = cs * 0.06; c.beginPath(); c.moveTo(-s * 0.28, -s * 0.36); c.lineTo(s * 0.28, -s * 0.36); c.lineTo(0, 0); c.lineTo(s * 0.28, s * 0.36); c.lineTo(-s * 0.28, s * 0.36); c.lineTo(0, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffd84d'; c.beginPath(); c.moveTo(-s * 0.16, s * 0.3); c.lineTo(s * 0.16, s * 0.3); c.lineTo(0, s * 0.1); c.fill(); c.restore();
    }
  }
  function drawExit(c, px, py, now) {
    const cs = UI.cs, x = px + cs / 2, y = py + cs / 2, pal = G.pal, p = 0.5 + 0.5 * Math.sin(now * 3);
    const rg = c.createRadialGradient(x, y, 0, x, y, cs * 1.6); rg.addColorStop(0, hexA('#fff3b0', 0.55 + 0.2 * p)); rg.addColorStop(1, 'rgba(255,216,77,0)'); c.fillStyle = rg; c.fillRect(x - cs * 1.6, y - cs * 1.6, cs * 3.2, cs * 3.2);
    c.fillStyle = '#ffd84d'; c.fillRect(px + cs * 0.12, py + cs * 0.1, cs * 0.76, cs * 0.86); c.fillStyle = '#7a3d00'; c.fillRect(px + cs * 0.2, py + cs * 0.2, cs * 0.6, cs * 0.76);
    const g = c.createLinearGradient(0, py + cs * 0.2, 0, py + cs); g.addColorStop(0, '#fff6c9'); g.addColorStop(1, '#ffb52e'); c.fillStyle = g; c.fillRect(px + cs * 0.26, py + cs * 0.28, cs * 0.48, cs * 0.68);
    c.fillStyle = hexA('#ffffff', 0.6 * p); c.fillRect(px + cs * 0.42, py + cs * 0.36, cs * 0.16, cs * 0.5);
    for (let i = 0; i < 3; i++) { const k = (now * 0.8 + i / 3) % 1; c.fillStyle = hexA('#fff3b0', 1 - k); c.fillRect(x - cs * 0.3 + i * cs * 0.25, py + cs * 0.9 - k * cs * 1.2, cs * 0.06, cs * 0.06); }
  }
  function drawTimed(c, ch, px, py, s, now) {
    const cs = UI.cs;
    if (ch === 'x') {
      c.fillStyle = '#2a1640'; c.fillRect(px + cs * 0.1, py + cs * 0.72, cs * 0.8, cs * 0.18);
      const h = s === 'on' ? 0.62 : s === 'warn' ? 0.22 + 0.08 * Math.sin(now * 40) : 0.08, col = s === 'on' ? '#ff5e9a' : s === 'warn' ? '#ff9ac0' : '#7a5a96';
      c.fillStyle = col; for (let i = 0; i < 3; i++) { const bx = px + cs * (0.15 + i * 0.25); c.beginPath(); c.moveTo(bx, py + cs * 0.74); c.lineTo(bx + cs * 0.1, py + cs * (0.74 - h)); c.lineTo(bx + cs * 0.2, py + cs * 0.74); c.fill(); }
      if (s === 'on') { c.fillStyle = 'rgba(255,94,154,.18)'; c.fillRect(px, py, cs, cs); }
    } else if (ch === 'e') {
      const sh = s === 'warn' ? (Math.random() - 0.5) * cs * 0.05 : 0, down = s === 'on' ? 1 : s === 'warn' ? 0.12 : 0;
      c.fillStyle = '#1a1d24'; c.fillRect(px + cs * 0.06, py + cs * 0.06, cs * 0.88, cs * 0.88); for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#1a1d24' : '#ffb44a'; c.fillRect(px + cs * (0.06 + i * 0.22), py + cs * 0.84, cs * 0.22, cs * 0.1); }
      const hh = cs * (0.25 + down * 0.6); c.fillStyle = '#6a7480'; c.fillRect(px + cs * 0.45 + sh, py, cs * 0.1, hh - cs * 0.12); c.fillStyle = s === 'on' ? '#c8d0dc' : '#8a929e'; c.fillRect(px + cs * 0.12 + sh, py + hh - cs * 0.16, cs * 0.76, cs * 0.18);
      c.fillStyle = s === 'warn' ? hexA('#ff4f4f', 0.6 + 0.4 * Math.sin(now * 30)) : '#3a4048'; c.fillRect(px + cs * 0.44 + sh, py + hh - cs * 0.13, cs * 0.12, cs * 0.08);
      if (s === 'on') { c.fillStyle = 'rgba(255,180,74,.15)'; c.fillRect(px, py, cs, cs); }
    } else if (ch === 'j') {
      const x = px + cs / 2, b = py + cs * 0.72, pu = s === 'warn' ? 0.5 + 0.5 * Math.sin(now * 25) : 0;
      c.fillStyle = '#2a1410'; c.beginPath(); c.ellipse(x, b, cs * 0.36, cs * 0.16, 0, 0, 7); c.fill(); c.fillStyle = s === 'off' ? '#7a2a10' : hexA('#ffb03a', 0.6 + pu * 0.4); c.beginPath(); c.ellipse(x, b, cs * 0.22, cs * 0.09, 0, 0, 7); c.fill();
      if (s === 'warn') for (let i = 0; i < 3; i++) { const k = (now * 2.5 + i / 3) % 1; c.fillStyle = hexA('#ffe066', 1 - k); c.beginPath(); c.arc(x + (i - 1) * cs * 0.12, b - k * cs * 0.4, cs * 0.05, 0, 7); c.fill(); }
      if (s === 'on') { const hh = cs * (1.5 + 0.15 * Math.sin(now * 30)), g = c.createLinearGradient(0, b - hh, 0, b); g.addColorStop(0, 'rgba(255,90,31,0)'); g.addColorStop(0.35, 'rgba(255,140,40,.85)'); g.addColorStop(1, '#fff3b0'); c.fillStyle = g;
        c.beginPath(); c.moveTo(x - cs * 0.3, b); c.quadraticCurveTo(x - cs * 0.4, b - hh * 0.5, x - cs * 0.05, b - hh); c.quadraticCurveTo(x + cs * 0.4, b - hh * 0.5, x + cs * 0.3, b); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,120,40,.18)'; c.fillRect(px, py, cs, cs); }
    } else if (ch === 'i') {
      c.fillStyle = '#132a10'; c.fillRect(px + cs * 0.1, py + cs * 0.72, cs * 0.8, cs * 0.18);
      const h = s === 'on' ? 0.6 : s === 'warn' ? 0.2 + 0.08 * Math.sin(now * 40) : 0.07, col = s === 'on' ? '#b6ff5e' : s === 'warn' ? '#e0ff9a' : '#4a6a3a';
      c.fillStyle = col; for (let i = 0; i < 3; i++) { const bx = px + cs * (0.15 + i * 0.25); c.beginPath(); c.moveTo(bx, py + cs * 0.74); c.lineTo(bx + cs * 0.1, py + cs * (0.74 - h)); c.lineTo(bx + cs * 0.2, py + cs * 0.74); c.fill(); }
      if (s === 'on') { c.fillStyle = 'rgba(182,255,94,.15)'; c.fillRect(px, py, cs, cs); }
    } else if (ch === 'z') {
      c.fillStyle = s === 'on' ? 'rgba(94,242,255,.22)' : 'rgba(94,242,255,.06)'; c.fillRect(px + 1, py + 1, cs - 2, cs - 2);
      c.strokeStyle = s === 'on' ? '#e9fdff' : s === 'warn' ? 'rgba(160,240,255,.6)' : 'rgba(94,242,255,.25)'; c.lineWidth = cs * (s === 'on' ? 0.08 : 0.04);
      c.beginPath(); const n = 5; for (let i = 0; i <= n; i++) { const xx = px + (cs * i) / n, yy = py + cs / 2 + (s === 'off' ? 0 : (Math.random() - 0.5) * cs * 0.6); if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke();
      if (s === 'on') { c.strokeStyle = '#ffe066'; c.lineWidth = cs * 0.04; c.beginPath(); for (let i = 0; i <= 4; i++) { const yy = py + (cs * i) / 4, xx = px + cs / 2 + (Math.random() - 0.5) * cs * 0.6; if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke(); }
    } else if (ch === 'k') {
      const a = s === 'on' ? 1 : s === 'warn' ? 0.35 + 0.25 * Math.sin(now * 30) : 0.12;
      c.save(); c.globalAlpha = a; c.fillStyle = '#ff7ae0'; c.beginPath(); c.moveTo(px + cs * 0.5, py + cs * 0.06); c.lineTo(px + cs * 0.86, py + cs * 0.4); c.lineTo(px + cs * 0.66, py + cs * 0.94); c.lineTo(px + cs * 0.34, py + cs * 0.94); c.lineTo(px + cs * 0.14, py + cs * 0.4); c.closePath(); c.fill();
      c.fillStyle = '#ffd3f6'; c.beginPath(); c.moveTo(px + cs * 0.5, py + cs * 0.12); c.lineTo(px + cs * 0.62, py + cs * 0.4); c.lineTo(px + cs * 0.5, py + cs * 0.86); c.lineTo(px + cs * 0.4, py + cs * 0.4); c.closePath(); c.fill(); c.restore();
    }
  }
  // méduse (patrouille volante) et crabe (patrouille au sol) de l'Atlantide
  function drawSea(c, e, x, y, now) {
    const cs = UI.cs;
    if (e.t === 'bat') { const p = Math.sin(e.anim * 5), yy = y + p * cs * 0.06; c.fillStyle = 'rgba(255,138,168,.25)'; c.beginPath(); c.arc(x, yy, cs * 0.46, 0, 7); c.fill();
      c.strokeStyle = hexA('#ffb0c4', 0.8); c.lineWidth = cs * 0.04; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * cs * 0.08, yy + cs * 0.05); c.quadraticCurveTo(x + i * cs * 0.1 + Math.sin(now * 5 + i) * cs * 0.08, yy + cs * 0.25, x + i * cs * 0.07, yy + cs * (0.42 + p * 0.04)); c.stroke(); }
      const g = c.createRadialGradient(x, yy - cs * 0.1, 0, x, yy - cs * 0.05, cs * 0.3); g.addColorStop(0, '#ffe0ea'); g.addColorStop(1, '#ff6a9a'); c.fillStyle = g; c.beginPath(); c.ellipse(x, yy - cs * 0.02, cs * (0.28 + p * 0.02), cs * 0.2, 0, Math.PI, 0); c.closePath(); c.fill();
      c.fillStyle = '#3a0a1e'; c.fillRect(x - cs * 0.1, yy - cs * 0.1, cs * 0.05, cs * 0.06); c.fillRect(x + cs * 0.05, yy - cs * 0.1, cs * 0.05, cs * 0.06); return; }
    const lg = Math.sin(e.anim * 16) * cs * 0.04; c.save(); c.translate(x, y + cs * 0.05); c.strokeStyle = '#a8381a'; c.lineWidth = cs * 0.05;
    for (let i = 0; i < 3; i++) [-1, 1].forEach((sd) => { c.beginPath(); c.moveTo(sd * cs * 0.18, cs * (0.0 + i * 0.07)); c.lineTo(sd * cs * 0.36, cs * (0.1 + i * 0.07) + (i % 2 ? lg : -lg)); c.stroke(); });
    [-1, 1].forEach((sd) => { c.fillStyle = '#ff6a3a'; c.beginPath(); c.arc(sd * cs * 0.34, -cs * 0.16, cs * 0.1, 0, 7); c.fill(); c.fillStyle = '#c8481a'; c.fillRect(sd * cs * 0.34 - cs * 0.02, -cs * 0.26, cs * 0.04, cs * 0.08); });
    c.fillStyle = '#ff7a4a'; c.beginPath(); c.ellipse(0, 0, cs * 0.26, cs * 0.16, 0, 0, 7); c.fill(); c.fillStyle = '#ffb08a'; c.fillRect(-cs * 0.16, -cs * 0.08, cs * 0.32, cs * 0.04);
    c.fillStyle = '#ffffff'; c.fillRect(-cs * 0.1, -cs * 0.24, cs * 0.06, cs * 0.06); c.fillRect(cs * 0.04, -cs * 0.24, cs * 0.06, cs * 0.06); c.fillStyle = '#1a0a04'; c.fillRect(-cs * 0.08, -cs * 0.23, cs * 0.03, cs * 0.03); c.fillRect(cs * 0.06, -cs * 0.23, cs * 0.03, cs * 0.03); c.restore();
  }
  // engrenage : tapis tournant ; la flèche pivote d'un quart de tour à chaque arrêt de Milo
  function drawGear(c, ch, px, py, now) {
    const cs = UI.cs, x = px + cs / 2, y = py + cs / 2, dir = (ch.charCodeAt(0) - 54 + G.rot) % 4, k = Math.min(1, G.rotT * 5), ang = (dir - 1 + ease(k)) * Math.PI / 2;
    c.save(); c.translate(x, y); c.rotate(now * 0.8); c.fillStyle = '#4a5260'; for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.fillRect(-cs * 0.07, -cs * 0.46, cs * 0.14, cs * 0.12); } c.beginPath(); c.arc(0, 0, cs * 0.38, 0, 7); c.fill(); c.fillStyle = '#2c323c'; c.beginPath(); c.arc(0, 0, cs * 0.3, 0, 7); c.fill(); c.restore();
    c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = '#ffb44a'; c.beginPath(); c.moveTo(0, -cs * 0.26); c.lineTo(cs * 0.17, -cs * 0.02); c.lineTo(cs * 0.06, -cs * 0.02); c.lineTo(cs * 0.06, cs * 0.2); c.lineTo(-cs * 0.06, cs * 0.2); c.lineTo(-cs * 0.06, -cs * 0.02); c.lineTo(-cs * 0.17, -cs * 0.02); c.closePath(); c.fill(); c.restore();
  }
  // fausse sortie : identique à la vraie… sauf ses yeux qui s'allument de temps en temps
  function drawFake(c, px, py, now) {
    const cs = UI.cs; drawExit(c, px, py, now); const ph = (now + px * 0.013 + py * 0.007) % 3.2;
    if (ph < 0.45) { const a = Math.sin((ph / 0.45) * Math.PI); c.fillStyle = `rgba(30,4,20,${0.45 * a})`; c.fillRect(px + cs * 0.26, py + cs * 0.28, cs * 0.48, cs * 0.68); c.fillStyle = hexA('#ff4f6d', a); c.fillRect(px + cs * 0.33, py + cs * 0.48, cs * 0.1, cs * 0.07); c.fillRect(px + cs * 0.57, py + cs * 0.48, cs * 0.1, cs * 0.07); }
  }
  // bloc gelé
  function drawIce(c, px, py) {
    const cs = UI.cs, g = c.createLinearGradient(px, py, px + cs, py + cs); g.addColorStop(0, '#f4fbff'); g.addColorStop(0.5, '#a8dcff'); g.addColorStop(1, '#4f9ad8');
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(px + cs * 0.1, py + cs * 0.86, cs * 0.84, cs * 0.1);
    c.fillStyle = g; c.fillRect(px + cs * 0.06, py + cs * 0.04, cs * 0.88, cs * 0.86); c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(px + cs * 0.06, py + cs * 0.04, cs * 0.88, cs * 0.1); c.fillRect(px + cs * 0.06, py + cs * 0.04, cs * 0.1, cs * 0.86);
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = cs * 0.04; c.beginPath(); c.moveTo(px + cs * 0.3, py + cs * 0.3); c.lineTo(px + cs * 0.5, py + cs * 0.48); c.lineTo(px + cs * 0.44, py + cs * 0.7); c.moveTo(px + cs * 0.5, py + cs * 0.48); c.lineTo(px + cs * 0.74, py + cs * 0.4); c.stroke();
    c.strokeStyle = '#2a6ab0'; c.lineWidth = cs * 0.05; c.strokeRect(px + cs * 0.06, py + cs * 0.04, cs * 0.88, cs * 0.86);
  }
  // plateforme de basalte : elle s'enfonce dans la lave puis remonte (fissures lumineuses juste avant)
  function drawPlat(c, px, py, d, now) {
    const cs = UI.cs, o = d ? d.open : 1, pu = 0.6 + 0.4 * Math.sin(now * 6 + px);
    c.fillStyle = hexA('#ff5a1f', 0.55 + 0.25 * pu); c.fillRect(px + cs * 0.04, py + cs * 0.04, cs * 0.92, cs * 0.92); c.fillStyle = hexA('#ffe066', 0.35 * pu); c.fillRect(px + cs * 0.2 + Math.sin(now * 2 + py) * cs * 0.1, py + cs * 0.4, cs * 0.3, cs * 0.1);
    if (o > 0.02) { const s = 0.6 + 0.4 * o, w = cs * 0.9 * s, x0 = px + (cs - w) / 2, y0 = py + (cs - w) / 2; c.globalAlpha = Math.min(1, o * 1.4);
      c.fillStyle = '#2a1410'; c.fillRect(x0, y0, w, w); c.fillStyle = '#4a2418'; c.fillRect(x0, y0, w, w * 0.18);
      c.strokeStyle = d && d.warn ? hexA('#ffb03a', 0.6 + 0.4 * Math.sin(now * 30)) : 'rgba(255,122,26,.35)'; c.lineWidth = cs * 0.05; c.beginPath(); c.moveTo(x0 + w * 0.2, y0 + w * 0.3); c.lineTo(x0 + w * 0.5, y0 + w * 0.55); c.lineTo(x0 + w * 0.8, y0 + w * 0.4); c.moveTo(x0 + w * 0.5, y0 + w * 0.55); c.lineTo(x0 + w * 0.45, y0 + w * 0.85); c.stroke(); c.globalAlpha = 1; }
  }
  // lave montante
  function drawLava(c, now, r1) {
    const cs = UI.cs, ly = G.lavaY * cs, bot = Math.max(ly, Math.min(G.H, r1 + 1) * cs); if (G.lavaY > r1 + 1) return;
    const hg = c.createLinearGradient(0, ly - cs * 1.6, 0, ly); hg.addColorStop(0, 'rgba(255,90,31,0)'); hg.addColorStop(1, 'rgba(255,120,40,.35)'); c.fillStyle = hg; c.fillRect(0, ly - cs * 1.6, G.W * cs, cs * 1.6);
    const g = c.createLinearGradient(0, ly, 0, ly + cs * 3); g.addColorStop(0, '#ffb03a'); g.addColorStop(0.25, '#ff5a1f'); g.addColorStop(1, '#8a1a04'); c.fillStyle = g;
    c.beginPath(); c.moveTo(0, bot + cs); for (let x = 0; x <= G.W * 4; x++) c.lineTo((x * cs) / 4, ly + Math.sin(now * 3 + x * 0.9) * cs * 0.08); c.lineTo(G.W * cs, bot + cs); c.closePath(); c.globalAlpha = 0.93; c.fill(); c.globalAlpha = 1;
    for (let i = 0; i < 8; i++) { const k = (now * 0.7 + i * 0.37) % 1, bx = (hash(i, 7, 31) * G.W) * cs, by = ly + cs * (0.3 + hash(i, 8, 31) * 1.5) - k * cs * 0.5; c.fillStyle = hexA('#ffe066', 0.7 * (1 - k)); c.beginPath(); c.arc(bx, by, cs * 0.08 * (1 - k * 0.5), 0, 7); c.fill(); }
  }
  function drawDoor(c, px, py, d) {
    const cs = UI.cs, o = d ? d.open : 1, h = cs * (1 - o);
    c.fillStyle = '#5a3a10'; c.fillRect(px, py, cs * 0.12, cs); c.fillRect(px + cs * 0.88, py, cs * 0.12, cs);
    if (h > 1) { c.fillStyle = '#ffb52e'; c.fillRect(px + cs * 0.1, py, cs * 0.8, h); c.fillStyle = '#7a3d00'; for (let i = 0; i < 4; i++) c.fillRect(px + cs * (0.18 + i * 0.2), py, cs * 0.06, h); c.fillStyle = '#ffe680'; c.fillRect(px + cs * 0.1, py + h - cs * 0.08, cs * 0.8, cs * 0.08); }
  }
  function drawBoost(c, d, px, py, now) {
    const cs = UI.cs;
    if (WORLDS[G.wi].deco === 'coral') { // courant marin
      c.save(); c.translate(px + cs / 2, py + cs / 2); c.rotate(d * Math.PI / 2); c.fillStyle = 'rgba(42,216,196,.16)'; c.fillRect(-cs / 2, -cs / 2, cs, cs);
      for (let i = 0; i < 4; i++) { const k = (now * 1.6 + i / 4) % 1, y = cs * 0.45 - k * cs * 0.9, xw = Math.sin(now * 4 + i * 2) * cs * 0.12; c.strokeStyle = hexA('#bff8ff', 0.75 * (1 - Math.abs(k - 0.5) * 1.6)); c.lineWidth = cs * 0.07; c.beginPath(); c.moveTo(-cs * 0.22 + xw, y + cs * 0.12); c.quadraticCurveTo(xw, y - cs * 0.1, cs * 0.22 + xw, y + cs * 0.12); c.stroke(); }
      c.fillStyle = 'rgba(191,248,255,.7)'; for (let i = 0; i < 2; i++) { const k = (now * 1.1 + i * 0.5) % 1; c.beginPath(); c.arc((i ? 0.18 : -0.2) * cs, cs * 0.45 - k * cs * 0.9, cs * 0.04, 0, 7); c.fill(); }
      c.restore(); return;
    }
    c.save(); c.translate(px + cs / 2, py + cs / 2); c.rotate(d * Math.PI / 2);
    c.fillStyle = 'rgba(94,242,255,.12)'; c.fillRect(-cs / 2, -cs / 2, cs, cs);
    for (let i = 0; i < 3; i++) { const k = ((now * 2 + i / 3) % 1), y = cs * 0.35 - k * cs * 0.7; c.strokeStyle = hexA('#5ef2ff', 1 - Math.abs(k - 0.5) * 1.6); c.lineWidth = cs * 0.1; c.beginPath(); c.moveTo(-cs * 0.25, y + cs * 0.15); c.lineTo(0, y - cs * 0.08); c.lineTo(cs * 0.25, y + cs * 0.15); c.stroke(); }
    c.restore();
  }
  function drawPortal(c, ch, px, py, now) {
    const cs = UI.cs, x = px + cs / 2, y = py + cs / 2, col = ['#e05cff', '#5ee7ff', '#ffd84d', '#7dff9a'][ch.charCodeAt(0) - 49];
    const rg = c.createRadialGradient(x, y, 0, x, y, cs * 0.7); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.3, hexA(col, 0.8)); rg.addColorStop(1, hexA(col, 0)); c.fillStyle = rg; c.beginPath(); c.arc(x, y, cs * 0.7, 0, 7); c.fill();
    c.strokeStyle = col; c.lineWidth = cs * 0.07; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x, y, cs * (0.18 + i * 0.1), now * (3 + i) + i * 2, now * (3 + i) + i * 2 + 3.6); c.stroke(); }
  }
  function drawEnt(c, e, now) {
    const cs = UI.cs, x = (e.fx + 0.5) * cs, y = (e.fy + 0.5) * cs, wi = WORLDS[G.wi].pxi || 0; // palette des ennemis
    if (e.t === 'laser') {
      const hor = laserHor(e), x0 = Math.min(e.a[0], e.b[0]) * cs, x1 = (Math.max(e.a[0], e.b[0]) + 1) * cs, y0 = Math.min(e.a[1], e.b[1]) * cs, y1 = (Math.max(e.a[1], e.b[1]) + 1) * cs;
      c.fillStyle = '#3a2a5a';
      if (hor) { c.fillRect(x0 - cs * 0.12, (y0 + y1) / 2 - cs * 0.16, cs * 0.16, cs * 0.32); c.fillRect(x1 - cs * 0.04, (y0 + y1) / 2 - cs * 0.16, cs * 0.16, cs * 0.32); }
      else { c.fillRect((x0 + x1) / 2 - cs * 0.16, y0 - cs * 0.12, cs * 0.32, cs * 0.16); c.fillRect((x0 + x1) / 2 - cs * 0.16, y1 - cs * 0.04, cs * 0.32, cs * 0.16); }
      if (e.on || e.warn) {
        const a = e.on ? 1 : 0.25 + 0.2 * Math.sin(now * 40), wd = e.on ? cs * (0.12 + 0.03 * Math.sin(now * 50)) : cs * 0.03;
        c.save(); if (!UI.lowfx) { c.shadowColor = '#ff2fd0'; c.shadowBlur = cs * 0.5; } c.fillStyle = hexA('#ff4fd8', a);
        if (hor) c.fillRect(x0, (y0 + y1) / 2 - wd / 2, x1 - x0, wd); else c.fillRect((x0 + x1) / 2 - wd / 2, y0, wd, y1 - y0);
        c.fillStyle = hexA('#ffffff', a * 0.9); if (hor) c.fillRect(x0, (y0 + y1) / 2 - wd / 6, x1 - x0, wd / 3); else c.fillRect((x0 + x1) / 2 - wd / 6, y0, wd / 3, y1 - y0); c.restore();
      }
      c.fillStyle = e.on ? '#ff4fd8' : '#7a5aa0'; if (hor) { c.fillRect(x0 - cs * 0.04, (y0 + y1) / 2 - cs * 0.06, cs * 0.08, cs * 0.12); c.fillRect(x1 - cs * 0.04, (y0 + y1) / 2 - cs * 0.06, cs * 0.08, cs * 0.12); } else { c.fillRect((x0 + x1) / 2 - cs * 0.06, y0 - cs * 0.04, cs * 0.12, cs * 0.08); c.fillRect((x0 + x1) / 2 - cs * 0.06, y1 - cs * 0.04, cs * 0.12, cs * 0.08); }
      return;
    }
    if (e.t === 'arrow') {
      const dx = DIRS[e.d][0], dy = DIRS[e.d][1], sx = (e.a[0] - dx) * cs, sy = (e.a[1] - dy) * cs, hot = e.warn ? 0.5 + 0.5 * Math.sin(now * 30) : e.on ? 1 : 0;
      c.fillStyle = '#5a3412'; c.fillRect(sx + cs * 0.12, sy + cs * 0.12, cs * 0.76, cs * 0.76); c.fillStyle = '#8a5a26'; c.fillRect(sx + cs * 0.16, sy + cs * 0.16, cs * 0.68, cs * 0.14);
      c.fillStyle = '#ffd45e'; c.fillRect(sx + cs * 0.3, sy + cs * 0.38, cs * 0.12, cs * 0.1); c.fillRect(sx + cs * 0.58, sy + cs * 0.38, cs * 0.12, cs * 0.1);
      const mx = sx + cs / 2 + dx * cs * 0.38, my = sy + cs / 2 + dy * cs * 0.38; c.fillStyle = hot ? hexA('#ff5e3a', 0.5 + hot * 0.5) : '#1e0e04'; c.fillRect(mx - cs * (dy ? 0.16 : 0.06), my - cs * (dx ? 0.16 : 0.06), cs * (dy ? 0.32 : 0.12), cs * (dx ? 0.32 : 0.12));
      if (hot) { const rg = c.createRadialGradient(mx, my, 0, mx, my, cs * 0.6); rg.addColorStop(0, hexA('#ff7a3a', 0.45 * hot)); rg.addColorStop(1, 'rgba(255,122,58,0)'); c.fillStyle = rg; c.fillRect(mx - cs * 0.6, my - cs * 0.6, cs * 1.2, cs * 1.2); }
      if (e.on) { c.save(); c.translate(x, y); c.rotate(Math.atan2(dy, dx)); c.fillStyle = '#7a4a1e'; c.fillRect(-cs * 0.4, -cs * 0.035, cs * 0.66, cs * 0.07); c.fillStyle = '#e8e2d0'; c.beginPath(); c.moveTo(cs * 0.38, 0); c.lineTo(cs * 0.22, -cs * 0.1); c.lineTo(cs * 0.22, cs * 0.1); c.fill(); c.fillStyle = '#ff5e5e'; c.fillRect(-cs * 0.42, -cs * 0.09, cs * 0.12, cs * 0.06); c.fillRect(-cs * 0.42, cs * 0.03, cs * 0.12, cs * 0.06); c.restore(); }
      return;
    }
    if (e.look === 'wisp') { const r = cs * 0.34, fl = 0.85 + 0.15 * Math.sin(now * 14 + e.i); const rg = c.createRadialGradient(x, y, 0, x, y, r * 2.6); rg.addColorStop(0, 'rgba(255,255,255,.95)'); rg.addColorStop(0.3, hexA('#b6ff5e', 0.85 * fl)); rg.addColorStop(1, 'rgba(182,255,94,0)'); c.fillStyle = rg; c.beginPath(); c.arc(x, y, r * 2.6, 0, 7); c.fill(); c.fillStyle = '#0b1a06'; c.fillRect(x - r * 0.42, y - r * 0.2, r * 0.24, r * 0.34); c.fillRect(x + r * 0.18, y - r * 0.2, r * 0.24, r * 0.34); return; }
    if (e.t === 'ghost' || e.look === 'ghostb') { const r = cs * 0.36, bob = Math.sin(e.anim * 3) * cs * 0.06, ch2 = e.chase || e.look === 'ghostb', yy = y + bob; c.save(); c.globalAlpha = ch2 ? 0.88 : 0.55;
      const g = c.createRadialGradient(x, yy, 0, x, yy, r * 2); g.addColorStop(0, ch2 ? 'rgba(198,168,255,.35)' : 'rgba(198,168,255,.18)'); g.addColorStop(1, 'rgba(198,168,255,0)'); c.fillStyle = g; c.fillRect(x - r * 2, yy - r * 2, r * 4, r * 4);
      c.fillStyle = '#e8e0ff'; c.beginPath(); c.arc(x, yy - r * 0.1, r, Math.PI, 0); c.lineTo(x + r, yy + r * 0.7); for (let i = 0; i < 4; i++) { const wx = x + r - (i + 0.5) * (r / 2), wy = yy + r * 0.7 + (i % 2 ? 0 : r * 0.25) + Math.sin(now * 8 + i) * r * 0.08; c.lineTo(wx, wy); } c.lineTo(x - r, yy + r * 0.7); c.closePath(); c.fill();
      c.fillStyle = ch2 ? '#ff4f6d' : '#3a2a6a'; c.beginPath(); c.ellipse(x - r * 0.35, yy - r * 0.15, r * 0.16, r * 0.22, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(x + r * 0.35, yy - r * 0.15, r * 0.16, r * 0.22, 0, 0, 7); c.fill(); c.restore(); return; }
    if (e.look === 'fish') { const a = Math.atan2(e.ty - e.fy, e.tx - e.fx) || 0, wv = Math.sin(e.anim * 14) * 0.25; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = '#c0485e'; c.beginPath(); c.moveTo(-cs * 0.32, 0); c.lineTo(-cs * 0.5, -cs * 0.18 + wv * cs * 0.1); c.lineTo(-cs * 0.5, cs * 0.18 + wv * cs * 0.1); c.closePath(); c.fill();
      c.fillStyle = '#ff6a7a'; c.beginPath(); c.ellipse(0, 0, cs * 0.34, cs * 0.22, 0, 0, 7); c.fill(); c.fillStyle = '#ffd0d8'; c.beginPath(); c.ellipse(cs * 0.05, cs * 0.06, cs * 0.22, cs * 0.1, 0, 0, 7); c.fill(); c.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) c.fillRect(cs * (0.16 + i * 0.05), cs * 0.04, cs * 0.04, cs * 0.06);
      c.fillStyle = '#1a0a10'; c.beginPath(); c.arc(cs * 0.18, -cs * 0.07, cs * 0.05, 0, 7); c.fill(); c.restore(); return; }
    if (e.look === 'gem') { const r = cs * 0.3, ph = now * 3 + e.i; c.save(); c.translate(x, y + Math.sin(ph) * cs * 0.05); c.rotate(Math.sin(ph * 0.7) * 0.3); const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.2); g.addColorStop(0, 'rgba(224,208,255,.5)'); g.addColorStop(1, 'rgba(180,140,255,0)'); c.fillStyle = g; c.fillRect(-r * 2.2, -r * 2.2, r * 4.4, r * 4.4);
      c.fillStyle = '#b48cff'; c.beginPath(); c.moveTo(0, -r * 1.3); c.lineTo(r * 0.78, 0); c.lineTo(0, r * 1.3); c.lineTo(-r * 0.78, 0); c.closePath(); c.fill(); c.fillStyle = '#e8fbff'; c.beginPath(); c.moveTo(0, -r * 1.3); c.lineTo(r * 0.78, 0); c.lineTo(0, 0); c.closePath(); c.fill();
      c.fillStyle = '#1a0b33'; c.fillRect(-r * 0.38, -r * 0.08, r * 0.22, r * 0.32); c.fillRect(r * 0.16, -r * 0.08, r * 0.22, r * 0.32); c.restore(); return; }
    if (e.look === 'void') { const r = cs * 0.34; c.save(); c.translate(x, y); c.strokeStyle = hexA('#ff7ae0', 0.8); c.lineWidth = cs * 0.05; c.beginPath(); c.ellipse(0, 0, r * 1.4, r * 0.45, now * 2, 0, 7); c.stroke(); c.fillStyle = '#05010f'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.strokeStyle = hexA('#5ee7ff', 0.9); c.lineWidth = cs * 0.04; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
      c.fillStyle = '#ff7ae0'; c.fillRect(-r * 0.4, -r * 0.15, r * 0.25, r * 0.25); c.fillRect(r * 0.15, -r * 0.15, r * 0.25, r * 0.25); c.restore(); return; }
    if (e.look === 'snow') { const r = cs * 0.34, rl = e.anim * 8; c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x, y + r * 0.9, r * 0.9, r * 0.25, 0, 0, 7); c.fill(); const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#a8cde8'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = '#1a2440'; c.fillRect(x - r * 0.42, y - r * 0.2, r * 0.22, r * 0.26); c.fillRect(x + r * 0.2, y - r * 0.2, r * 0.22, r * 0.26); c.strokeStyle = 'rgba(120,160,200,.6)'; c.lineWidth = cs * 0.03; c.beginPath(); c.arc(x, y, r * 0.7, rl, rl + 1.2); c.stroke(); return; }
    if (e.look === 'ember') { const r = cs * 0.32, fl = 0.85 + 0.15 * Math.sin(now * 16 + e.i); const rg = c.createRadialGradient(x, y, 0, x, y, r * 2.4); rg.addColorStop(0, 'rgba(255,243,176,.95)'); rg.addColorStop(0.35, hexA('#ff7a1a', 0.85 * fl)); rg.addColorStop(1, 'rgba(255,90,31,0)'); c.fillStyle = rg; c.beginPath(); c.arc(x, y, r * 2.4, 0, 7); c.fill();
      c.fillStyle = '#ff5a1f'; c.beginPath(); c.moveTo(x - r * 0.7, y + r * 0.5); c.quadraticCurveTo(x - r * 0.8, y - r * 0.6, x, y - r * 1.3 * fl); c.quadraticCurveTo(x + r * 0.8, y - r * 0.6, x + r * 0.7, y + r * 0.5); c.closePath(); c.fill(); c.fillStyle = '#2a0a04'; c.fillRect(x - r * 0.36, y - r * 0.1, r * 0.2, r * 0.28); c.fillRect(x + r * 0.16, y - r * 0.1, r * 0.2, r * 0.28); return; }
    if (e.look === 'scarab') { const a = Math.abs(e.tx - e.fx) + Math.abs(e.ty - e.fy) > 0.01 ? Math.atan2(e.ty - e.fy, e.tx - e.fx) + Math.PI / 2 : 0, lg = Math.sin(e.anim * 18) * cs * 0.05;
      c.save(); c.translate(x, y); c.rotate(a); c.strokeStyle = '#2a1a06'; c.lineWidth = cs * 0.06; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-cs * 0.2, i * cs * 0.14); c.lineTo(-cs * 0.36, i * cs * 0.18 + (i ? lg : -lg)); c.moveTo(cs * 0.2, i * cs * 0.14); c.lineTo(cs * 0.36, i * cs * 0.18 - (i ? lg : -lg)); c.stroke(); }
      c.fillStyle = '#1a5a5a'; c.beginPath(); c.ellipse(0, cs * 0.04, cs * 0.24, cs * 0.3, 0, 0, 7); c.fill(); c.fillStyle = '#5ef2ff'; c.fillRect(-cs * 0.02, -cs * 0.2, cs * 0.04, cs * 0.5); c.fillStyle = '#e8b84a'; c.beginPath(); c.ellipse(0, -cs * 0.26, cs * 0.14, cs * 0.1, 0, 0, 7); c.fill(); c.fillStyle = '#ff4f4f'; c.fillRect(-cs * 0.08, -cs * 0.3, cs * 0.05, cs * 0.05); c.fillRect(cs * 0.03, -cs * 0.3, cs * 0.05, cs * 0.05); c.restore(); return; }
    if (e.a && e.b && e.t !== 'guard') { c.strokeStyle = hexA(G.pal.edge, 0.18); c.lineWidth = cs * 0.08; c.setLineDash([cs * 0.12, cs * 0.12]); c.beginPath(); c.moveTo((e.a[0] + 0.5) * cs, (e.a[1] + 0.5) * cs); c.lineTo((e.b[0] + 0.5) * cs, (e.b[1] + 0.5) * cs); c.stroke(); c.setLineDash([]); }
    if (e.t === 'saw') {
      const r = cs * 0.42; c.save(); c.translate(x, y); c.rotate(now * 12);
      if (!UI.lowfx) { c.shadowColor = '#ff5e9a'; c.shadowBlur = cs * 0.3; }
      c.fillStyle = '#d9d4f0'; c.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : r * 0.74; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill();
      c.shadowBlur = 0; c.fillStyle = '#8a80b8'; c.beginPath(); c.arc(0, 0, r * 0.5, 0, 7); c.fill(); c.fillStyle = '#ff5e9a'; c.beginPath(); c.arc(0, 0, r * 0.2, 0, 7); c.fill(); c.restore();
    } else if (e.t === 'block') {
      const s = cs * 0.78; c.save(); c.translate(x, y);
      c.fillStyle = '#ff4f7b'; for (let i = 0; i < 4; i++) { c.save(); c.rotate((i * Math.PI) / 2); for (let j = -1; j <= 1; j++) { c.beginPath(); c.moveTo(j * s * 0.3 - s * 0.1, -s / 2); c.lineTo(j * s * 0.3, -s / 2 - cs * 0.1); c.lineTo(j * s * 0.3 + s * 0.1, -s / 2); c.fill(); } c.restore(); }
      c.fillStyle = '#4a3a7a'; c.fillRect(-s / 2, -s / 2, s, s); c.fillStyle = '#6a58a8'; c.fillRect(-s / 2, -s / 2, s, s * 0.18); c.fillStyle = '#2a1f4a'; c.fillRect(-s / 2, s * 0.32, s, s * 0.18);
      c.fillStyle = '#ffe066'; c.fillRect(-s * 0.3, -s * 0.12, s * 0.18, s * 0.14); c.fillRect(s * 0.12, -s * 0.12, s * 0.18, s * 0.14); c.fillStyle = '#ff4f7b'; c.fillRect(-s * 0.22, s * 0.12, s * 0.44, s * 0.08); c.restore();
    } else if ((e.t === 'slime' || e.t === 'bat') && WORLDS[G.wi].deco === 'coral') { drawSea(c, e, x, y, now);
    } else if (e.t === 'slime' || e.t === 'bat') {
      const fr = Math.floor(e.anim * (e.t === 'bat' ? 8 : 4)) % 2, sp = pixSprite(e.t + wi + fr, PX[e.t][fr], PXCOL[e.t][wi]), s = cs * (e.t === 'bat' ? 0.95 : 0.8), bob = e.t === 'bat' ? Math.sin(e.anim * 6) * cs * 0.06 : 0;
      c.save(); c.imageSmoothingEnabled = false; c.translate(x, y + bob); if (e.dirx < 0) c.scale(-1, 1); c.drawImage(sp, -s / 2, -s * (sp.height / sp.width) / 2, s, s * (sp.height / sp.width)); c.restore();
    } else if (e.t === 'chaser') {
      const fr = Math.floor(e.anim * 6) % 2, sp = pixSprite('chaser' + fr, PX.chaser[fr], PXCOL.chaser), s = cs * 0.9;
      if (e.chase) { const rg = c.createRadialGradient(x, y, 0, x, y, cs); rg.addColorStop(0, 'rgba(255,61,127,.35)'); rg.addColorStop(1, 'rgba(255,61,127,0)'); c.fillStyle = rg; c.fillRect(x - cs, y - cs, cs * 2, cs * 2); }
      c.save(); c.imageSmoothingEnabled = false; c.globalAlpha = e.chase ? 1 : 0.75; c.drawImage(sp, x - s / 2, y - s / 2 + Math.sin(e.anim * 4) * cs * 0.05, s, s * (sp.height / sp.width)); c.restore();
    } else if (e.t === 'wisp') {
      const r = cs * 0.3, fl = 0.85 + 0.15 * Math.sin(now * 20 + e.i);
      const rg = c.createRadialGradient(x, y, 0, x, y, r * 2.4); rg.addColorStop(0, 'rgba(255,255,255,.95)'); rg.addColorStop(0.25, hexA(G.pal.accent, 0.85 * fl)); rg.addColorStop(1, hexA(G.pal.accent, 0)); c.fillStyle = rg; c.beginPath(); c.arc(x, y, r * 2.4, 0, 7); c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(x - r * 0.35, y - r * 0.2, r * 0.22, r * 0.3); c.fillRect(x + r * 0.13, y - r * 0.2, r * 0.22, r * 0.3);
    } else if (e.t === 'guard') {
      const fr = Math.floor(e.anim * 3) % 2, sp = pixSprite('guard' + wi + fr, PX.guard[fr], PXCOL.guard[wi]), s = cs * 0.92;
      c.save(); c.imageSmoothingEnabled = false; c.drawImage(sp, x - s / 2, y - s / 2, s, s * (sp.height / sp.width)); c.restore();
    }
  }
  function drawTrail(c, now) {
    const tr = G.trail; if (tr.length < 2) return;
    const cs = UI.cs, sk = skinById(data().skin).trail, nowT = G.time + G.endT;
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1], b = tr[i]; if (a.br || b.br) continue;
        const k = 1 - (nowT - b.t) / 0.24; if (k <= 0) continue;
        const sp = clamp((b.sp - V0) / (VMAX - V0), 0.2, 1.2), w = cs * (pass ? 0.12 : 0.42) * k * (0.6 + sp * 0.5);
        let col = pass ? '#ffffff' : sk.b;
        if (sk.kind === 'rainbow' && !pass) col = `hsl(${(i * 18 + now * 300) % 360},100%,65%)`;
        c.strokeStyle = col.startsWith('#') ? hexA(col, (pass ? 0.75 : 0.5) * k) : col.replace('65%)', `65%,${0.55 * k})`).replace('hsl', 'hsla');
        c.lineWidth = w; c.beginPath(); c.moveTo(a.x * cs, a.y * cs); c.lineTo(b.x * cs, b.y * cs); c.stroke();
      }
    }
    c.restore();
  }
  function drawMilo(c, now) {
    const m = G.milo, cs = UI.cs, sk = skinById(data().skin), im = skinImg(sk.id); if (!im.ok) return;
    let pose = m.pose, ax = 0, ay = 0, rot = 0, sxs = 1, sys = 1, alpha = 1, runF = 0;
    const x = (m.px + 0.5) * cs, y = (m.py + 0.5) * cs;
    if (G.state === 'dead') {
      const t = G.endT; if (t > 0.45) { pose = 'fail'; ay = -(t - 0.45) * cs * 1.6; alpha = Math.max(0, 1 - (t - 0.45) / 1.1); rot = Math.sin(t * 6) * 0.15; } else { pose = 'hurt'; rot = Math.sin(t * 40) * 0.25 * (1 - t / 0.45); const k = 1 + Math.sin((t / 0.45) * Math.PI) * 0.25; sxs = k; sys = k; }
    } else if (G.state === 'win') { pose = 'win'; ay = -Math.abs(Math.sin(G.endT * 7)) * cs * 0.25; const k = 1 + Math.min(0.25, G.endT * 0.6); sxs = k; sys = k; }
    else if (m.moving) {
      // cycle de course en 12 phases synchronisé sur la vitesse réelle
      // vraie course : images de la planche, cadence liée à la vitesse + léger rebond (les images portent déjà le mouvement)
      const cyc = m.phase * 0.12, ph = (cyc % 1) * Math.PI * 4; runF = 1 + (Math.floor(cyc * sk.n) % sk.n);
      const st = 0.03 + 0.03 * clamp((m.sp - V0) / (VMAX - V0), 0, 1);
      if (m.d % 2) { sxs = 1 + st; sys = 1 - st * 0.8; ay = -Math.abs(Math.sin(ph)) * cs * 0.05; rot = m.face * 0.05; }
      else { sxs = 1 - st * 0.6; sys = 1 + st; ay = -Math.abs(Math.sin(ph)) * cs * 0.03; rot = (m.d === 0 ? -0.04 : 0.04) * m.face; }
    } else {
      if (pose === 'idle' && G.state === 'ready' && UI.ptr) pose = 'prep';
      if (pose === 'idle' && G.state === 'play' && UI.ptr) pose = 'prep';
      ay = Math.sin(now * 2.6) * cs * 0.05; const b = Math.sin(now * 2.6) * 0.025; sxs = 1 + b; sys = 1 - b;
      if (G.bon.shield && pose === 'idle') pose = 'shield';
    }
    // impact : écrasement contre le mur
    if (m.sq > 0.01 && G.state !== 'dead') { const q = Math.min(0.32, m.sq * 0.4); if (m.sqDir) { sys *= 1 - q; sxs *= 1 + q * 0.8; ay += (m.impD === 0 ? -1 : 1) * cs * q * 0.35; } else { sxs *= 1 - q; sys *= 1 + q * 0.8; ax += (m.impD === 3 ? -1 : 1) * cs * q * 0.35; } }
    if (m.invT > 0 && Math.floor(now * 20) % 2) alpha *= 0.45;
    // image : course / victoire (yeux plissés) / repos pour tout le reste ; le blessé est teinté en rouge
    const S = cs * 1.62, fi = runF || (pose === 'win' || pose === 'collect' ? sk.n + 1 : 0), FS = 192;
    // ombre portée
    c.save(); c.globalAlpha = 0.25 * alpha; c.fillStyle = '#000'; c.beginPath(); c.ellipse(x, y + cs * 0.42, cs * 0.3 * sxs, cs * 0.08, 0, 0, 7); c.fill(); c.restore();
    // bulle de bouclier (en mouvement)
    if (G.bon.shield && pose !== 'shield' && G.state === 'play') { const r = cs * 0.66, p = 0.7 + 0.3 * Math.sin(now * 5); const rg = c.createRadialGradient(x, y, r * 0.6, x, y, r); rg.addColorStop(0, 'rgba(94,200,255,0)'); rg.addColorStop(0.85, `rgba(140,215,255,${0.35 * p})`); rg.addColorStop(1, `rgba(220,245,255,${0.7 * p})`); c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    c.save(); c.globalAlpha = alpha; c.translate(x + ax, y + ay); c.rotate(rot); c.scale(sxs * (pose === 'fail' ? 1 : m.face), sys);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(im, fi * FS, 0, FS, FS, -S / 2, -S / 2, S, S);
    if (pose === 'hurt') { const t = tinted(im, fi, FS); if (t) { c.globalAlpha = alpha * 0.55; c.drawImage(t, -S / 2, -S / 2, S, S); } }
    c.restore();
    if (G.grav >= 0 && G.state === 'play') { const gx = x + DIRS[G.grav][0] * cs * 0.62, gy = y + DIRS[G.grav][1] * cs * 0.62, pu = 0.6 + 0.4 * Math.sin(now * 6); c.save(); c.translate(gx, gy); c.rotate(G.grav * Math.PI / 2); c.fillStyle = hexA('#ff9de9', pu); c.beginPath(); c.moveTo(-cs * 0.13, -cs * 0.04); c.lineTo(cs * 0.13, -cs * 0.04); c.lineTo(0, -cs * 0.2); c.closePath(); c.fill(); c.restore(); }
    if (G.bon.magnet > 0 && G.state === 'play') { c.save(); c.strokeStyle = 'rgba(255,94,122,.25)'; c.setLineDash([cs * 0.1, cs * 0.14]); c.lineDashOffset = -now * cs; c.lineWidth = cs * 0.04; c.beginPath(); c.arc(x, y, G.magnetR * cs, 0, 7); c.stroke(); c.restore(); }
  }

  // copie teintée en rouge d'une image (flash de dégât), mise en cache
  function tinted(im, fi, FS) {
    const k = im.src + '#' + fi; UI.tint = UI.tint || {}; if (UI.tint[k]) return UI.tint[k];
    const cv = document.createElement('canvas'); cv.width = cv.height = FS; const x = cv.getContext('2d');
    x.drawImage(im, fi * FS, 0, FS, FS, 0, 0, FS, FS); x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#ff3355'; x.fillRect(0, 0, FS, FS);
    return (UI.tint[k] = cv);
  }

  /* ---------- Boucle ---------- */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = last ? (now - last) / 1000 : 0; last = now; if (dt > 0.05) dt = 0.05;
    if (UI.screen !== 'game' || !G) return;
    update(dt); draw(dt);
    UI.hudT = (UI.hudT || 0) + dt; if (UI.hudT > 0.1) { UI.hudT = 0; hudTick(); }
    if (Music.want && audio()) Music.start(G.wi);
  }
  function startLoop() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  /* =====================================================================
     HUD
     ===================================================================== */
  function gameHTML() {
    return `<div class="mz-game"><canvas class="mz-cv" aria-label="Labyrinthe de Milo Maze"></canvas>
      <div class="mz-hud">
        <div class="mz-row"><button class="gclose" data-mz="pause" aria-label="Pause">${MG.icon('pause')}</button>
          <div class="mz-pill mz-coins"><i class="mz-ic coin"></i><b data-h="coins">0</b><span data-h="ctot">/0</span></div>
          <div class="mz-stars" data-h="stars">${objLabels(G).map((t) => `<i title="${t}"></i>`).join('')}</div>
          <div class="mz-pill mz-time">${ico('clock')}<b data-h="time">0:00</b></div></div>
        ${G.boss ? `<div class="mz-bossbar"><b>${G.boss.name}</b><div class="mz-bhp"><i data-h="bhp"></i></div></div>` : `<div class="mz-prog"><i data-h="prog"></i><span>${lvLabel(G.wi, G.li)} · ${WORLDS[G.wi].short}</span></div>`}
        <div class="mz-xtra" data-h="xtra"></div>
        <div class="mz-bons" data-h="bons"></div>
      </div>
      <div class="mz-obj${G.L.tip ? ' tip' : ''}" data-h="obj"><small>Objectifs</small>${G.L.tip ? `<em>${G.L.tip}</em>` : ''}${objLabels(G).map((t) => `<span>${MG.icon('star')}${t}</span>`).join('')}</div>
      <div class="mz-hint" data-h="hint"><div class="mz-hand"></div><b>Glisse ton doigt</b><span>Milo fonce jusqu’au prochain mur</span></div>
    </div>`;
  }
  function hud() {
    if (!root || !G) return; const H = UI.hudEls;
    if (H.ctot) H.ctot.textContent = '/' + G.coinsTotal;
    const bons = []; const b = G.bon;
    if (b.shield) bons.push(['Bouclier', 4, BONUS.B.color, '']);
    if (b.tele) bons.push(['Téléport', 5, BONUS.T.color, '×' + b.tele]);
    if (b.magnet > 0) bons.push(['Aimant', 2, BONUS.M.color, Math.ceil(b.magnet) + 's']);
    if (b.speed > 0) bons.push(['Vitesse', 3, BONUS.V.color, Math.ceil(b.speed) + 's']);
    if (b.slow > 0) bons.push(['Ralenti', -1, BONUS.R.color, Math.ceil(b.slow) + 's']);
    if (G.fly > 0) bons.push(['Lucioles', -2, '#d8ff8a', Math.ceil(G.fly) + 's']);
    if (G.invT > 0) bons.push(['Inversé', -3, '#ff7ae0', Math.ceil(G.invT) + 's']);
    const html = bons.map(([n, i, col, t]) => `<div class="mz-bon" style="--c:${col}">${i >= 0 ? `<i class="mz-ic" style="background-position:${i * 20}% 0"></i>` : i === -2 ? '<i class="mz-ic ff"></i>' : i === -3 ? '<i class="mz-ic iv"></i>' : '<i class="mz-ic hg"></i>'}<b>${t}</b></div>`).join('');
    if (H.bons && H.bons._h !== html) { H.bons._h = html; H.bons.innerHTML = html; }
    // cœurs, cristaux, clé/relique, règle de défi
    const x = [];
    if (G.maxHearts > 1) x.push(`<span class="mz-hrt">${Array.from({ length: G.maxHearts }, (_, i) => ico('heart', i < G.hearts ? 'on' : '')).join('')}</span>`);
    if (G.crTotal) x.push(`<span class="mz-xc${G.crystals >= G.crTotal ? ' ok' : ''}">${ico('gem')}${G.crystals}/${G.crTotal}</span>`);
    if (G.L.ksol) x.push(`<span class="mz-xk${G.key ? ' ok' : ''}">${ico('key')}${G.key ? 'Clé' : '?'}</span>`);
    if (G.L.qsol) x.push(`<span class="mz-xk${G.relic ? ' ok' : ''}">${ico('relic')}${G.relic ? 'Relique' : '?'}</span>`);
    if (G.lava) x.push(`<span class="mz-xl">${ico('lava')}Lave <b data-lv>–</b></span>`);
    if (G.o2Max) x.push('<span class="mz-xo">O₂<i><b data-o2></b></i></span>');
    if (G.grav >= 0) x.push(`<span class="mz-xg">Gravité ${'↑→↓←'[G.grav]}</span>`);
    if (G.prisms) x.push(`<span class="mz-xp${lightOpen() ? ' ok' : ''}">${ico('prism')}${G.lit.size}/${G.prisms}</span>`);
    if (G.hasCyc) x.push(`<span class="mz-xv" title="Murs du néant : couleur qui bloque, puis la suivante">Mur<i class="v${G.cyc} on"></i><u>›</u><i class="v${(G.cyc + 1) % 3}"></i></span>`);
    if (G.rule && G.rule.t === 'nohit') x.push('<span class="mz-xr">Sans coup</span>');
    if (G.rule && G.rule.t === 'allcoins') x.push(`<span class="mz-xr${G.exitOpen ? ' ok' : ''}">${G.exitOpen ? 'Sortie ouverte' : `Encore ${G.coinsTotal - G.got} pièces`}</span>`);
    const xh = x.join(''); if (H.xtra && H.xtra._h !== xh) { H.xtra._h = xh; H.xtra.innerHTML = xh; }
    hudTick();
  }
  function hudTick() {
    if (!root || !G) return; const H = UI.hudEls; applyVolumes();
    if (H.coins && H.coins._v !== G.got) { H.coins._v = G.got; H.coins.textContent = G.got; }
    if (H.time) { const tm = G.rule && G.rule.t === 'timer', left = tm ? Math.max(0, G.rule.s - G.time) : 0, v = fmtT(tm ? left : G.time).replace(/\.\d$/, ''); if (H.time._v !== v) { H.time._v = v; H.time.textContent = v; H.time.parentNode.classList.toggle('late', tm ? left < 6 : G.time > G.L.par); } }
    if (H.prog && G.exit) { const k = clamp((G.startY - G.milo.py) / Math.max(1, G.startY - G.exit[1]), 0, 1); H.prog.style.width = Math.round(k * 100) + '%'; }
    if (G.o2Max && H.xtra) { const el = H.xtra.querySelector('[data-o2]'); if (el) { const k = clamp(G.o2 / G.o2Max, 0, 1), w = Math.round(k * 100) + '%'; if (el._v !== w) { el._v = w; el.style.width = w; el.parentNode.parentNode.classList.toggle('low', k < 0.3); } } }
    if (G.lava && H.xtra) { const el = H.xtra.querySelector('[data-lv]'); if (el) { const v = Math.max(0, Math.floor(G.lavaY - G.milo.py - 1)); if (el._v !== v) { el._v = v; el.textContent = v + (v > 1 ? ' cases' : ' case'); el.parentNode.classList.toggle('hot', v < 5); } } }
    if (H.bhp && G.boss) { const w = Math.round((G.boss.hp / G.boss.max) * 100) + '%'; if (H.bhp._v !== w) { H.bhp._v = w; H.bhp.style.width = w; } }
    if (G.rule && G.rule.t === 'allcoins' && UI.lastGot !== G.got) { UI.lastGot = G.got; hud(); }
    if (H.stars) { const s = H.stars.children; s[0].className = G.state === 'win' ? 'on' : ''; s[1].className = objCls(G, 1); s[2].className = objCls(G, 2); }
    ['magnet', 'speed', 'slow'].forEach((k) => {}); if (G.bon.magnet > 0 || G.bon.speed > 0 || G.bon.slow > 0 || G.fly > 0 || G.invT > 0) { const t = Math.ceil(G.bon.magnet) + ':' + Math.ceil(G.bon.speed) + ':' + Math.ceil(G.bon.slow) + ':' + Math.ceil(G.fly) + ':' + Math.ceil(G.invT); if (t !== UI.bonT) { UI.bonT = t; hud(); } }
  }
  function bumpHud(k) { const el = UI.hudEls[k]; if (!el) return; el.textContent = G.got; el._v = G.got; const p = el.parentNode; p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
  function hideHint() { const h = UI.hudEls.hint; if (h) h.classList.add('out'); const o = UI.hudEls.obj; if (o) setTimeout(() => o.classList.add('out'), G && G.L.tip ? 2600 : 700); }

  /* =====================================================================
     DÉMARRAGE / FIN DE NIVEAU
     ===================================================================== */
  function startLevel(wi, li) {
    closeModal(); stopLoop();
    G = loadLevel(wi, li); UI.screen = 'game';
    root.querySelectorAll('.mz-scr').forEach((e) => e.remove());
    root.querySelectorAll('.mz-game').forEach((e) => e.remove());
    root.insertAdjacentHTML('afterbegin', gameHTML());
    cv = root.querySelector('.mz-cv'); ctx = cv.getContext('2d');
    UI.hudEls = {}; root.querySelectorAll('[data-h]').forEach((e) => (UI.hudEls[e.dataset.h] = e));
    if (!(settings().hints && (wi === 0 && li < 2 || !data().seenTuto))) UI.hudEls.hint.classList.add('out');
    layout(); hud(); if (G.boss) layout(); startLoop();
    clearTimeout(UI.objT); UI.objT = setTimeout(() => { const o = UI.hudEls.obj; if (o) o.classList.add('out'); }, G.L.tip ? 6500 : 4200);
    const s = data().stats; s.runs = (s.runs || 0) + 1; data().last = lvKey(wi, li); api.save();
    Music.start(wi);
  }
  function layout() {
    if (!root || !cv || !G) return;
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const d = Math.min(2, window.devicePixelRatio || 1); let cs = Math.max(18, Math.floor(Math.min(r.width / G.W, r.height / 12)));
    // boss : caméra fixe, toute l'arène + la créature visibles sous le HUD
    if (G.boss) { const hud = root.querySelector('.mz-hud'), hb = hud ? hud.getBoundingClientRect().bottom - r.top : 120; cs = Math.max(16, Math.floor(Math.min(r.width / G.W, (r.height - hb - 6) / G.H))); G.bossCam = -(hb + 2) / cs; G.cam = G.camT = G.bossCam; }
    UI.vw = r.width; UI.vh = r.height; UI.dpr = d; UI.ox = Math.floor((r.width - cs * G.W) / 2);
    cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
    if (cs !== UI.cs || UI.chunkLv !== G.L || UI.chunkDpr !== d || UI.chunkLow !== UI.lowfx) { UI.cs = cs; UI.chunkLv = G.L; UI.chunkDpr = d; UI.chunkLow = UI.lowfx; buildChunks(); }
    UI.vig = null;
  }
  // ---- objectifs : 1re étoile = sortie, 2e = objectif secondaire, 3e = performance (L.obj = [secondaire, performance])
  // keep : objectif « à conserver » (acquis au départ, perdu en cours de route) ; sinon objectif « à atteindre »
  const OBJ = {
    coins: { lbl: (g, o) => `${Math.ceil(g.coinsTotal * (o.p || 0.7))} pièces`, ok: (g, o) => g.got >= Math.ceil(g.coinsTotal * (o.p || 0.7)) },
    allcoins: { lbl: () => 'Toutes les pièces', ok: (g) => g.got >= g.coinsTotal },
    time: { lbl: (g, o) => `Moins de ${Math.round((o.s || g.L.par) * (o.k || 1))} s`, ok: (g, o) => g.time <= (o.s || g.L.par) * (o.k || 1), keep: true },
    nohit: { lbl: (g) => (g.maxHearts > 1 ? 'Sans perdre de cœur' : 'Sans prendre de coup'), ok: (g) => g.hits === 0, keep: true },
    nobonus: { lbl: () => 'Sans ramasser de bonus', ok: (g) => !g.bonusUsed, keep: true },
    crystals: { lbl: (g) => `${g.crTotal || 3} cristaux`, ok: (g) => g.crTotal > 0 && g.crystals >= g.crTotal },
    key: { lbl: () => 'Trouver la clé secrète', ok: (g) => g.key },
    relic: { lbl: () => 'Trouver la relique', ok: (g) => g.relic }
  };
  const objOf = (L) => (L.obj && L.obj.length === 2 ? L.obj : [{ t: 'coins', p: 0.7 }, { t: 'time' }]);
  const objLabels = (g) => ['Sortie'].concat(objOf(g.L).map((o) => (OBJ[o.t] ? OBJ[o.t].lbl(g, o) : '—')));
  const objOk = (g, k) => { const o = objOf(g.L)[k - 1], O = o && OBJ[o.t]; return O ? O.ok(g, o) : false; };
  const objCls = (g, k) => { const o = objOf(g.L)[k - 1], O = OBJ[o.t] || {}, ok = objOk(g, k); return O.keep ? (ok ? 'on soft' : 'off') : ok ? 'on' : ''; };
  function starsOf(g) { return [1, objOk(g, 1) ? 1 : 0, objOk(g, 2) ? 1 : 0]; }
  function scoreOf(g, st) { const n = st.reduce((a, b) => a + b, 0); return g.got * 10 + n * 150 + g.crystals * 50 + (g.boss ? g.hearts * 200 : 0) + Math.max(0, Math.round((g.L.par * 1.6 - g.time) * 12)) + (g.hits === 0 ? 100 : 0); }
  function endLevel(won) {
    if (!G) return;
    const d = data(), key = lvKey(G.wi, G.li), rec = (d.lv = d.lv || {})[key] || {};
    d.coins = (d.coins || 0) + G.got; const s = d.stats; s.coinsTotal = (s.coinsTotal || 0) + G.got;
    let st = [0, 0, 0], score = G.got * 10, newBest = false, unlocks = []; const gains = [];
    if (won) {
      st = starsOf(G); score = scoreOf(G, st); const n = st.reduce((a, b) => a + b, 0);
      newBest = !rec.best || score > rec.best;
      d.lv[key] = { stars: Math.max(rec.stars || 0, n), best: Math.max(rec.best || 0, score), time: rec.time ? Math.min(rec.time, +G.time.toFixed(1)) : +G.time.toFixed(1), done: (rec.done || 0) + 1 };
      s.wins = (s.wins || 0) + 1;
      const C = col(G.wi);
      if (G.crTotal) { C.cr = C.cr || {}; C.cr[key] = Math.max(C.cr[key] || 0, G.crystals); }
      if (G.chests) { C.ch = C.ch || {}; const was = C.ch[key] || 0; if (G.chests > was) { const b = (G.chests - was) * CHEST_COINS; d.coins += b; gains.push(['chest', `Coffre${G.chests - was > 1 ? 's' : ''} : +${b} pièces`]); C.ch[key] = G.chests; } }
      if (G.key && !C.key) { C.key = 1; gains.push(['key', 'Niveau secret débloqué !']); }
      if (G.relic && !C.relic) { C.relic = 1; gains.push(['relic', 'Relique ajoutée à ta collection']); }
      if (G.boss && !C.boss) { const fin = WORLDS[G.wi].id === 'finale', bc = fin ? FINAL_COINS : BOSS_COINS; C.boss = 1; d.coins += bc; gains.push(['trophy', `Trophée : ${G.boss.name} · +${bc} pièces`]); if (fin) gains.push(['relic', 'Aventure terminée : Milo a traversé les 12 mondes !']); }
      // skins débloqués en terminant un monde ou en réunissant des étoiles
      SKINS.forEach((sk) => { if ((d.owned || {})[sk.id]) return; if ((sk.world && worldDone(sk.world)) || (sk.stars && totalStars() >= sk.stars)) { (d.owned = d.owned || { classic: true })[sk.id] = true; unlocks.push(sk); } });
    }
    if (won) rememberOpen(d);
    api.save(); Music.target = 0;
    showEnd(won, st, score, rec.best || 0, newBest, unlocks, gains);
  }
  // ---- progression par mondes (les mondes sans niveaux sont « bientôt » et ne bloquent pas la suite)
  const done = (wi, li) => ((((data().lv || {})[lvKey(wi, li)] || {}).stars) || 0) > 0;
  function worldDone(w) { const wi = typeof w === 'string' ? wIdx(w) : w; return hasContent(wi) && CONTENT[wi].every((_, li) => done(wi, li)); }
  function prevContent(wi) { for (let k = wi - 1; k >= 0; k--) if (hasContent(k)) return k; return -1; }
  function worldOpen(wi) {
    if (!hasContent(wi)) return false; const p = prevContent(wi); if (p < 0) return true;
    const wo = data().wopen; if (wo && wo[WORLDS[wi].id]) return true; // monde déjà ouvert avant la V2 : jamais reverrouillé
    if (CONTENT[wi].some((_, li) => done(wi, li))) return true; // progression déjà commencée : jamais reverrouillée
    return done(p, CONTENT[p].length - 1);
  }
  const CHAL_AFTER = [4, 9, 14]; // défi 1 après le niveau 5, défi 2 après le 10, défi 3 après le boss
  function unlocked(wi, li) {
    if (!worldOpen(wi)) return false;
    if (typeof li === 'string') { if (li === 's') return !!SECRET[wi] && !!col(wi).key; const need = CHAL_AFTER[+li.slice(1)]; return !!CHAL[wi][+li.slice(1)] && CONTENT[wi].length > need && (done(wi, need) || done(wi, li)); }
    return li === 0 || done(wi, li - 1) || done(wi, li);
  }
  // accès aux mondes déjà ouverts avant l'ajout des niveaux 7 à 15 (calculé une seule fois)
  function keepOpen(d) {
    d.wopen = d.wopen || {}; const played = Object.keys(d.lv || {}).length > 0;
    const prevLeg = (wi) => { for (let k = wi - 1; k >= 0; k--) if (LEGACY_N[k]) return k; return -1; }; // ordre des mondes d'origine
    if (!d.wopenV) { if (played) WORLDS.forEach((W, wi) => { if (!LEGACY_N[wi]) return; const p = prevLeg(wi), any = CONTENT[wi].slice(0, LEGACY_N[wi]).some((_, li) => done(wi, li)); if (any || (p >= 0 && done(p, LEGACY_N[p] - 1))) d.wopen[W.id] = 1; }); d.wopenV = 1; }
    // la Forêt s'insère avant le Temple des sables : qui avait déjà battu le boss du Labyrinthe cyber garde l'accès aux Sables
    if (!d.wopenV3) { const cy = wIdx('cyber'); if (played && cy >= 0 && done(cy, CONTENT[cy].length - 1)) d.wopen.sables = 1; d.wopenV3 = 1; }
    // la Glace et le Volcan s'insèrent avant la Dimension cosmique : qui avait battu le boss des Sables garde l'accès au Cosmos
    if (!d.wopenV4) { const sb = wIdx('sables'); if (played && sb >= 0 && done(sb, CONTENT[sb].length - 1)) d.wopen.cosmos = 1; d.wopenV4 = 1; }
    // l'Atlantide s'insère avant la Dimension cosmique : qui avait battu le boss du Volcan garde l'accès au Cosmos
    if (!d.wopenV5) { const vo = wIdx('volcan'); if (played && vo >= 0 && done(vo, CONTENT[vo].length - 1)) d.wopen.cosmos = 1; d.wopenV5 = 1; }
    if (played) rememberOpen(d);
  }
  // pour tous les ajouts à venir : un monde ouvert une fois reste ouvert (au lancement et à chaque fin de niveau)
  function rememberOpen(d) { d.wopen = d.wopen || {}; WORLDS.forEach((W, wi) => { if (!d.wopen[W.id] && worldOpen(wi)) d.wopen[W.id] = 1; }); }
  function nextOf(wi, li) { if (typeof li !== 'number') return null; if (li + 1 < CONTENT[wi].length) return [wi, li + 1]; for (let k = wi + 1; k < WORLDS.length; k++) if (hasContent(k)) return [k, 0]; return null; }
  const allKeys = (wi) => (CONTENT[wi] || []).map((_, li) => li).concat((CHAL[wi] || []).map((_, k) => 'd' + k), SECRET[wi] ? ['s'] : []);
  function worldStars(wi) { let n = 0; allKeys(wi).forEach((li) => (n += ((data().lv || {})[lvKey(wi, li)] || {}).stars || 0)); return n; }
  const worldMax = (wi) => allKeys(wi).length * 3;
  const worldDoneN = (wi) => (CONTENT[wi] || []).filter((_, li) => done(wi, li)).length;
  // collection d'un monde : cristaux, coffres, clé, relique, trophée du boss
  function colStats(wi) {
    const C = col(wi), o = { cr: 0, crMax: 0, ch: 0, chMax: 0, key: null, relic: null, boss: null };
    allKeys(wi).forEach((li) => { const t = levelAt(wi, li).rows.join(''), k = lvKey(wi, li), nc = (t.match(/\*/g) || []).length, nh = (t.match(/C/g) || []).length;
      o.crMax += nc; o.chMax += nh; o.cr += Math.min(nc, (C.cr || {})[k] || 0); o.ch += Math.min(nh, (C.ch || {})[k] || 0);
      if (t.includes('K')) o.key = C.key ? 1 : 0; if (t.includes('Q')) o.relic = C.relic ? 1 : 0; if (levelAt(wi, li).boss) o.boss = C.boss ? 1 : 0; });
    return o;
  }
  // complétion : niveaux terminés + étoiles + objets de collection
  function pctParts(wi) {
    const keys = allKeys(wi); if (!keys.length) return [0, 0]; const cs = colStats(wi); let a = 0, m = keys.length * 4 + cs.crMax + cs.chMax;
    keys.forEach((li) => { a += (done(wi, li) ? 1 : 0) + (((data().lv || {})[lvKey(wi, li)] || {}).stars || 0); });
    a += cs.cr + cs.ch; ['key', 'relic', 'boss'].forEach((k) => { if (cs[k] != null) { m++; a += cs[k]; } }); return [a, m];
  }
  function worldPct(wi) { const [a, m] = pctParts(wi); return m ? Math.round((a / m) * 100) : 0; }
  function globalPct() { let a = 0, m = 0; WORLDS.forEach((_, wi) => { const p = pctParts(wi); a += p[0]; m += p[1]; }); return m ? Math.round((a / m) * 100) : 0; }
  const maxStars = () => WORLDS.reduce((n, _, wi) => n + worldMax(wi), 0);
  function totalStars() { let n = 0; WORLDS.forEach((_, wi) => (n += worldStars(wi))); return n; }
  function totalScore() { const d = data(); let n = 0; Object.values(d.lv || {}).forEach((r) => (n += r.best || 0)); return n; }
  // prochaine récompense la plus proche (skins liés à un monde ou à des étoiles)
  function nextReward() {
    const own = data().owned || {}, tot = totalStars(); let best = null;
    SKINS.forEach((s) => {
      if (own[s.id]) return; let c = null;
      if (s.world) { const wi = wIdx(s.world); if (hasContent(wi)) { const n = CONTENT[wi].length, dn = worldDoneN(wi); c = { sk: s, txt: `Termine ${WORLDS[wi].name}`, k: `${dn}/${n}`, left: (n - dn) * 3 }; } }
      if (s.stars && s.stars <= maxStars()) { const left = s.stars - tot; if (left > 0 && (!c || left < c.left)) c = { sk: s, txt: `Réunis ${s.stars} étoiles`, k: `${tot}/${s.stars}`, left }; }
      if (c && (!best || c.left < best.left)) best = c;
    });
    return best;
  }

  /* =====================================================================
     ÉCRANS
     ===================================================================== */
  function modal(html, cls) { closeModal(); const m = document.createElement('div'); m.className = 'gmodal mz-modal ' + (cls || ''); m.innerHTML = html; root.appendChild(m); return m; }
  function closeModal() { root && root.querySelectorAll('.mz-modal').forEach((m) => m.remove()); }
  // vignette : portrait net (repos) ou image de la planche (course / victoire)
  const spriteBox = (skin, state, cls) => { const sk = skinById(skin), f = state === 'win' || state === 'collect' ? sk.n + 1 : state === 'run' ? 1 : 0;
    return f ? `<span class="mz-spr ${cls || ''}" style="background-image:url(${MG.asset('maze/mk_' + sk.id + '.webp')});background-size:${(sk.n + 2) * 100}% 100%;background-position:${(f / (sk.n + 1)) * 100}% 0"></span>`
      : `<span class="mz-spr ${cls || ''}" style="background-image:url(${MG.asset('maze/mp_' + sk.id + '.webp')});background-size:contain;background-position:center"></span>`; };
  const coinPill = () => `<div class="mz-wallet"><i class="mz-ic coin"></i><b>${MG.fmt(data().coins || 0)}</b></div>`;
  function topbar(back) { return `<div class="gtop mz-top">${back ? `<button class="gclose" data-mz="${back}" aria-label="Retour">${ico('back')}</button>` : ''}${coinPill()}<div class="grow"></div>${MG.soundBtn()}<button class="gclose" data-mz="exit" aria-label="Fermer Milo Maze">${MG.icon('x')}</button></div>`; }
  function screen(name, opt) {
    stopLoop(); Music.stop(); closeModal(); clearInterval(UI.skinTimer); UI.ptr = null;
    if (G && UI.screen === 'game') G.paused = true;
    UI.screen = name; root.querySelectorAll('.mz-scr').forEach((e) => e.remove()); root.querySelectorAll('.mz-game').forEach((e) => e.remove()); G = null;
    const d = data(), el = document.createElement('div'); el.className = 'mz-scr gscroll mzs-' + name;
    if (name === 'home') {
      const sk = d.skin || 'classic';
      el.innerHTML = `${topbar(null)}<div class="mz-in mz-homein">
        <img class="mz-logo" src="${MG.asset('logo_maze.webp')}" alt="Milo Maze" draggable="false">
        <div class="mz-stage">${spriteBox(sk, 'idle', 'mz-hero')}<i class="mz-plat"></i></div>
        <div class="mz-best"><span>${MG.icon('crown')}Meilleur score</span><b>${MG.fmt(totalScore())}</b><span class="mz-sub">${totalStars()} / ${maxStars()} ${MG.icon('star')}</span></div>
        <button class="gbtn mz-play" data-mz="map">${MG.icon('play')}Jouer</button>
        <div class="mz-menu"><button data-mz="skins"><span>${ico('skins')}</span>Personnages</button><button data-mz="shop"><span>${ico('shop')}</span>Boutique</button><button data-mz="settings"><span>${MG.icon('gear')}</span>Paramètres</button></div>
      </div>`;
    } else if (name === 'map') {
      migrate(d); const nr = nextReward(), gp = globalPct();
      el.innerHTML = `${topbar('home')}<div class="mz-in"><h2 class="mz-h">Carte des mondes<span>${totalStars()} / ${maxStars()} ${MG.icon('star')}</span></h2>
        <div class="mz-glob"><div class="mz-bar"><i style="width:${gp}%"></i></div><span>${gp} % de l’aventure</span></div>
        ${nr ? `<div class="mz-next">${spriteBox(nr.sk.id, 'idle')}<div><small>Prochaine récompense</small><b>${nr.sk.name}</b><span>${nr.txt}</span></div><em>${nr.k}</em></div>` : ''}
        <div class="mz-wlist">${WORLDS.map((W, wi) => worldCard(W, wi)).join('')}</div></div>`;
    } else if (name === 'world') {
      migrate(d); const wi = opt && opt.wi != null ? opt.wi : UI.curWorld || 0, W = WORLDS[wi], lv = CONTENT[wi]; UI.curWorld = wi;
      const cs = colStats(wi), lvBtn = (li) => { const L = levelAt(wi, li), r = (d.lv || {})[lvKey(wi, li)] || {}, op = unlocked(wi, li), stars = `<span class="mz-ls">${[0, 1, 2].map((k) => `<i class="${k < (r.stars || 0) ? 'on' : ''}">${MG.icon('star')}</i>`).join('')}</span>`;
        if (L.boss) return `<button class="mz-lv mz-lvboss${op ? '' : ' locked'}${r.stars ? ' done' : ''}" ${op ? `data-mz="play" data-w="${wi}" data-l="${li}"` : 'disabled'}><i class="mz-wemb"><svg viewBox="0 0 24 24">${W.icon}</svg></i><span><small>Niveau ${li + 1} · Boss</small><b>${L.boss.name}</b>${stars}</span>${op ? '' : MG.icon('lock')}</button>`;
        return `<button class="mz-lv${op ? '' : ' locked'}${r.stars ? ' done' : ''}" ${op ? `data-mz="play" data-w="${wi}" data-l="${li}"` : 'disabled'}><b>${op ? li + 1 : MG.icon('lock')}</b>${stars}<small>${r.best ? MG.fmt(r.best) : op ? 'À jouer' : '—'}</small></button>`; };
      const RULE = { timer: (L) => `Chrono : ${L.rule.s} s`, nohit: () => 'Un seul coup et c’est fini', allcoins: () => 'Toutes les pièces pour sortir' };
      const chal = CHAL[wi].map((L, k) => { const li = 'd' + k, r = (d.lv || {})[lvKey(wi, li)] || {}, op = unlocked(wi, li);
        return `<button class="mz-ch${op ? '' : ' locked'}${r.stars ? ' done' : ''}" ${op ? `data-mz="play" data-w="${wi}" data-l="${li}"` : `data-mz="chlocked" data-w="${wi}" data-k="${k}"`}><small>Défi ${k + 1}</small><b>${L.name}</b><span>${op ? RULE[L.rule.t](L) : `Termine le niveau ${CHAL_AFTER[k] + 1}`}</span><span class="mz-ls">${[0, 1, 2].map((j) => `<i class="${j < (r.stars || 0) ? 'on' : ''}">${MG.icon('star')}</i>`).join('')}</span></button>`; }).join('');
      const S = SECRET[wi], sop = S && unlocked(wi, 's'), sr = (d.lv || {})[lvKey(wi, 's')] || {};
      const colRow = [cs.crMax ? `<span>${ico('gem')}<b>${cs.cr}/${cs.crMax}</b><small>cristaux</small></span>` : '', cs.chMax ? `<span>${ico('chest')}<b>${cs.ch}/${cs.chMax}</b><small>coffres</small></span>` : '',
        cs.key != null ? `<span class="${cs.key ? 'ok' : ''}">${ico('key')}<b>${cs.key ? '1/1' : '0/1'}</b><small>clé</small></span>` : '', cs.relic != null ? `<span class="${cs.relic ? 'ok' : ''}">${ico('relic')}<b>${cs.relic ? '1/1' : '0/1'}</b><small>relique</small></span>` : '',
        cs.boss != null ? `<span class="${cs.boss ? 'ok' : ''}">${ico('trophy')}<b>${cs.boss ? '1/1' : '0/1'}</b><small>trophée</small></span>` : ''].join('');
      el.style.cssText = `--e:${W.pal.edge};--g:${W.pal.glow};--w:${W.pal.wall}`;
      el.innerHTML = `${topbar('map')}<div class="mz-in">
        <div class="mz-whead" style="background-image:url(${worldArt(wi)})"><i class="mz-wemb"><svg viewBox="0 0 24 24">${W.icon}</svg></i><small>Monde ${wi + 1} · <span class="mz-tier t-${W.tier}">${TIERS[W.tier]}</span></small><b>${W.name}</b><span>${W.blurb}</span></div>
        <div class="mz-wstats"><div><b>${worldPct(wi)} %</b><span>terminé</span></div><div><b>${worldStars(wi)}/${worldMax(wi)}</b><span>étoiles</span></div><div><b>${worldDoneN(wi)}/${lv.length}</b><span>niveaux</span></div></div>
        ${colRow ? `<div class="mz-col">${colRow}</div>` : ''}
        <section class="mz-world"><div class="mz-lvgrid">${lv.map((_, li) => lvBtn(li)).join('')}</div></section>
        ${chal ? `<h3 class="mz-h3">Défis</h3><div class="mz-chs">${chal}</div>` : ''}
        ${S ? `<h3 class="mz-h3">Niveau secret</h3><button class="mz-sec${sop ? '' : ' locked'}${sr.stars ? ' done' : ''}" ${sop ? `data-mz="play" data-w="${wi}" data-l="s"` : `data-mz="seclocked" data-w="${wi}"`}>${sop ? ico('relic') : ico('key')}<span><b>${sop ? S.name : '???'}</b><small>${sop ? (sr.stars ? `${sr.stars}/3 étoiles` : 'Un trésor ancien t’attend') : 'Un mur fissuré cache une clé quelque part dans ce monde'}</small></span></button>` : ''}
        ${lv.length < 15 ? `<p class="mz-wsoon">${MG.icon('lock')}<span>Bientôt dans ce monde : de nouveaux niveaux, des défis, un niveau secret et le boss <b>${W.boss}</b>.</span></p>` : ''}</div>`;
    } else if (name === 'skins' || name === 'shop') {
      const owned = Object.assign({ classic: true }, d.owned || {}), sel = d.skin || 'classic', u = d.upg || {};
      const skinCards = SKINS.map((s) => { const own = owned[s.id], cond = s.world ? `ou termine le monde ${wIdx(s.world) + 1}` : s.stars ? `ou réunis ${s.stars} étoiles` : '';
        return `<div class="mz-skin${own ? '' : ' locked'}${s.id === sel ? ' sel' : ''}" data-skin="${s.id}"><span class="mz-rar r-${s.rar}">${RAR[s.rar]}</span>${spriteBox(s.id, 'idle', own ? '' : 'sil')}<b>${s.name}</b><em>${s.desc}</em>
          ${own ? (s.id === sel ? `<span class="mz-tag">${ico('check')}Choisi</span>` : `<button class="gbtn light sm" data-mz="pick" data-id="${s.id}">Choisir</button>`) : `<button class="gbtn sm" data-mz="buy" data-id="${s.id}"><i class="mz-ic coin"></i>${MG.fmt(s.price)}</button><small>${cond}</small>`}</div>`; }).join('');
      if (name === 'skins') el.innerHTML = `${topbar('home')}<div class="mz-in"><h2 class="mz-h">Personnages</h2>
        <div class="mz-preview">${spriteBox(sel, 'idle', 'mz-big')}<div><b>${skinById(sel).name}</b><span>${skinById(sel).desc}</span><i class="mz-trailp" style="--a:${skinById(sel).trail.a};--b:${skinById(sel).trail.b}"></i></div></div>
        <div class="mz-skins">${skinCards}</div></div>`;
      else el.innerHTML = `${topbar('home')}<div class="mz-in"><h2 class="mz-h">Boutique</h2>
        <h3 class="mz-h3">Améliorations</h3><div class="mz-upg">${UPGRADES.map((g) => { const lv = g.id === 'shields' ? u.shields || 0 : u[g.id] || 0, maxed = g.id !== 'shields' && lv >= g.max, price = g.price[Math.min(lv, g.price.length - 1)];
          return `<div class="mz-up"><div><b>${g.name}</b><em>${g.desc}</em>${g.id === 'shields' ? `<small>En réserve : ${lv}</small>` : g.max > 1 ? `<small>Niveau ${lv} / ${g.max}</small>` : ''}</div>${maxed ? `<span class="mz-tag">${ico('check')}Acquis</span>` : `<button class="gbtn sm" data-mz="upg" data-id="${g.id}"><i class="mz-ic coin"></i>${MG.fmt(g.id === 'shields' ? g.price[0] : price)}</button>`}</div>`; }).join('')}</div>
        <h3 class="mz-h3">Skins</h3><div class="mz-skins">${skinCards}</div></div>`;
    } else if (name === 'settings') {
      const s = settings();
      el.innerHTML = `${topbar(opt && opt.back || 'home')}<div class="mz-in"><h2 class="mz-h">Paramètres</h2>${settingsHTML(s)}</div>`;
    }
    root.appendChild(el);
    if (name === 'skins') {
      const sk = skinById(d.skin), seq = [0, 0, 0, 0, 0, 0].concat(...[0, 1, 2].map(() => Array.from({ length: sk.n }, (_, k) => k + 1)), Array(8).fill(sk.n + 1)); let i = 0;
      const b0 = root.querySelector('.mz-big'); if (b0) { b0.style.backgroundImage = `url(${MG.asset('maze/mk_' + sk.id + '.webp')})`; b0.style.backgroundSize = `${(sk.n + 2) * 100}% 100%`; b0.style.backgroundPosition = '0 0'; }
      UI.skinTimer = setInterval(() => { const b = root && root.querySelector('.mz-big'); if (!b) return; i = (i + 1) % seq.length; b.style.backgroundPosition = `${(seq[i] / (sk.n + 1)) * 100}% 0`; }, 85);
    }
  }
  function worldCard(W, wi) {
    const has = hasContent(wi), open = worldOpen(wi), fin = has && worldDone(wi), pct = has ? worldPct(wi) : 0, n = (CONTENT[wi] || []).length, p = prevContent(wi);
    const st = !has ? ['soon', 'Bientôt'] : !open ? ['lock', 'Verrouillé'] : fin ? ['done', 'Terminé'] : pct > 0 ? ['go', 'En cours'] : ['new', 'Débloqué'];
    const desc = !has ? `En préparation · ${W.mech.slice(0, 2).join(', ').toLowerCase()}…` : !open ? `Termine ${WORLDS[p].name} pour entrer` : W.blurb;
    const rew = SKINS.filter((s) => s.world === W.id), own = data().owned || {};
    return `<button class="mz-wcard st-${st[0]}" data-mz="${open ? 'openworld' : 'wlocked'}" data-w="${wi}" style="--e:${W.pal.edge};--g:${W.pal.glow};--w:${W.pal.wall}">
      <span class="mz-wart" style="background-image:url(${worldArt(wi)})"><span class="mz-wst">${st[0] === 'lock' || st[0] === 'soon' ? MG.icon('lock') : st[0] === 'done' ? ico('check') : ''}${st[1]}</span><i class="mz-wemb"><svg viewBox="0 0 24 24">${W.icon}</svg></i></span>
      <span class="mz-wbody"><span class="mz-wtop"><small>Monde ${wi + 1}</small><span class="mz-tier t-${W.tier}">${TIERS[W.tier]}</span></span>
        <b class="mz-wname">${W.name}</b><span class="mz-wdesc">${desc}</span>
        ${has ? `<span class="mz-wprog"><span class="mz-bar"><i style="width:${pct}%"></i></span><em>${pct} %</em><em>${worldStars(wi)}/${worldMax(wi)} ${MG.icon('star')}</em></span>` : ''}
        <span class="mz-wrew">${rew.map((s) => `<span class="mz-rw${own[s.id] ? ' own' : ''}" title="${s.name}">${spriteBox(s.id, 'idle', own[s.id] ? '' : 'sil')}</span>`).join('')}<small>${rew.length ? (rew.every((s) => own[s.id]) ? 'Récompense obtenue · ' : 'Récompense : ' + rew.map((s) => s.name).join(', ') + ' · ') : ''}Boss : ${W.boss}</small></span></span></button>`;
  }
  // illustration pixel art générée à partir de la palette du monde (remplaçable par W.art)
  function worldArt(wi) {
    UI.art = UI.art || {}; if (UI.art[wi]) return UI.art[wi];
    const W = WORLDS[wi]; if (W.art) return (UI.art[wi] = MG.asset(W.art));
    const p = W.pal, TW = 40, TH = 14, S = 8, c2 = document.createElement('canvas'); c2.width = TW * S; c2.height = TH * S; const x = c2.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, c2.height); gr.addColorStop(0, p.bg1); gr.addColorStop(1, p.bg2); x.fillStyle = gr; x.fillRect(0, 0, c2.width, c2.height);
    const open = new Set(), K = (a, b) => a + ',' + b; let yy = 7, y2 = 3;
    for (let cx = 0; cx < TW; cx++) {
      open.add(K(cx, yy)); if (cx > 4 && cx < TW - 6) open.add(K(cx, y2));
      if (cx % 4 === 2 && hash(cx, wi, 7) < 0.6) { const ny = Math.max(5, Math.min(TH - 3, yy + (hash(cx, wi, 8) < 0.5 ? -2 : 2))); for (let k = Math.min(yy, ny); k <= Math.max(yy, ny); k++) open.add(K(cx, k)); yy = ny; }
      if (cx % 7 === 3) for (let k = Math.min(yy, y2); k <= Math.max(yy, y2); k++) open.add(K(cx, k));
    }
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const X = tx * S, Y = ty * S, h = hash(tx, ty, wi + 31);
      if (open.has(K(tx, ty))) { x.fillStyle = (tx + ty) % 2 ? p.floor : p.floor2; x.fillRect(X, Y, S, S); if (h < 0.18) { x.fillStyle = p.accent; x.fillRect(X + 3, Y + 3, 2, 2); } continue; }
      x.fillStyle = h < 0.5 ? p.wall : p.wall2; x.fillRect(X, Y, S, S); x.fillStyle = p.deep; x.fillRect(X, Y + S - 1, S, 1); x.fillRect(X + S - 1, Y, 1, S);
      x.fillStyle = hexA(p.edge, 0.85);
      if (open.has(K(tx, ty + 1))) x.fillRect(X, Y + S - 2, S, 2); if (open.has(K(tx, ty - 1))) x.fillRect(X, Y, S, 1);
      if (open.has(K(tx + 1, ty))) x.fillRect(X + S - 1, Y, 1, S); if (open.has(K(tx - 1, ty))) x.fillRect(X, Y, 1, S);
      if (h > 0.93) { x.fillStyle = p.mote; x.fillRect(X + 2, Y + 2, 2, 2); }
    }
    const v = x.createRadialGradient(c2.width * 0.35, c2.height * 0.5, 10, c2.width * 0.5, c2.height * 0.5, c2.width * 0.6); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = v; x.fillRect(0, 0, c2.width, c2.height);
    return (UI.art[wi] = c2.toDataURL('image/png'));
  }
  // transition animée vers un monde (puis cb)
  function worldTrans(wi, cb) {
    const W = WORLDS[wi], el = document.createElement('div'); el.className = 'mz-wtrans';
    el.style.cssText = `--e:${W.pal.edge};--g:${W.pal.glow};--b1:${W.pal.bg1};--b2:${W.pal.bg2}`;
    el.innerHTML = `<div class="mz-wt-in"><i class="mz-wemb"><svg viewBox="0 0 24 24">${W.icon}</svg></i><small>Monde ${wi + 1}</small><b>${W.name}</b><span class="mz-tier t-${W.tier}">${TIERS[W.tier]}</span></div>`;
    root.appendChild(el); sfx('portal');
    setTimeout(() => { if (root) cb(); }, 560); setTimeout(() => el.classList.add('out'), 980); setTimeout(() => el.remove(), 1400);
  }
  function settingsHTML(s) {
    return `<div class="mz-set">
      <label class="mz-range"><span>Musique</span><input type="range" min="0" max="100" value="${Math.round(s.music * 100)}" data-set="music"><b>${Math.round(s.music * 100)}</b></label>
      <label class="mz-range"><span>Effets sonores</span><input type="range" min="0" max="100" value="${Math.round(s.sfx * 100)}" data-set="sfx"><b>${Math.round(s.sfx * 100)}</b></label>
      <label class="mz-tog"><span>Son activé</span><input type="checkbox" data-set="mute" ${MG.sfx.muted ? '' : 'checked'}><i></i></label>
      <label class="mz-tog"><span>Vibrations <small>(Android)</small></span><input type="checkbox" data-set="vib" ${s.vib ? 'checked' : ''}><i></i></label>
      <label class="mz-tog"><span>Effets allégés <small>(économise la batterie)</small></span><input type="checkbox" data-set="lowfx" ${s.lowfx ? 'checked' : ''}><i></i></label>
      <label class="mz-tog"><span>Aide des gestes</span><input type="checkbox" data-set="hints" ${s.hints ? 'checked' : ''}><i></i></label>
      <label class="mz-tog"><span>Bouclier de secours auto <small>(${(data().upg || {}).shields || 0} en réserve)</small></span><input type="checkbox" data-set="autoShield" ${((data().upg || {}).autoShield !== false) ? 'checked' : ''}><i></i></label></div>`;
  }
  function onInput(e) {
    const k = e.target.dataset.set; if (!k) return; const s = settings();
    if (k === 'music' || k === 'sfx') { s[k] = e.target.value / 100; const b = e.target.parentNode.querySelector('b'); if (b) b.textContent = e.target.value; applyVolumes(); if (k === 'sfx' && e.type === 'change') sfx('coin', 3); }
    else if (k === 'mute') { if (MG.sfx.muted === e.target.checked) MG.sfx.toggle(); applyVolumes(); }
    else if (k === 'autoShield') { (data().upg = data().upg || {}).autoShield = e.target.checked; }
    else { s[k] = e.target.checked; if (k === 'lowfx') UI.lowfx = s.lowfx; }
    api.save();
  }
  function pause() {
    if (!G || G.paused || UI.screen !== 'game' || G.state === 'dead' || G.state === 'win') return;
    G.paused = true; UI.ptr = null; Music.stop(); sfx('tap');
    modal(`<div class="gpanel mz-panel"><div class="mz-pmilo">${spriteBox(data().skin || 'classic', 'idle')}</div><h3>Pause</h3><p>${lvLabel(G.wi, G.li)} · ${WORLDS[G.wi].short}</p>
      <div class="acts"><button class="gbtn" data-mz="resume">${MG.icon('play')}Reprendre</button><button class="gbtn light" data-mz="restart">${MG.icon('redo')}Recommencer</button>
      <button class="gbtn light" data-mz="psettings">${MG.icon('gear')}Paramètres</button><button class="gbtn light" data-mz="quit">${ico('map')}Quitter le niveau</button></div></div>`);
  }
  function resume() { if (!G) return; closeModal(); G.paused = false; last = 0; Music.start(G.wi); }
  function showEnd(won, st, score, prevBest, newBest, unlocks, gains) {
    const g = G, d = data(), nx = nextOf(g.wi, g.li), n = st.reduce((a, b) => a + b, 0), best = Math.max(prevBest, won ? score : 0);
    const stars = [0, 1, 2].map((k) => `<i class="${st[k] ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.3}s">${MG.icon('star')}</i>`).join('');
    const lbl = objLabels(g);
    const m = modal(`<div class="gpanel mz-panel ${won ? 'win' : 'lose'}"><div class="mz-pmilo">${spriteBox(d.skin || 'classic', won ? 'win' : 'fail')}</div>
      <h3>${won ? (g.boss ? (WORLDS[g.wi].id === 'finale' ? 'Victoire finale !' : 'Boss vaincu !') : n === 3 ? 'Parfait !' : 'Niveau terminé !') : 'Oups !'}</h3><p>${won ? `${lvLabel(g.wi, g.li)} · ${WORLDS[g.wi].short}` : (g.why || 'Milo s’est fait surprendre') + ' Réessaie !'}</p>
      <div class="mz-endstars">${stars}</div><div class="mz-endlbl">${lbl.map((t, k) => `<span class="${st[k] ? 'on' : ''}">${t}</span>`).join('')}</div>
      <div class="mz-sum"><div><span>Score</span><b data-count="${score}">0</b></div><div><span>Temps</span><b>${fmtT(g.time)}</b></div><div><span>Pièces</span><b>${g.got}/${g.coinsTotal}</b></div><div><span>Meilleur</span><b>${MG.fmt(best)}${newBest && won && prevBest ? ' ★' : ''}</b></div></div>
      ${unlocks.length ? `<div class="mz-unlock">${spriteBox(unlocks[0].id, 'win')}<span>Nouveau skin débloqué : <b>${unlocks[0].name}</b></span></div>` : ''}
      ${(gains || []).map(([k, t]) => `<div class="mz-gain g-${k}">${ico(k)}<span>${t}</span></div>`).join('')}
      <p class="mz-earn"><i class="mz-ic coin"></i>+${g.got} pièces · total ${MG.fmt(d.coins || 0)}</p>
      <div class="acts">${won && nx ? `<button class="gbtn" data-mz="play" data-w="${nx[0]}" data-l="${nx[1]}">${ico('next')}Niveau suivant</button>` : ''}
        <button class="gbtn ${won && nx ? 'light' : ''}" data-mz="restart">${MG.icon('redo')}${won ? 'Rejouer' : 'Recommencer'}</button>
        <button class="gbtn light" data-mz="world" data-w="${g.wi}">${ico('map')}Niveaux</button></div></div>`);
    const b = m.querySelector('[data-count]'), t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 900); b.textContent = MG.fmt(Math.round(score * ease(k))); if (k < 1 && root) UI.scoreRaf = requestAnimationFrame(step); }; UI.scoreRaf = requestAnimationFrame(step);
    if (won) st.forEach((v, k) => { if (v) setTimeout(() => sfx('star', k), 250 + k * 300); });
  }

  /* ---------- Contrôles ---------- */
  function onDown(e) {
    if (UI.screen !== 'game' || !G || e.target.closest('button, .gmodal, .mz-scr') || e.button > 0) return;
    e.preventDefault(); try { root.setPointerCapture(e.pointerId); } catch (_) {}
    UI.ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), fired: false };
    MG.sfx.unlock();
  }
  function onMove(e) {
    const p = UI.ptr; if (!p || e.pointerId !== p.id || !G) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0, dist = Math.hypot(dx, dy);
    if (dist >= 20) { const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); launch(G.invT > 0 ? (d + 2) % 4 : d); p.x0 = e.clientX; p.y0 = e.clientY; p.fired = true; }
  }
  function onUp(e) { const p = UI.ptr; if (!p || e.pointerId !== p.id) return; UI.ptr = null; }
  function onTouch(e) { if (UI.screen === 'game' && e.cancelable && !e.target.closest('button, .gmodal, .mz-scr')) e.preventDefault(); }
  const KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };
  function onKey(e) {
    if (UI.screen !== 'game' || !G) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); if (G.paused) resume(); else pause(); return; }
    // ZQSD (azerty) : e.key donne la lettre affichée
    const k = e.key && e.key.toLowerCase(); let d = KEYS[e.code];
    if (k === 'z') d = 0; else if (k === 'q') d = 3; else if (k === 's') d = 2; else if (k === 'd') d = 1;
    if (d != null) { e.preventDefault(); if (!e.repeat) launch(G.invT > 0 ? (d + 2) % 4 : d); }
  }
  function onVis() { if (document.hidden) pause(); }

  function onClick(e) {
    const b = e.target.closest('[data-mz]'); if (!b) return;
    const a = b.dataset.mz, d = data();
    if (a !== 'pause') sfx('tap');
    if (a === 'pause') pause();
    else if (a === 'resume') resume();
    else if (a === 'cpgo') respawn();
    else if (a === 'cpquit') { closeModal(); if (G && G.state === 'dead') endLevel(false); }
    else if (a === 'restart') { const g = G; if (g) startLevel(g.wi, g.li); else if (UI.lastLv) startLevel(...UI.lastLv); }
    else if (a === 'quit') { Music.stop(); const wi = G ? G.wi : UI.curWorld || 0; screen('world', { wi }); }
    else if (a === 'psettings') { const m = modal(`<div class="gpanel mz-panel mz-psets"><h3>Paramètres</h3>${settingsHTML(settings())}<div class="acts"><button class="gbtn" data-mz="pauseback">${ico('back')}Retour</button></div></div>`); }
    else if (a === 'pauseback') { closeModal(); G.paused = false; pause(); }
    else if (a === 'play') { const wi = +b.dataset.w, li = +b.dataset.l; UI.lastLv = [wi, li]; if (!unlocked(wi, li)) return; if (G && G.wi !== wi) worldTrans(wi, () => startLevel(wi, li)); else startLevel(wi, li); }
    else if (a === 'openworld') { const wi = +b.dataset.w; worldTrans(wi, () => screen('world', { wi })); }
    else if (a === 'world') { screen('world', { wi: +b.dataset.w }); }
    else if (a === 'chlocked') { sfx('no'); toast(`Termine le niveau ${CHAL_AFTER[+b.dataset.k] + 1} pour ouvrir ce défi`); }
    else if (a === 'seclocked') { sfx('no'); toast('Cherche un mur fissuré : la clé est cachée derrière'); }
    else if (a === 'wlocked') { const wi = +b.dataset.w, p = prevContent(wi); sfx('no'); toast(hasContent(wi) ? `Termine d’abord ${WORLDS[p].name}` : `${WORLDS[wi].name} arrive bientôt`); }
    else if (a === 'map' || a === 'home' || a === 'skins' || a === 'shop' || a === 'settings') screen(a);
    else if (a === 'pick') { d.skin = b.dataset.id; skinImg(d.skin); api.save(); screen(UI.screen); }
    else if (a === 'buy') {
      const s = skinById(b.dataset.id); if ((d.owned || {})[s.id]) return;
      if ((d.coins || 0) < s.price) { sfx('no'); toast(`Il te manque ${MG.fmt(s.price - (d.coins || 0))} pièces`); return; }
      d.coins -= s.price; (d.owned = d.owned || { classic: true })[s.id] = true; d.skin = s.id; skinImg(s.id); api.save(); sfx('buy'); try { api.fx.confetti(50); } catch (_) {} screen(UI.screen); toast(`${s.name} est à toi !`);
    }
    else if (a === 'upg') {
      const g = UPGRADES.find((x) => x.id === b.dataset.id), u = (d.upg = d.upg || {}), lv = g.id === 'shields' ? 0 : u[g.id] || 0, price = g.price[Math.min(lv, g.price.length - 1)];
      if ((d.coins || 0) < price) { sfx('no'); toast(`Il te manque ${MG.fmt(price - (d.coins || 0))} pièces`); return; }
      d.coins -= price; if (g.id === 'shields') u.shields = (u.shields || 0) + g.stack; else if (g.max === 1) u[g.id] = true; else u[g.id] = lv + 1;
      api.save(); sfx('buy'); screen('shop'); toast(`${g.name} : c’est fait !`);
    }
    else if (a === 'exit') { api.close(); }
  }
  function toast(t) { if (!root) return; const el = document.createElement('div'); el.className = 'mz-toast'; el.textContent = t; root.appendChild(el); setTimeout(() => el.remove(), 2200); }
  function onResize() { clearTimeout(rTimer); rTimer = setTimeout(() => { if (root && UI.screen === 'game') layout(); }, 80); }

  /* =====================================================================
     MODULE
     ===================================================================== */
  MG.register({
    id: 'maze', name: 'Milo Maze', logo: 'logo_maze.webp', theme: 'maze',
    mount(frame, a) {
      api = a; const d = migrate(api.data); keepOpen(d); d.stats = d.stats || {}; d.owned = Object.assign({ classic: true }, d.owned || {}); d.upg = d.upg || {}; d.lv = d.lv || {};
      if (d.coins == null) d.coins = 0; if (!skinById(d.skin).id || !d.owned[d.skin]) d.skin = 'classic';
      UI.lowfx = !!settings().lowfx;
      skinImg(d.skin); itemsImg();
      root = document.createElement('div'); root.className = 'mz-root';
      root.innerHTML = '<div class="mz-amb" aria-hidden="true">' + '<i></i>'.repeat(8) + '</div>';
      frame.insertBefore(root, frame.firstChild);
      root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onInput);
      root.addEventListener('pointerdown', onDown); root.addEventListener('pointermove', onMove); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp);
      root.addEventListener('touchstart', onTouch, { passive: false });
      document.addEventListener('keydown', onKey, true); document.addEventListener('visibilitychange', onVis);
      try { ro = new ResizeObserver(onResize); ro.observe(root); } catch (e) { window.addEventListener('resize', onResize); }
      G = null; UI.screen = 'home'; screen('home');
    },
    unmount() {
      stopLoop(); Music.stop(); clearInterval(UI.skinTimer); clearTimeout(rTimer); cancelAnimationFrame(UI.scoreRaf);
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('visibilitychange', onVis);
      try { ro && ro.disconnect(); } catch (e) {} ro = null; window.removeEventListener('resize', onResize);
      if (api) api.save(); root = null; cv = null; ctx = null; G = null; UI.chunks = []; UI.ptr = null;
    },
    card(d) {
      migrate(d); let stars = 0, best = 0; Object.values(d.lv || {}).forEach((r) => { stars += r.stars || 0; best += r.best || 0; });
      const mx = maxStars(), nl = WORLDS.reduce((n, _, wi) => n + allKeys(wi).length, 0), nd = Object.values(d.lv || {}).filter((r) => r.stars > 0).length;
      return { desc: 'Milo explore des labyrinthes néon : glisse pour foncer d’un mur à l’autre, ramasse les pièces et évite les pièges.',
        stats: [['Étoiles', `${stars}/${mx}`, 'star'], ['Pièces', MG.fmt(d.coins || 0), 'crown'], ['Score', MG.fmt(best), 'trophy']],
        progress: stars / (mx || 1), progressLabel: `${nd} niveau${nd > 1 ? 'x' : ''} terminé${nd > 1 ? 's' : ''} sur ${nl}`,
        cta: nd ? 'Continuer l’aventure' : 'Jouer' };
    },
    homeLine(d) { migrate(d); let s = 0; Object.values(d.lv || {}).forEach((r) => (s += r.stars || 0)); return `Milo Maze ${s} étoiles`; },
    _debug: { G: () => G, UI, launch, start: (w, l) => startLevel(w, l), screen, LV, WORLDS, CONTENT, CHAL, SECRET, levelAt, migrate, worldOpen, unlocked, nextReward, worldPct, colStats, setInv: (v) => { if (G) G.milo.invT = v ? 1e9 : 0; }, hitAt: (x, y) => hitAt(x, y, G.time), die: (w) => die(w || 'Test'), respawn }
  });

  /* =====================================================================
     STYLES
     ===================================================================== */
  const css = `
  .gscreen.maze{background:radial-gradient(circle at 15% 0%,rgba(140,80,255,.45),transparent 45%),radial-gradient(circle at 100% 40%,rgba(34,211,238,.22),transparent 45%),radial-gradient(circle at 10% 100%,rgba(255,79,216,.2),transparent 45%),linear-gradient(170deg,#1a0c3f,#0d0626 60%,#07031a)}
  .gcard.maze .gcard-art{background:radial-gradient(circle at 20% 20%,rgba(169,112,255,.7),transparent 50%),radial-gradient(circle at 85% 85%,rgba(34,211,238,.5),transparent 50%),linear-gradient(160deg,#1c0b45,#2a1170 55%,#0c1a4a)}
  .mz-root{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;z-index:1;color:#fff;touch-action:none}
  .mz-amb{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:-1}
  .mz-amb i{position:absolute;width:5px;height:5px;background:#c9a8ff;box-shadow:0 0 10px 2px rgba(190,140,255,.8);opacity:0;animation:mzMote 6s linear infinite}
  .mz-amb i:nth-child(1){left:8%;animation-delay:-1s}.mz-amb i:nth-child(2){left:22%;animation-delay:-3.2s;background:#5ef2ff}.mz-amb i:nth-child(3){left:38%;animation-delay:-.4s}.mz-amb i:nth-child(4){left:54%;animation-delay:-4.6s;background:#ff7ae0}.mz-amb i:nth-child(5){left:68%;animation-delay:-2.1s}.mz-amb i:nth-child(6){left:80%;animation-delay:-5.3s;background:#5ef2ff}.mz-amb i:nth-child(7){left:91%;animation-delay:-1.7s}.mz-amb i:nth-child(8){left:46%;animation-delay:-3.9s;background:#ffd84d}
  @keyframes mzMote{0%{top:105%;opacity:0}15%{opacity:.8}85%{opacity:.6}100%{top:-5%;opacity:0}}
  .mz-root .gclose{background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
  .mz-ic{display:inline-block;width:22px;height:22px;background:url(${MG.asset('maze/items.webp')}) 0 0/600% 100% no-repeat;flex:none}
  .mz-ic.coin{background-position:0 0}
  .mz-ic.hg{background:none;position:relative}.mz-ic.hg:before{content:"⌛";font-size:16px;line-height:22px}
  .mz-xo{color:#bff8ff!important;gap:6px}.mz-xo i{display:inline-block;width:64px;height:8px;border-radius:5px;background:rgba(255,255,255,.15);overflow:hidden}.mz-xo b{display:block;height:100%;width:100%;background:linear-gradient(90deg,#2ad8c4,#bff8ff);border-radius:5px;transition:width .15s linear}
  .mz-xo.low{animation:mzHot .45s ease-in-out infinite alternate}.mz-xo.low b{background:linear-gradient(90deg,#ff4f6d,#ffb0c0)}
  .mz-xp{color:#e8fbff!important}.mz-xp .gi{stroke:#b48cff}.mz-xp.ok .gi{stroke:#ffffff}
  .mz-xv{color:#e8e8f4!important;gap:5px!important}.mz-xv i{display:inline-block;width:11px;height:11px;opacity:.55}.mz-xv i.on{opacity:1;transform:scale(1.3);filter:drop-shadow(0 0 3px rgba(255,255,255,.9))}.mz-xv u{text-decoration:none;opacity:.6}
  .mz-xv .v0{background:#ff3df0;border-radius:50%}.mz-xv .v1{background:#5ee7ff;clip-path:polygon(50% 0,100% 100%,0 100%)}.mz-xv .v2{background:#ffd84d;border-radius:1px}
  .mz-xg{color:#ff9de9!important}.mz-ic.iv{background:none;position:relative}.mz-ic.iv:before{content:"⇄";font-size:16px;line-height:22px;color:#ff7ae0;font-weight:900}
  .mz-xl{color:#ffd0a0!important}.mz-xl .gi{stroke:#ff7a1a}.mz-xl b{margin-left:4px}.mz-xl.hot{background:rgba(255,80,30,.35)!important;animation:mzHot .5s ease-in-out infinite alternate}
  @keyframes mzHot{to{background:rgba(255,80,30,.6)}}
  .mz-ic.ff{background:radial-gradient(circle at 50% 50%,#fbffc8 0 18%,#d8ff8a 30%,rgba(216,255,138,0) 70%)}
  .mz-cpinfo{display:flex;align-items:center;gap:10px;margin:10px 0 2px;padding:10px 12px;border-radius:14px;background:linear-gradient(120deg,#e6fff0,#f1eaff);text-align:left;font-size:13.5px;font-weight:700;color:#2a5a3a}.mz-cpinfo .gi{width:22px;height:22px;stroke:#1f9a55;flex:none}
  .mz-game{position:absolute;inset:0;display:flex;flex-direction:column}
  .mz-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
  .mz-hud{position:relative;z-index:2;padding:10px 12px 0;background:linear-gradient(180deg,rgba(8,3,26,.85),rgba(8,3,26,0));pointer-events:none}
  .mz-hud button{pointer-events:auto}
  .mz-row{display:flex;align-items:center;gap:8px}
  .mz-pill{display:flex;align-items:center;gap:5px;height:34px;padding:0 11px 0 8px;border-radius:17px;background:rgba(20,10,50,.6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);font-weight:900;font-size:15px;font-variant-numeric:tabular-nums;backdrop-filter:blur(6px)}
  .mz-pill span{font-size:11px;color:#b9a8ff;font-weight:800}
  .mz-pill.bump{animation:mzBump .25s cubic-bezier(.34,1.7,.5,1)}
  @keyframes mzBump{50%{transform:scale(1.12)}}
  .mz-time{margin-left:auto}.mz-time .gi{width:15px;height:15px;color:#9fe7ff}.mz-time.late .gi,.mz-time.late b{color:#ff9ac0}
  .mz-stars{display:flex;gap:1px}
  .mz-stars i{width:20px;height:20px;background:no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m12 2.6 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z' fill='%23ffffff' fill-opacity='.18' stroke='%23ffffff' stroke-opacity='.35'/%3E%3C/svg%3E");transition:transform .3s}
  .mz-stars i.on{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m12 2.6 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z' fill='%23ffcf3a' stroke='%23e19c00'/%3E%3C/svg%3E");transform:scale(1.08)}
  .mz-stars i.on.soft{opacity:.75}.mz-stars i.off{opacity:.35}
  .mz-prog{position:relative;height:6px;margin:9px 4px 0;border-radius:4px;background:rgba(255,255,255,.12)}
  .mz-prog i{display:block;height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#a970ff,#5ef2ff,#ffd84d);box-shadow:0 0 10px rgba(94,242,255,.6);transition:width .2s}
  .mz-prog span{position:absolute;right:0;top:9px;font-size:10.5px;font-weight:900;letter-spacing:.4px;color:#b9a8ff;text-transform:uppercase}
  .mz-bons{display:flex;gap:6px;margin-top:8px;min-height:30px}
  .mz-bon{display:flex;align-items:center;gap:4px;height:30px;padding:0 9px 0 5px;border-radius:15px;background:rgba(20,10,50,.65);box-shadow:inset 0 0 0 1.5px var(--c),0 0 12px var(--c);font-size:12.5px;font-weight:900;animation:mzBump .3s}
  .mz-bon .mz-ic{width:22px;height:22px}
  .mz-hint{position:absolute;left:50%;top:132px;transform:translateX(-50%);z-index:3;display:flex;flex-direction:column;align-items:center;gap:3px;padding:14px 20px 12px;border-radius:20px;background:rgba(20,10,50,.72);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);pointer-events:none;text-align:center;transition:opacity .3s}
  .mz-hint.out{opacity:0}
  .mz-hint b{font-size:16px;font-weight:900}.mz-hint span{font-size:12.5px;color:#cbbcff}
  .mz-hand{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 6px rgba(255,255,255,.2);animation:mzHand 1.6s ease-in-out infinite;margin-bottom:6px}
  @keyframes mzHand{0%{transform:translate(0,14px);opacity:0}20%{opacity:1}70%{transform:translate(0,-26px);opacity:1}100%{transform:translate(0,-30px);opacity:0}}
  .mz-scr{position:absolute;inset:0;z-index:20;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;animation:mzIn .3s cubic-bezier(.22,1,.36,1)}
  @keyframes mzIn{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:none}}
  .mz-top{position:sticky;top:0;z-index:3}
  .mz-wallet{display:flex;align-items:center;gap:6px;height:38px;padding:0 13px 0 8px;border-radius:19px;background:rgba(20,10,50,.6);box-shadow:inset 0 0 0 1px rgba(255,215,77,.35);font-weight:900;font-size:16px;font-variant-numeric:tabular-nums}
  .mz-in{width:min(100%,440px);margin:0 auto;padding:0 16px max(26px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:stretch}
  .mz-homein{align-items:center}
  .mz-logo{width:min(70%,270px);height:auto;margin-top:-4px;filter:drop-shadow(0 12px 26px rgba(120,60,255,.45));animation:gpop .6s cubic-bezier(.34,1.6,.5,1) both}
  .mz-stage{position:relative;width:120px;height:110px;margin-top:-4px}
  .mz-spr{display:inline-block;background-size:1100% 100%;background-repeat:no-repeat;width:72px;height:72px;flex:none}
  .mz-hero{position:absolute;left:0;top:0;width:120px;height:120px;animation:mzFloat 2.6s ease-in-out infinite;filter:drop-shadow(0 10px 18px rgba(150,90,255,.5))}
  @keyframes mzFloat{50%{transform:translateY(-8px) rotate(-2deg)}}
  .mz-plat{position:absolute;left:18px;right:18px;bottom:-4px;height:14px;border-radius:50%;background:radial-gradient(closest-side,rgba(169,112,255,.6),transparent);animation:mzPlat 2.6s ease-in-out infinite}
  @keyframes mzPlat{50%{transform:scaleX(.8);opacity:.6}}
  .mz-best{display:flex;flex-direction:column;align-items:center;margin:14px 0 12px}
  .mz-best span{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#cbbcff}
  .mz-best span .gi{width:15px;height:15px;fill:#ffcf3a;stroke:#e19c00}
  .mz-best b{font-size:34px;font-weight:900;letter-spacing:-1px;font-variant-numeric:tabular-nums;text-shadow:0 0 18px rgba(169,112,255,.7)}
  .mz-best .mz-sub{text-transform:none;letter-spacing:0;font-size:13px}
  .mz-play{width:100%;font-size:20px!important;padding:17px!important;background:linear-gradient(140deg,#b06cff,#7b3cf2 50%,#2bb8e6)!important;box-shadow:0 10px 26px rgba(120,60,255,.5),inset 0 2px 0 rgba(255,255,255,.3)!important}
  .mz-menu{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;margin-top:12px}
  .mz-menu button{border:0;border-radius:18px;padding:12px 4px 10px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);color:#fff;font:inherit;font-size:13px;font-weight:900;display:flex;flex-direction:column;align-items:center;gap:6px;transition:transform .15s}
  .mz-menu button:active{transform:scale(.95)}
  .mz-menu span{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(150deg,#a970ff,#4f7bff);box-shadow:0 6px 14px rgba(110,60,255,.45)}
  .mz-menu .gi{width:21px;height:21px}
  .mz-h{display:flex;align-items:center;justify-content:space-between;font-size:26px;font-weight:900;letter-spacing:-.5px;margin:4px 2px 14px}
  .mz-h span{display:flex;align-items:center;gap:4px;font-size:14px;color:#cbbcff}.mz-h span .gi{width:15px;height:15px;fill:#ffcf3a;stroke:#e19c00}
  .mz-h3{font-size:16px;font-weight:900;margin:14px 2px 10px;color:#e3d8ff}
  .mz-world{border-radius:24px;padding:12px 12px 14px;margin-bottom:14px;background:linear-gradient(160deg,color-mix(in srgb,var(--w) 55%,transparent),rgba(10,5,30,.6));box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--e) 55%,transparent),0 0 24px color-mix(in srgb,var(--g) 30%,transparent)}
  .mz-world header{display:grid;grid-template-columns:1fr auto;gap:0 8px;margin:0 4px 10px}
  .mz-world header b{font-size:11px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:var(--e)}
  .mz-world header span{grid-row:2;font-size:17px;font-weight:900}
  .mz-world header em{grid-row:1/3;grid-column:2;align-self:center;display:flex;align-items:center;gap:3px;font-style:normal;font-weight:900;font-size:14px}.mz-world header em .gi{width:15px;height:15px;fill:#ffcf3a;stroke:#e19c00}
  .mz-world.locked{opacity:.55;filter:saturate(.5)}
  /* carte des mondes */
  .mz-glob{display:flex;align-items:center;gap:10px;margin:-6px 2px 12px;font-size:12.5px;font-weight:800;color:#cbbcff}.mz-glob .mz-bar{flex:1}
  .mz-bar{display:block;height:8px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}.mz-bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--g,#a970ff),var(--e,#5ef2ff));box-shadow:0 0 10px var(--g,#a970ff)}
  .mz-next{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;margin-bottom:14px;border-radius:20px;background:linear-gradient(120deg,rgba(255,200,60,.16),rgba(169,112,255,.12));box-shadow:inset 0 0 0 1px rgba(255,215,77,.35)}
  .mz-next .mz-spr{width:54px;height:54px}.mz-next div{flex:1;min-width:0;display:flex;flex-direction:column}
  .mz-next small{font-size:10.5px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#ffd96a}.mz-next b{font-size:16px;font-weight:900}.mz-next span{font-size:12.5px;color:#d8ccff}
  .mz-next em{font-style:normal;font-weight:900;font-size:14px;color:#ffd96a;font-variant-numeric:tabular-nums}
  .mz-wlist{display:flex;flex-direction:column;gap:14px}
  .mz-wcard{display:block;width:100%;border:0;padding:0;text-align:left;font:inherit;color:#fff;border-radius:24px;overflow:hidden;background:linear-gradient(170deg,color-mix(in srgb,var(--w) 40%,#0a0520),#0a0520 70%);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--e) 45%,transparent),0 10px 24px rgba(0,0,0,.35);transition:transform .15s}
  .mz-wcard:active{transform:scale(.98)}
  .mz-wart{position:relative;display:block;height:112px;background-size:cover;background-position:center;image-rendering:pixelated}
  .mz-wemb{position:absolute;right:14px;top:50%;transform:translateY(-50%);width:62px;height:62px;border-radius:20px;display:grid;place-items:center;background:radial-gradient(circle,color-mix(in srgb,var(--g) 45%,transparent),rgba(10,5,30,.55));box-shadow:0 0 22px var(--g),inset 0 0 0 1.5px var(--e)}
  .mz-wemb svg{width:34px;height:34px;fill:none;stroke:#fff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 6px var(--e))}
  .mz-wst{position:absolute;left:12px;top:12px;display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:12px;font-size:11px;font-weight:900;letter-spacing:.4px;text-transform:uppercase;background:rgba(10,5,30,.72);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}.mz-wst .gi{width:13px;height:13px}
  .st-done .mz-wst{background:rgba(40,160,100,.85)}.st-go .mz-wst{background:color-mix(in srgb,var(--g) 70%,#0a0520)}.st-new .mz-wst{background:rgba(255,190,40,.9);color:#2a1400}
  .st-lock .mz-wart,.st-soon .mz-wart{filter:grayscale(.75) brightness(.6)}.st-lock .mz-wemb,.st-soon .mz-wemb{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)}
  .mz-wbody{display:flex;flex-direction:column;gap:3px;padding:10px 14px 13px}
  .mz-wtop{display:flex;align-items:center;justify-content:space-between}.mz-wtop small{font-size:11px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:var(--e)}
  .mz-tier{display:inline-block;padding:3px 9px;border-radius:9px;font-size:10.5px;font-weight:900;letter-spacing:.4px;text-transform:uppercase;color:#fff}
  .t-facile{background:#1fa86a}.t-normal{background:#2f7bff}.t-difficile{background:#ff8a1f}.t-expert{background:#e0283b}.t-legendaire{background:linear-gradient(135deg,#ffb020,#b04cff)}
  .mz-wname{font-size:19px;font-weight:900;line-height:1.15}.mz-wdesc{font-size:12.5px;color:#cbbcff}
  .mz-wprog{display:flex;align-items:center;gap:10px;margin-top:6px}.mz-wprog .mz-bar{flex:1}
  .mz-wprog em{display:inline-flex;align-items:center;gap:3px;font-style:normal;font-weight:900;font-size:13px;font-variant-numeric:tabular-nums}.mz-wprog .gi{width:14px;height:14px;fill:#ffcf3a;stroke:#e19c00}
  .mz-wrew{display:flex;align-items:center;gap:6px;margin-top:6px}.mz-wrew small{font-size:11.5px;color:#a99cf0;font-weight:700}
  .mz-rw .mz-spr{width:34px;height:34px}.mz-rw .mz-spr.sil{filter:brightness(0) drop-shadow(0 0 1px rgba(255,255,255,.6));opacity:.8}
  /* écran d'un monde */
  .mz-whead{position:relative;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;min-height:150px;padding:14px 92px 14px 16px;border-radius:24px;margin-bottom:12px;background-size:cover;background-position:center;image-rendering:pixelated;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--e) 50%,transparent),inset 0 -70px 60px -20px rgba(5,2,15,.85)}
  .mz-whead small{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:var(--e)}
  .mz-whead b{font-size:24px;font-weight:900;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,.6)}.mz-whead > span{font-size:13px;color:#e3d8ff}
  .mz-wstats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  .mz-wstats div{display:flex;flex-direction:column;align-items:center;padding:9px 4px;border-radius:16px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
  .mz-wstats b{font-size:18px;font-weight:900;font-variant-numeric:tabular-nums}.mz-wstats span{font-size:11px;color:#cbbcff;font-weight:800}
  .mz-wsoon{display:flex;gap:8px;align-items:flex-start;margin:4px 4px 0;font-size:12.5px;color:#b9a8ff;line-height:1.4}.mz-wsoon .gi{flex:none;width:15px;height:15px;margin-top:1px}
  .mz-col{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
  .mz-col span{flex:1;min-width:64px;display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 4px;border-radius:14px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
  .mz-col .gi{width:18px;height:18px;stroke:#d9b8ff}.mz-col span.ok .gi{stroke:#ffd84d}.mz-col b{font-size:14px;font-weight:900;font-variant-numeric:tabular-nums}.mz-col small{font-size:10.5px;color:#b9a8ff;font-weight:800}
  .mz-lvboss{grid-column:1/-1;flex-direction:row!important;justify-content:flex-start;gap:12px;padding:10px 14px!important;text-align:left;background:linear-gradient(120deg,color-mix(in srgb,var(--g) 30%,rgba(10,5,30,.6)),rgba(10,5,30,.6))!important;box-shadow:inset 0 0 0 1.5px var(--e)!important}
  .mz-lvboss .mz-wemb{position:static;transform:none;width:50px;height:50px;border-radius:16px;flex:none}.mz-lvboss .mz-wemb svg{width:28px;height:28px}
  .mz-lvboss > span{flex:1;display:flex;flex-direction:column;gap:2px}.mz-lvboss small{font-size:10.5px!important;letter-spacing:.6px;text-transform:uppercase;color:var(--e)!important}.mz-lvboss b{font-size:16px!important;text-shadow:none!important}.mz-lvboss .mz-ls{justify-content:flex-start}
  .mz-chs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .mz-ch{border:0;border-radius:16px;padding:10px 8px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;font:inherit;color:#fff;background:rgba(255,190,40,.1);box-shadow:inset 0 0 0 1.5px rgba(255,200,70,.4)}
  .mz-ch small{font-size:10px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#ffd96a}.mz-ch b{font-size:13px;font-weight:900;line-height:1.15}.mz-ch > span:not(.mz-ls){font-size:10.5px;color:#d8ccff;font-weight:700}
  .mz-ch.locked{opacity:.55}.mz-ch.done{background:rgba(255,190,40,.22)}
  .mz-sec{width:100%;border:0;border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:12px;text-align:left;font:inherit;color:#fff;background:linear-gradient(120deg,rgba(94,242,255,.16),rgba(169,112,255,.14));box-shadow:inset 0 0 0 1.5px rgba(120,230,255,.45)}
  .mz-sec .gi{width:30px;height:30px;stroke:#7af6ff;flex:none}.mz-sec span{display:flex;flex-direction:column}.mz-sec b{font-size:16px;font-weight:900}.mz-sec small{font-size:12px;color:#cbbcff}
  .mz-sec.locked{background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.15)}.mz-sec.locked .gi{stroke:#8a7cc0}
  .mz-gain{display:flex;align-items:center;gap:10px;margin:6px 0 0;padding:8px 12px;border-radius:14px;background:linear-gradient(120deg,#fff4d6,#f1eaff);text-align:left;font-size:13.5px;font-weight:800;color:#3a2a8a}.mz-gain .gi{width:20px;height:20px;stroke:#c27a00;flex:none}
  /* HUD : boss, cœurs, cristaux */
  .mz-bossbar{display:flex;flex-direction:column;gap:4px;margin:8px 2px 0}.mz-bossbar b{font-size:12px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#ffd0f0;text-shadow:0 0 10px rgba(255,80,160,.6)}
  .mz-bhp{height:10px;border-radius:6px;background:rgba(255,255,255,.14);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}.mz-bhp i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff3d7f,#ffb340);box-shadow:0 0 12px #ff3d7f;transition:width .35s cubic-bezier(.34,1.56,.64,1)}
  .mz-xtra{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:6px;min-height:0}.mz-xtra:empty{display:none}.mz-prog ~ .mz-xtra{margin-top:21px}
  .mz-xtra > span{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border-radius:13px;background:rgba(20,10,50,.6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);font-size:12px;font-weight:900;font-variant-numeric:tabular-nums}
  .mz-xtra .gi{width:14px;height:14px}.mz-xc .gi{stroke:#d58bff}.mz-xk .gi{stroke:#ffd84d}.mz-xtra .ok{box-shadow:inset 0 0 0 1px #ffd84d;color:#ffe9a0}.mz-xr{color:#ffd0a0}
  .mz-hrt{gap:2px!important;padding:0 8px!important}.mz-hrt .gi{width:16px;height:16px;stroke:#ff7aa8;fill:none}.mz-hrt .gi.on{fill:#ff4f7b;stroke:#ff9ab8}
  .mz-obj em{flex-basis:100%;text-align:center;font-style:normal;font-size:12.5px;font-weight:800;color:#ffe08a;white-space:normal}
  /* transition entre mondes */
  .mz-wtrans{position:absolute;inset:0;z-index:70;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--g) 55%,var(--b1)),var(--b2) 75%);animation:mzWtIn .45s cubic-bezier(.22,1,.36,1) both;pointer-events:all}
  .mz-wtrans.out{animation:mzWtOut .4s ease-in both}
  .mz-wt-in{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;animation:mzWtPop .7s cubic-bezier(.34,1.56,.64,1) both}
  .mz-wt-in .mz-wemb{position:static;transform:none;width:96px;height:96px;border-radius:30px;margin-bottom:8px}.mz-wt-in .mz-wemb svg{width:54px;height:54px}
  .mz-wt-in small{font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:var(--e)}.mz-wt-in b{font-size:28px;font-weight:900;padding:0 24px;text-shadow:0 0 24px var(--g)}
  @keyframes mzWtIn{from{opacity:0;clip-path:circle(0% at 50% 50%)}to{opacity:1;clip-path:circle(75% at 50% 50%)}}
  @keyframes mzWtOut{to{opacity:0}}
  @keyframes mzWtPop{from{opacity:0;transform:scale(.7) translateY(16px)}to{opacity:1;transform:none}}
  /* objectifs au départ d'un niveau */
  .mz-obj{position:absolute;left:50%;top:124px;transform:translateX(-50%);z-index:3;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 12px;width:max-content;max-width:calc(100% - 24px);padding:8px 14px;border-radius:16px;background:rgba(20,10,50,.82);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 8px 22px rgba(0,0,0,.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:opacity .4s,transform .4s;pointer-events:none}
  .mz-obj small{display:none}
  .mz-obj span{display:flex;align-items:center;gap:4px;font-size:12.5px;font-weight:800;white-space:nowrap}.mz-obj .gi{width:14px;height:14px;fill:#ffcf3a;stroke:#e19c00}
  .mz-obj.out{opacity:0;transform:translate(-50%,-10px)}
  .mz-obj:not(.out) ~ .mz-hint{top:176px}.mz-obj.tip:not(.out) ~ .mz-hint{top:228px}
  @media (prefers-reduced-motion:reduce){.mz-wtrans,.mz-wt-in{animation-duration:.01s}}
  .mz-lvgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .mz-lv{border:0;border-radius:16px;padding:10px 4px 8px;background:rgba(10,5,30,.55);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--e) 45%,transparent);color:#fff;font:inherit;display:flex;flex-direction:column;align-items:center;gap:3px;transition:transform .15s}
  .mz-lv:active{transform:scale(.95)}
  .mz-lv b{font-size:22px;font-weight:900;line-height:1;text-shadow:0 0 12px var(--g)}.mz-lv b .gi{width:18px;height:18px}
  .mz-lv.done{background:linear-gradient(160deg,color-mix(in srgb,var(--g) 35%,rgba(10,5,30,.6)),rgba(10,5,30,.6))}
  .mz-lv.locked{opacity:.55}
  .mz-ls{display:flex;gap:1px}.mz-ls .gi{width:14px;height:14px;fill:rgba(255,255,255,.14);stroke:rgba(255,255,255,.3);stroke-width:1.2}.mz-ls i.on .gi{fill:#ffcf3a;stroke:#e19c00}
  .mz-lv small{font-size:11px;font-weight:800;color:#cbbcff;font-variant-numeric:tabular-nums}
  .mz-preview{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:24px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);margin-bottom:14px}
  .mz-big{width:120px;height:120px;filter:drop-shadow(0 8px 16px rgba(150,90,255,.5));animation:mzFloat 2.6s ease-in-out infinite}
  .mz-preview b{display:block;font-size:22px;font-weight:900}.mz-preview span{display:block;font-size:13px;color:#cbbcff;margin:2px 0 10px}
  .mz-trailp{display:block;width:120px;height:8px;border-radius:6px;background:linear-gradient(90deg,transparent,var(--b),var(--a));box-shadow:0 0 12px var(--b)}
  .mz-skins{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .mz-skin{border-radius:20px;padding:12px 10px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px}
  .mz-skin.sel{box-shadow:inset 0 0 0 2px #a970ff,0 0 18px rgba(169,112,255,.45);background:rgba(169,112,255,.14)}
  .mz-skin{position:relative}.mz-skin .mz-spr{width:84px;height:84px}
  .mz-rar{position:absolute;top:8px;left:8px;font-size:9.5px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;border-radius:9px;color:#fff;background:rgba(255,255,255,.14)}
  .mz-rar.r-r{background:linear-gradient(135deg,#3aa0ff,#2f6bff)}.mz-rar.r-e{background:linear-gradient(135deg,#b45cff,#7b2cff)}.mz-rar.r-l{background:linear-gradient(135deg,#ffb020,#ff6a00);box-shadow:0 0 10px rgba(255,160,40,.5)}
  .mz-skin .mz-spr.sil{filter:brightness(0) drop-shadow(0 0 1px rgba(255,255,255,.5));opacity:.85}
  .mz-skin b{font-size:15px;font-weight:900}.mz-skin em{font-style:normal;font-size:12px;color:#cbbcff;min-height:30px}
  .mz-skin small{font-size:11px;color:#a99cf0;margin-top:2px}
  .gbtn.sm{padding:9px 14px;font-size:14px;margin-top:4px;gap:5px}.gbtn.sm .mz-ic{width:18px;height:18px}
  .mz-tag{display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:7px 12px;border-radius:14px;background:rgba(143,255,190,.14);color:#8ff0c0;font-size:13px;font-weight:900}.mz-tag .gi{width:14px;height:14px}
  .mz-upg{display:flex;flex-direction:column;gap:9px}
  .mz-up{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;border-radius:18px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
  .mz-up>div{flex:1;min-width:0}.mz-up b{display:block;font-size:15px;font-weight:900}.mz-up em{display:block;font-style:normal;font-size:12.5px;color:#cbbcff;line-height:1.3}.mz-up small{font-size:11.5px;color:#9fe7ff;font-weight:800}
  .mz-set{display:flex;flex-direction:column;gap:9px}
  .mz-range,.mz-tog{display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:18px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);font-weight:800;font-size:14.5px;color:#fff}
  .mz-range span{width:110px;flex:none}.mz-range input{flex:1;accent-color:#a970ff;touch-action:pan-x}.mz-range b{width:30px;text-align:right;font-variant-numeric:tabular-nums}
  .mz-tog span{flex:1}.mz-tog small{font-weight:600;color:#a99cf0;font-size:12px}
  .mz-tog input{position:absolute;opacity:0;pointer-events:none}
  .mz-tog i{width:46px;height:28px;border-radius:14px;background:rgba(255,255,255,.18);position:relative;flex:none;transition:background .2s}
  .mz-tog i:after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s cubic-bezier(.34,1.5,.5,1)}
  .mz-tog input:checked+i{background:linear-gradient(140deg,#a970ff,#4f7bff)}.mz-tog input:checked+i:after{transform:translateX(18px)}
  .mz-panel{color:#2a1f6b;background:linear-gradient(180deg,#ffffff,#f1eaff)}
  .mz-pmilo{width:110px;height:110px;margin:-74px auto 0;filter:drop-shadow(0 10px 16px rgba(60,20,140,.4))}
  .mz-pmilo .mz-spr{width:110px;height:110px}
  .mz-panel.win .mz-pmilo{animation:mzFloat 1.6s ease-in-out infinite}
  .mz-endstars{display:flex;justify-content:center;gap:4px;margin:6px 0 2px}
  .mz-endstars i{width:50px;height:50px;display:grid;place-items:center}
  .mz-endstars .gi{width:46px;height:46px;fill:#e7e0fb;stroke:#d6ccf5;stroke-width:1.2}
  .mz-endstars i.on{animation:mzStar .5s cubic-bezier(.34,1.7,.5,1) both}.mz-endstars i.on .gi{fill:#ffcf3a;stroke:#e19c00}
  @keyframes mzStar{0%{transform:scale(0) rotate(-40deg)}100%{transform:none}}
  .mz-endlbl{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:11px;font-weight:800;color:#a99cc8;margin-bottom:8px}.mz-endlbl .on{color:#c27a00}
  .mz-sum{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin:4px 0}
  .mz-sum div{background:#f2ecff;border-radius:14px;padding:7px 10px;text-align:left}.mz-sum span{display:block;font-size:11px;font-weight:800;color:#8a7cc0;text-transform:uppercase;letter-spacing:.4px}.mz-sum b{font-size:19px;font-weight:900;color:#3d2a9e;font-variant-numeric:tabular-nums}
  .mz-earn{display:flex;align-items:center;justify-content:center;gap:5px;font-weight:800!important;color:#8a5a00!important;margin:8px 0 0!important}.mz-earn .mz-ic{width:18px;height:18px}
  .mz-unlock{display:flex;align-items:center;gap:10px;margin:8px 0 0;padding:6px 10px;border-radius:16px;background:linear-gradient(120deg,#efe5ff,#e2f6ff);text-align:left;font-size:13.5px;color:#3a2a8a}.mz-unlock .mz-spr{width:52px;height:52px}
  .mz-psets{max-height:86%;overflow:auto;text-align:left}.mz-psets h3{text-align:center}
  .mz-psets .mz-range,.mz-psets .mz-tog{background:#f2ecff;box-shadow:none;color:#2a1f6b}.mz-psets .mz-tog small{color:#8a7cc0}
  .mz-toast{position:absolute;left:50%;bottom:max(24px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:60;padding:11px 18px;border-radius:18px;background:rgba(20,10,50,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2),0 10px 30px rgba(0,0,0,.4);font-weight:800;font-size:14px;white-space:nowrap;animation:mzToast 2.2s ease forwards}
  @keyframes mzToast{0%{opacity:0;transform:translate(-50%,10px)}10%,85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0}}
  @media (prefers-reduced-motion:reduce){.mz-amb i,.mz-hero,.mz-big,.mz-plat,.mz-hand{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
