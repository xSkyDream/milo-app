/* =====================================================================
   Milo Maze — les 12 mondes (données uniquement, aucun code de jeu)
   - id      : identifiant PERMANENT (sert aux sauvegardes : "id:niveau"). Ne jamais le changer.
   - legacy  : id du monde dans games/maze-levels.js (mondes d'origine)
   - oldIdx  : ancien numéro du monde (sauvegardes v1 "numéro-niveau")
   - tier    : facile | normal | difficile | expert | legendaire
   - pxi     : palette des ennemis pixel art (0 ruines, 1 cyber, 2 cosmos, 3 sables)
   - art     : (optionnel) illustration fournie, ex. 'maze/world_foret.webp' — sinon illustration générée
   Ajouter un monde : ajouter une entrée ici + ses niveaux. Le reste du jeu s'adapte.
   ===================================================================== */
window.MILO_MAZE_WORLDS = [
  { id: 'ruines', legacy: 'ruines', oldIdx: 0, name: 'Les Ruines oubliées', short: 'Ruines oubliées', tier: 'facile', deco: 'vine', pxi: 0,
    blurb: 'Les premiers pas de Milo : glisse, ramasse, esquive.', mech: ['Glissades', 'Pièces et bonus', 'Pics', 'Patrouilles'], boss: 'Le Gardien des ruines',
    icon: '<path d="M4 20h16M6 20V9M18 20V9M4 9h16l-8-5z"/><path d="M10 20v-6h4v6"/>',
    pal: { bg1: '#1a0c3a', bg2: '#0b0520', wall: '#4a2696', wall2: '#5b30b0', deep: '#1c0e3e', face: '#2c1563', edge: '#c69bff', glow: '#a970ff', floor: '#100726', floor2: '#160a33', accent: '#ffd84d', mote: '#c9a8ff' },
    music: { bpm: 80, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4] } },
  { id: 'cyber', legacy: 'temple', oldIdx: 1, name: 'Le Labyrinthe cyber', short: 'Labyrinthe cyber', tier: 'facile', deco: 'glyph', pxi: 1,
    blurb: 'Circuits, lasers et portes automatiques.', mech: ['Lasers', 'Scies', 'Propulseurs', 'Portes automatiques'], boss: 'L’Araignée cybernétique',
    icon: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    pal: { bg1: '#06173d', bg2: '#030a1f', wall: '#103e86', wall2: '#1655a8', deep: '#081a3d', face: '#0a2557', edge: '#5ef2ff', glow: '#22d3ee', floor: '#040c22', floor2: '#07122e', accent: '#ff4fd8', mote: '#7deeff' },
    music: { bpm: 104, root: 52, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 6, 4] } },
  { id: 'foret', name: 'La Forêt des ombres', short: 'Forêt des ombres', tier: 'normal', deco: 'roots', pxi: 0,
    blurb: 'L’obscurité cache des passages… et des pièges.', mech: ['Obscurité', 'Lucioles', 'Passages secrets', 'Pièges invisibles'], boss: 'L’Esprit de la forêt',
    icon: '<path d="M12 3 6 11h3l-4 6h14l-4-6h3z"/><path d="M12 17v4"/>',
    pal: { bg1: '#06201a', bg2: '#020a08', wall: '#1d5a3c', wall2: '#2a7a4f', deep: '#082418', face: '#0f3a27', edge: '#9dffb0', glow: '#3ee08a', floor: '#03120c', floor2: '#061a12', accent: '#fff07a', mote: '#d8ff8a' },
    music: { bpm: 88, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 6, 5, 4] } },
  { id: 'sables', legacy: 'soleil', oldIdx: 3, name: 'Le Temple des sables', short: 'Temple des sables', tier: 'normal', deco: 'sun', pxi: 3,
    blurb: 'Dalles fragiles, murs mouvants et flèches piégées.', mech: ['Dalles fragiles', 'Murs mouvants', 'Flèches', 'Énigmes'], boss: 'Le Pharaon mécanique',
    icon: '<path d="M3 20 12 4l9 16z"/><path d="M12 4l-2 16M3 20h18"/>',
    pal: { bg1: '#3a1606', bg2: '#140602', wall: '#a0521a', wall2: '#bd6a24', deep: '#3b1a07', face: '#6b330e', edge: '#ffd45e', glow: '#ff9d2e', floor: '#170802', floor2: '#210c04', accent: '#fff3a6', mote: '#ffc56b' },
    music: { bpm: 112, root: 53, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 0, 6] } },
  { id: 'glace', name: 'Le Royaume de glace', short: 'Royaume de glace', tier: 'difficile', deco: 'frost', pxi: 2,
    blurb: 'La neige freine, la glace fragile casse derrière toi.', mech: ['Neige qui arrête', 'Glace fragile', 'Blocs gelés'], boss: 'Le Titan de glace',
    icon: '<path d="M12 2v20M4 7l16 10M20 7 4 17"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>',
    pal: { bg1: '#0a2a4a', bg2: '#03101f', wall: '#3a7fc0', wall2: '#5aa2e0', deep: '#0c2c4e', face: '#1a4f80', edge: '#e6f7ff', glow: '#8fd8ff', floor: '#061a30', floor2: '#0a2340', accent: '#ffffff', mote: '#d6f2ff' },
    music: { bpm: 96, root: 55, scale: [0, 2, 4, 7, 9, 11, 14], prog: [0, 5, 3, 4] } },
  { id: 'volcan', name: 'Les Profondeurs volcaniques', short: 'Profondeurs volcaniques', tier: 'difficile', deco: 'ember', pxi: 3,
    blurb: 'La lave monte : pas le temps d’hésiter.', mech: ['Lave montante', 'Plateformes temporaires', 'Geysers'], boss: 'Le Golem volcanique',
    icon: '<path d="M3 20 9 9h6l6 11z"/><path d="M12 9c-1-2 0-4 1-5 0 2 2 2 1 5"/>',
    pal: { bg1: '#3a0806', bg2: '#120202', wall: '#5a1c12', wall2: '#7a2a16', deep: '#2a0a06', face: '#40120a', edge: '#ffb03a', glow: '#ff5a1f', floor: '#160302', floor2: '#200604', accent: '#ffe066', mote: '#ff9a4a' },
    music: { bpm: 120, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 6, 5] } },
  { id: 'atlantide', name: 'L’Atlantide perdue', short: 'Atlantide perdue', tier: 'difficile', deco: 'coral', pxi: 2,
    blurb: 'Courants marins et oxygène compté.', mech: ['Oxygène', 'Courants', 'Bulles d’air'], boss: 'Le Léviathan d’Atlantide',
    icon: '<path d="M12 3v18M7 5v4a5 5 0 0 0 10 0V5"/><path d="M3 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/>',
    pal: { bg1: '#042a3a', bg2: '#010d14', wall: '#0e5a6e', wall2: '#167a8e', deep: '#05262f', face: '#0a3e4c', edge: '#7af6e0', glow: '#2ad8c4', floor: '#021821', floor2: '#04202b', accent: '#ff8aa8', mote: '#a8fff0' },
    music: { bpm: 84, root: 48, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 5, 3] } },
  { id: 'cosmos', legacy: 'galaxie', oldIdx: 2, name: 'La Dimension cosmique', short: 'Dimension cosmique', tier: 'expert', deco: 'crystal', pxi: 2,
    blurb: 'Gravité, commandes inversées et portails.', mech: ['Portails', 'Gravité', 'Commandes inversées'], boss: 'L’Entité cosmique',
    icon: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10.5" ry="3.5" transform="rotate(-20 12 12)"/>',
    pal: { bg1: '#1d0b45', bg2: '#08031a', wall: '#3d1c7a', wall2: '#552399', deep: '#170a36', face: '#2a1158', edge: '#ff7ae0', glow: '#e04fd0', floor: '#0c0520', floor2: '#120830', accent: '#5ee7ff', mote: '#ff9de9' },
    music: { bpm: 90, root: 49, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 5, 3] } },
  { id: 'usine', name: 'L’Usine mécanique', short: 'Usine mécanique', tier: 'expert', deco: 'bolts', pxi: 1,
    blurb: 'Engrenages, presses et robots synchronisés.', mech: ['Engrenages', 'Presses', 'Robots', 'Mécanismes synchronisés'], boss: 'La Machine destructrice',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    pal: { bg1: '#22262e', bg2: '#0b0c10', wall: '#4a5260', wall2: '#606a7a', deep: '#1a1d24', face: '#2c323c', edge: '#ffb44a', glow: '#ff8a1f', floor: '#101216', floor2: '#16191f', accent: '#ffe066', mote: '#c8d0dc' },
    music: { bpm: 116, root: 43, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 5, 6, 4] } },
  { id: 'chateau', name: 'Le Château maudit', short: 'Château maudit', tier: 'expert', deco: 'banner', pxi: 0,
    blurb: 'Des ennemis rusés et de fausses sorties.', mech: ['Ennemis malins', 'Pièges combinés', 'Fausses sorties'], boss: 'Le Roi maudit',
    icon: '<path d="M4 21V9h3V6h2v3h2V4h2v5h2V6h2v3h3v12z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>',
    pal: { bg1: '#200a24', bg2: '#0a030c', wall: '#3e1a48', wall2: '#542460', deep: '#1a0820', face: '#2c1034', edge: '#8dffb8', glow: '#3fe08a', floor: '#0e0410', floor2: '#150618', accent: '#ff4f6d', mote: '#c6a8ff' },
    music: { bpm: 92, root: 46, scale: [0, 1, 3, 5, 6, 8, 10], prog: [0, 6, 5, 1] } },
  { id: 'cristaux', name: 'Le Sanctuaire des cristaux', short: 'Sanctuaire des cristaux', tier: 'legendaire', deco: 'gems', pxi: 2,
    blurb: 'Énigmes de lumière : toutes les mécaniques réunies.', mech: ['Énigmes de cristaux', 'Toutes les mécaniques'], boss: 'Le Gardien des cristaux',
    icon: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 18 3-18"/>',
    pal: { bg1: '#1a0a3a', bg2: '#06021a', wall: '#5a2aa0', wall2: '#7a3ac8', deep: '#1c0c40', face: '#33186a', edge: '#ffffff', glow: '#b48cff', floor: '#0c0624', floor2: '#120a32', accent: '#5ef2ff', mote: '#ffd0ff' },
    music: { bpm: 100, root: 51, scale: [0, 2, 4, 7, 9, 11, 14], prog: [0, 3, 4, 5] } },
  { id: 'finale', name: 'La Dernière dimension', short: 'Dernière dimension', tier: 'legendaire', deco: 'glitch', pxi: 1,
    blurb: 'Des labyrinthes qui changent sous tes pieds. L’épreuve ultime.', mech: ['Labyrinthes évolutifs', 'Boss final'], boss: 'Le Cœur du Néant',
    icon: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    pal: { bg1: '#101010', bg2: '#000000', wall: '#2a2a3a', wall2: '#3a3a52', deep: '#0c0c14', face: '#1a1a26', edge: '#ffd84d', glow: '#ffffff', floor: '#060608', floor2: '#0c0c10', accent: '#ff3df0', mote: '#ffffff' },
    music: { bpm: 124, root: 47, scale: [0, 1, 3, 6, 7, 8, 11], prog: [0, 1, 6, 4] } }
];
window.MILO_MAZE_TIERS = { facile: 'Facile', normal: 'Normal', difficile: 'Difficile', expert: 'Expert', legendaire: 'Légendaire' };
