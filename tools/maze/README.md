# Outils Milo Maze (non publiés)

- `gen.js` : générateur + solveur des niveaux. `node gen.js ../../public/games/maze-levels.js`
  Chaque niveau est vérifié : terminable, aucune impasse sans retour possible, pièges évitables.
- `t1.js` : bot de non-régression — joue tous les niveaux dans le vrai moteur (Playwright).
- `test-migration.js` : vérifie la migration des anciennes sauvegardes (v1 → v2).
- `srv.js` : petit serveur local utilisé par les tests (sert `public/`).

Sauvegarde : clés de niveau permanentes `idDuMonde:index` (ex. `ruines:3`).
Ne jamais changer l'`id` d'un monde dans `games/maze-worlds.js`.
