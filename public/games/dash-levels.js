/* =====================================================================
   Milo Dash — niveaux (le moteur est dans dash.js)
   Chaque niveau = réglages + thème néon + musique + build(B) qui place
   les objets. Les positions se donnent en TEMPS MUSICAUX :
   - B.x(t)     position de Milo sur le temps t
   - B.apex(t)  sommet d'un saut lancé sur le temps t
   - B.spikes(t, n, y, sens)  n piques à franchir en sautant sur le temps t
   Autres outils : spike(x, y, sens), row(x0, x1, y, sens) (rangée de piques),
   block(x0, x1, y0, y1), ceil(x0, x1, y) (plafond), orb(x, y), pad(x, y, sens),
   portal(x, 'ship'|'cube'|'flip'|'norm', yCentre, hauteur), saw(x, y, rayon),
   star(x, y) (3 par niveau), cam(x0, x1, yCentre) (cadrage), text(x, y, texte),
   edge(t, dh) (bord d'un bloc plus haut de dh atteint par un saut sur t).
   speeds : [[temps, vitesse 0..3, yPortail]] (0 lent, 1 normal, 2 ×1,25, 3 ×1,5).
   music  : root (demi-tons depuis La), prog (accords [degré, 'm'|'M'] par mesure),
            sec ([mesure, intensité 0..4]), bass, arp, wave, bright, seed.
   Après modification : valider avec le bot (MiloGames.byId.dash._debug.solve).
   ===================================================================== */
(function () {
  'use strict';
  function kit(B) {
    const X = B.x;
    return {
      X,
      s: (b, n, y, d) => B.spikes(b, n || 1, y || 0, d || 1),
      gap: (b, f) => X(b) + B.v(b) * B.T * f,
      // porte de vol : ouverture centrée sur yc entre le sol et le plafond « top »
      gate: (b, yc, top, w, open) => { w = w || 1.3; open = open || 3.6; const a = yc - open / 2, c = yc + open / 2; if (a > 0.05) B.block(X(b), X(b) + w, 0, a); if (c < top - 0.05) B.block(X(b), X(b) + w, c, top); },
      // trampoline sur le temps t, plateforme fine 3 blocs plus haut jusqu'à « end », piques dessous
      padPlat: (b, g, end) => { g = g || 0; B.pad(X(b) + 0.2, g); B.block(X(b) + B.v(b) * 0.27, end, g + 2.4, g + 3); B.row(X(b) + 1.2, end + 1.2, g); }
    };
  }

  window.MILO_DASH_LEVELS = [
    {
      id: 'envol', name: 'Envol', diff: 'Facile', face: 'pl3_joie', bpm: 120, len: 88,
      theme: { name: 'envol', sky: ['#090322', '#1c0b52', '#3d1488'], edge: '#8b5cff', line: '#6ee7ff', block: '#160b44', spike: '#ff4fd8', spikeIn: '#4a0f5c', ground: ['#1a0b4a', '#05020f'], far: 'peaks', far2: '#7c5cff', farFill: 'rgba(30,12,80,.6)', mid: '#8b5cff', seed: 5 },
      music: { root: 0, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']], sec: [[0, 1], [1, 2], [4, 3], [8, 4], [12, 2], [14, 3], [15, 4], [21, 1]], bass: 'eighth', arp: [0, 1, 2, 3, 4, 5, 4, 3], wave: 'triangle', bright: 3200, seed: 11, vol: 0.8 },
      build(B) {
        const { X, s, gap } = kit(B);
        s(4); s(6); s(8); s(10, 2);
        B.text(X(11.2), 4.4, 'Maintiens pour enchaîner');
        s(12); s(13); s(14, 2);
        // premier bloc
        B.block(B.edge(16, 1), X(19.2), 0, 1); s(18, 1, 1);
        s(20); s(22, 2);
        B.star(B.apex(23), 2.6);                       // étoile 1 : saut bonus sur le temps
        s(24);
        // escalier, fosse, descente
        B.block(B.edge(26, 1), B.edge(27, 1), 0, 1);
        B.block(B.edge(27, 1), X(29) + 0.3, 0, 2);
        B.row(X(29) + 0.3, gap(29, 0.62), 0);
        B.block(gap(29, 0.62), X(31) + 0.3, 0, 2);
        B.row(X(31) + 0.3, gap(31, 0.72), 0);
        B.block(gap(31, 0.72), X(33.2), 0, 1);
        // rythme
        s(35); s(36); s(37, 2); s(39); s(40, 2); s(42); s(43);
        // plateformes au-dessus des piques
        B.block(B.edge(44, 1), X(45) + 0.3, 0, 1);
        B.row(X(45) + 0.3, gap(45, 0.62), 0);
        B.block(gap(45, 0.62), X(46) + 0.3, 0, 1);
        B.row(X(46) + 0.3, gap(46, 0.62), 0);
        B.block(gap(46, 0.62), X(47.6), 0, 1);
        // refrain
        s(49, 2); s(51, 2); s(52); s(53); s(55, 2); s(57); s(58);
        // bloc + orbe facultative vers l'étoile 2
        B.block(B.edge(60, 1), X(64), 0, 1); s(61, 1, 1); s(62, 1, 1);
        B.orb(B.apex(61), 3.55); B.star(B.apex(61) + 1.67, 5.5);
        // final
        s(66); s(67); s(68, 2); s(70); s(71, 2);
        B.block(B.edge(73, 1), B.edge(74, 1), 0, 1);
        B.block(B.edge(74, 1), X(76) + 0.3, 0, 2);
        B.star(B.apex(75), 4.5);                       // étoile 3 : saut bonus en haut de l'escalier
        B.row(X(76) + 0.3, gap(76, 0.62), 0);
        B.block(gap(76, 0.62), X(78.2), 0, 2);
        s(80); s(81, 2); s(83);
      }
    },
    {
      id: 'pulsar', name: 'Pulsar', diff: 'Normal', face: 'pl3_clin', bpm: 126, len: 96,
      theme: { name: 'pulsar', sky: ['#020a1c', '#06204a', '#0b3b78'], edge: '#3fd2ff', line: '#a5f3ff', block: '#071a3d', spike: '#ff5fa2', spikeIn: '#4a0f3c', ground: ['#06244d', '#01060f'], far: 'rings', far2: '#3fd2ff', farFill: 'rgba(5,20,60,.5)', mid: '#3fd2ff', seed: 8 },
      music: { root: 5, prog: [[0, 'm'], [-2, 'M'], [-4, 'M'], [-2, 'M']], sec: [[0, 1], [2, 2], [4, 3], [7, 4], [12, 3], [13, 4], [17, 2], [19, 4], [23, 1]], bass: 'offbeat', arp: [0, 2, 1, 3, 2, 4, 3, 5], wave: 'square', bright: 2200, seed: 23, vol: 0.75 },
      build(B) {
        const { X, s, gate, padPlat } = kit(B);
        s(4); s(6, 2); s(8); s(9); s(10, 2);
        // trampoline vers une plateforme haute
        padPlat(12, 0, X(16)); s(14, 1, 3);
        B.star(B.apex(15), 5.5);                        // étoile 1 : saut bonus sur la plateforme
        s(18); s(19); s(20, 2);
        // orbes au-dessus des fosses (touche dans l'anneau)
        B.text(X(21.3), 4.6, 'Touche dans l’anneau');
        B.orb(B.apex(22), 2.57); B.row(X(22) + 0.9, X(22) + B.v(22) * 0.7855 - 1.0, 0);
        B.orb(B.apex(25), 2.57); B.row(X(25) + 0.9, X(25) + B.v(25) * 0.7855 - 1.0, 0);
        s(28, 2);
        // vaisseau
        const p = X(30.5);
        B.portal(p, 'ship', 2, 8); B.ceil(p - 0.5, X(48) + 1, 9); B.cam(p - 7, X(48) + 5, 4.5); B.row(p + 2, X(47.6), 0);
        [[32.5, 4.6], [34, 3.2], [35.5, 5.8], [37, 3.6], [38.5, 6], [40, 4], [41.5, 2.8], [43, 5.2], [44.5, 3.4], [46, 5.2]].forEach(([b, y]) => gate(b, y, 9));
        B.star(X(40.75), 1.5);                          // étoile 2 : plongée près des piques
        B.portal(X(48), 'cube', 4.5, 10);
        s(51); s(52, 2);
        padPlat(54, 0, X(58)); s(56, 1, 3);
        s(60); s(61);
        // chaîne d'orbes
        const o1 = B.apex(63), o2 = o1 + B.v(63) * 0.2325;
        B.orb(o1, 2.57); B.orb(o2, 4.73); B.row(X(63) + 0.9, o2 + B.v(63) * 0.6325 - 1.0, 0);
        s(67, 2); s(69); s(70);
        // orbe facultative vers l'étoile 3
        s(72, 2); B.orb(B.apex(72), 2.57); B.star(B.apex(72) + 1.67, 4.6);
        s(75); s(76); s(77, 2);
        // final : marche, trampoline, plateforme
        B.block(B.edge(79, 1), X(80.6), 0, 1);
        B.pad(X(80), 1); B.block(X(80) + B.v(80) * 0.27, X(84), 3.4, 4); B.row(X(80.6) + 0.3, X(84) + 1.2, 0);
        s(82, 1, 4);
        s(86, 2); s(88); s(89);
      }
    },
    {
      id: 'gravite', name: 'Gravité', diff: 'Difficile', face: 'pl3_determine', bpm: 132, len: 106, speeds: [[0, 1], [54, 2, 1.5]],
      theme: { name: 'gravite', sky: ['#12031c', '#36094a', '#6a1360'], edge: '#ff4fd2', line: '#ffd0f3', block: '#2a0838', spike: '#ffd84d', spikeIn: '#5a3a00', ground: ['#36094a', '#0a0210'], far: 'hex', far2: '#ff4fd2', farFill: 'rgba(50,8,60,.5)', mid: '#ff4fd2', seed: 13 },
      music: { root: -3, prog: [[0, 'm'], [5, 'm'], [-4, 'M'], [-5, 'M']], sec: [[0, 1], [2, 2], [3, 3], [8, 4], [13, 3], [14, 4], [19, 2], [20, 4], [26, 1]], bass: 'roll', arp: [0, 1, 2, 4, 3, 2, 1, 2], wave: 'sawtooth', bright: 1800, seed: 37, vol: 0.72 },
      build(B) {
        const { X, s, gate } = kit(B);
        s(4); s(6, 2); s(8); s(9); s(10); s(11, 2);
        // gravité inversée : Milo court au plafond
        B.ceil(X(13), X(29) + 2, 6); B.cam(X(12), X(31), 3);
        B.portal(X(14), 'flip', 2, 7);
        s(16, 1, 6, -1); s(17, 1, 6, -1); s(18, 2, 6, -1);
        B.star(B.apex(19), 3.45);                       // étoile 1 : saut bonus à l'envers
        s(20, 1, 6, -1); s(21, 2, 6, -1); s(23, 1, 6, -1);
        B.block(B.edge(24, 1), X(26.6), 5, 6); s(25, 1, 5, -1);
        B.portal(X(28), 'norm', 3, 7);
        s(31); s(32, 2);
        // vaisseau
        const p = X(34);
        B.portal(p, 'ship', 2, 8); B.ceil(p - 0.5, X(50.5) + 1, 9); B.cam(p - 7, X(50.5) + 5, 4.5); B.row(p + 2, X(50), 0);
        [[36, 5.2], [37.5, 2.8], [39, 6], [40.5, 3.4], [42, 6.2], [43.5, 2.8], [45, 5], [46.5, 6.4], [48, 3], [49.5, 5]].forEach(([b, y]) => gate(b, y, 9, 1.3, 3.4));
        B.star(X(42) + 0.65, 7.1);                      // étoile 2 : tout en haut de la porte
        B.portal(X(50.7), 'cube', 4.5, 10);
        // vitesse ×1,25
        s(56); s(57, 2); s(59); s(60, 2);
        // bascules de gravité
        B.ceil(X(61.5), X(76) + 2, 6); B.cam(X(61), X(78), 3);
        B.portal(X(62), 'flip', 2, 7);
        s(64, 1, 6, -1); s(65, 2, 6, -1);
        B.portal(X(66.5), 'norm', 3, 7);
        s(68); s(69, 2);
        B.portal(X(70.5), 'flip', 2, 7);
        s(72, 2, 6, -1); s(73, 1, 6, -1);
        B.portal(X(74.5), 'norm', 3, 7);
        s(77); s(78, 2);
        // orbe, triple, escalier
        s(80); s(81);
        B.orb(B.apex(83), 2.57); B.row(X(83) + 1.0, X(83) + B.v(83) * 0.7855 - 1.1, 0);
        s(86, 2); s(87);
        B.block(B.edge(89, 1), B.edge(90, 1), 0, 1); B.block(B.edge(90, 1), X(92.3), 0, 2);
        B.star(B.apex(91), 4.55);                       // étoile 3 : saut bonus au sommet
        s(94, 3); s(96); s(97, 2); s(99); s(100, 2);
      }
    },
    {
      id: 'hyper', name: 'Hyperdrive', diff: 'Extrême', face: 'pl3_alerte', bpm: 140, len: 118, speeds: [[0, 2], [37, 3, 1.5], [56, 0, 1.5], [72, 3, 1.5]],
      theme: { name: 'hyper', sky: ['#01030f', '#0a1440', '#1a2d8a'], edge: '#5f7bff', line: '#9ef0ff', block: '#0a1035', spike: '#ff3d6e', spikeIn: '#4a0820', ground: ['#0a1440', '#000208'], far: 'towers', far2: '#5f7bff', farFill: 'rgba(8,14,50,.75)', mid: '#ff3d6e', seed: 21 },
      music: { root: 7, prog: [[0, 'm'], [-4, 'M'], [-2, 'M'], [0, 'm']], sec: [[0, 2], [2, 3], [4, 4], [14, 3], [15, 4], [18, 2], [19, 3], [22, 4], [28, 1]], bass: 'roll', arp: [0, 1, 2, 3, 4, 5, 4, 3], wave: 'square', bright: 3200, seed: 41, vol: 0.72 },
      build(B) {
        const { X, s, gap, gate, padPlat } = kit(B);
        s(4); s(5); s(6, 2); s(8, 2);
        // scies au sol
        B.saw(B.apex(10), -0.2, 1.1); s(11); B.saw(B.apex(12), -0.2, 1.1); s(13, 2);
        // marches rapides
        B.block(B.edge(15, 1), B.edge(16, 1), 0, 1); B.block(B.edge(16, 1), X(17) + 0.3, 0, 2);
        B.row(X(17) + 0.3, gap(17, 0.62), 0); B.block(gap(17, 0.62), X(18.6), 0, 2);
        // vaisseau 1 avec scies
        const p = X(20.5);
        B.portal(p, 'ship', 2, 8); B.ceil(p - 0.5, X(34.5) + 1, 9); B.cam(p - 7, X(34.5) + 5, 4.5); B.row(p + 2, X(34), 0);
        [[22.5, 5.5], [24, 3], [25.5, 6], [27, 3.5], [28.5, 6.2], [30, 4.2], [31.5, 2.8], [33, 5]].forEach(([b, y]) => gate(b, y, 9));
        B.saw(X(26.25) + 0.6, 7.6, 0.8); B.saw(X(29.25) + 0.6, 2, 0.8); B.saw(X(32.25) + 0.6, 7.2, 0.8);
        B.star(X(29.25) + 0.6, 3.7);                    // étoile 1 : frôler la scie
        B.portal(X(34.5), 'cube', 4.5, 10);
        // vitesse ×1,5
        s(39); s(40, 2); s(42, 3);
        const o1 = B.apex(44), o2 = o1 + B.v(44) * 0.2325;
        B.orb(o1, 2.57); B.orb(o2, 4.73); B.row(X(44) + 1.0, o2 + B.v(44) * 0.6325 - 1.3, 0);
        s(48); s(49, 2);
        padPlat(51, 0, X(55)); s(53, 1, 3);
        // ralenti + gravité
        s(58); s(59.5); s(61);
        B.ceil(X(62), X(70) + 2, 5.5); B.cam(X(61.5), X(72), 2.75);
        B.portal(X(62.5), 'flip', 2, 7);
        s(64.5, 1, 5.5, -1); s(66, 1, 5.5, -1);
        B.star(B.apex(67), 3.0);                        // étoile 2 : saut bonus au plafond
        s(68, 1, 5.5, -1);
        B.portal(X(69.5), 'norm', 3, 7);
        // vaisseau 2 (très rapide)
        const q = X(74.5);
        B.portal(q, 'ship', 2, 8); B.ceil(q - 0.5, X(90.5) + 1, 9); B.cam(q - 9, X(90.5) + 6, 4.5); B.row(q + 2, X(90), 0);
        [[77, 4.5], [78.5, 6.4], [80, 3], [81.5, 5.8], [83, 2.8], [84.5, 5.2], [86, 6.6], [87.5, 3.6], [89, 5.4]].forEach(([b, y]) => gate(b, y, 9, 1.3, 3.5));
        B.saw(X(82.25) + 0.6, 7.8, 0.8); B.saw(X(85.25) + 0.6, 1.6, 0.8);
        B.portal(X(90.7), 'cube', 4.5, 10);
        // sprint final
        s(93); s(94, 2); s(96, 3); B.saw(B.apex(98), -0.2, 1.1); s(99, 2);
        B.block(B.edge(101, 1), B.edge(102, 1), 0, 1); B.block(B.edge(102, 1), X(104) + 0.3, 0, 2);
        B.star(B.apex(103), 4.55);                      // étoile 3 : saut bonus au sommet
        B.row(X(104) + 0.3, gap(104, 0.62), 0); B.block(gap(104, 0.62), X(106.5), 0, 2);
        s(108, 2); s(109); s(110, 3); s(112, 2);
      }
    }
  ];
})();
