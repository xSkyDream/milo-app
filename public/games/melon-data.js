/* =====================================================================
   Milo Melon — catalogue des mascottes de fusion
   Ce fichier est la SEULE chose à modifier pour changer la progression :
   ajouter, retirer, réordonner ou remplacer une mascotte. Le moteur lit
   cette liste dans l’ordre (niveau 1 = la plus petite).

   Champs :
   - id      identifiant unique (sert aussi pour les sauvegardes)
   - name    nom affiché
   - size    rayon de collision, en unités du bocal (largeur intérieure = 360)
   - points  points gagnés quand cette mascotte NAÎT d’une fusion
   - src     image dans assets/games/ (PNG ou WebP, fond transparent)
   - body    cercle du corps dans l’image : centre (cx, cy) et rayon r,
             en fraction de la LARGEUR (r, cx) et de la HAUTEUR (cy) de l’image.
             Feuilles, tiges et accessoires peuvent dépasser du cercle.
   - spawn   poids d’apparition comme prochaine mascotte (0 = jamais)
   - color   couleur dominante (particules, interface)
   Pour une nouvelle image : déposer le fichier, mettre à jour src et body.
   ===================================================================== */
window.MILO_MELON_TIERS = [
  { id: 'myrtille', name: 'Myrtille', size: 13, points: 1, src: 'melon/myrtille.webp', body: { cx: 0.506, cy: 0.539, r: 0.454 }, spawn: 5, color: '#8a74ef' },
  { id: 'cerise', name: 'Cerise', size: 17, points: 3, src: 'melon/cerise.webp', body: { cx: 0.429, cy: 0.624, r: 0.388 }, spawn: 4, color: '#e5304e' },
  { id: 'pomme', name: 'Pomme', size: 22, points: 6, src: 'melon/pomme.webp', body: { cx: 0.465, cy: 0.576, r: 0.414 }, spawn: 3, color: '#8fd14f' },
  { id: 'fraise', name: 'Fraise', size: 27, points: 10, src: 'melon/fraise.webp', body: { cx: 0.498, cy: 0.539, r: 0.448 }, spawn: 2, color: '#ef3b4a' },
  { id: 'orange', name: 'Orange', size: 33, points: 15, src: 'melon/orange.webp', body: { cx: 0.507, cy: 0.541, r: 0.461 }, spawn: 1.4, color: '#ff8c1a' },
  { id: 'citron', name: 'Citron', size: 40, points: 21, src: 'melon/citron.webp', body: { cx: 0.511, cy: 0.557, r: 0.464 }, spawn: 0, color: '#ffd22e' },
  { id: 'peche', name: 'Pêche', size: 47, points: 28, src: 'melon/peche.webp', body: { cx: 0.492, cy: 0.545, r: 0.433 }, spawn: 0, color: '#ff9fb3' },
  { id: 'prune', name: 'Prune', size: 55, points: 36, src: 'melon/prune.webp', body: { cx: 0.502, cy: 0.548, r: 0.419 }, spawn: 0, color: '#a04fd6' },
  { id: 'ananas', name: 'Ananas', size: 63, points: 45, src: 'melon/ananas.webp', body: { cx: 0.501, cy: 0.601, r: 0.475 }, spawn: 0, color: '#ffc93c' },
  { id: 'coco', name: 'Noix de coco', size: 72, points: 55, src: 'melon/coco.webp', body: { cx: 0.497, cy: 0.505, r: 0.473 }, spawn: 0, color: '#9a5a3a' },
  { id: 'melon', name: 'Melon', size: 82, points: 66, src: 'melon/melon.webp', body: { cx: 0.501, cy: 0.547, r: 0.466 }, spawn: 0, color: '#f2d58a' },
  { id: 'pasteque', name: 'Pastèque', size: 94, points: 78, src: 'melon/pasteque.webp', body: { cx: 0.505, cy: 0.499, r: 0.472 }, spawn: 0, color: '#3fae4a' }
];
