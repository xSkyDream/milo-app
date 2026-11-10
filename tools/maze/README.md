# Outils Milo Maze (non publiés)

- `gen.js` : générateur + solveur des niveaux. `node gen.js ../../public/games/maze-levels.js`
  Chaque niveau est vérifié : terminable, aucune impasse sans retour possible, pièges évitables.
- `gen2.js` : générateur V2 (mondes enrichis) → `maze-levels-v2.js`. `CAND=40 node gen2.js ../../public/games/maze-levels-v2.js`
  Solveur à états (position + interrupteur + grille) : mécanismes obligatoires, secrets optionnels,
  aucune impasse, niveaux « toutes les pièces » vérifiés. Arènes de boss validées (chaque cible
  atteignable depuis chaque arrêt, chaque arrêt peut esquiver sa ligne et sa colonne).
- `t1.js` : bot de non-régression — joue tous les niveaux historiques dans le vrai moteur (Playwright).
- `t2.js` : bot V2 — niveaux enrichis, boss, défis, niveaux secrets, collection et déblocages.
- `test-migration.js` : vérifie la migration des anciennes sauvegardes (v1 → v2).
- `srv.js` : petit serveur local utilisé par les tests (sert `public/`).

Sauvegarde : clés de niveau permanentes `idDuMonde:index` (ex. `ruines:3`).
Ne jamais changer l'`id` d'un monde dans `games/maze-worlds.js`.
