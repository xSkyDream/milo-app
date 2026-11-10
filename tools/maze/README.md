# Outils Milo Maze (non publiés)

- `gen.js` : générateur + solveur des niveaux. `node gen.js ../../public/games/maze-levels.js`
  Chaque niveau est vérifié : terminable, aucune impasse sans retour possible, pièges évitables.
- `gen2.js` : générateur V2 (mondes enrichis) → `maze-levels-v2.js`. `CAND=40 node gen2.js ../../public/games/maze-levels-v2.js`
  Les mondes déjà présents dans le fichier sont CONSERVÉS (les joueurs y ont leur progression) ; seuls les
  mondes absents sont générés. `ONLY=foret,sables` force la régénération de ces mondes.
  Solveur à états (position + masque : interrupteur, une case par plaque, parité des murs de grès, une case par
  dalle fragile + positions des blocs gelés + gravité + rotation des engrenages + une case par prisme de lumière + couleur
  active des murs du néant ; neige = arrêt net ; lave montante et bulles d'air
  calculées sur la solution pour un joueur posé) : mécanismes obligatoires, secrets optionnels, aucune impasse, niveaux « toutes les pièces »
  vérifiés, checkpoints sûrs (depuis un drapeau, la sortie reste accessible quel que soit l'état du niveau).
  Arènes de boss validées (chaque cible atteignable depuis chaque arrêt, chaque arrêt peut esquiver sa ligne et
  sa colonne). Contrôle : `ONLY=ruines,cyber` vers un fichier temporaire redonne exactement les niveaux publiés.
  Murs du néant : le générateur refuse tout arrêt sur une case qui deviendrait pleine au changement de couleur.
  Prismes : au checkpoint, le moteur remet les prismes dans l'état du dernier arrêt (état vérifié par le générateur).
- `t1.js` : bot de non-régression — joue tous les niveaux historiques dans le vrai moteur (Playwright).
- `t2.js` : bot V2 — niveaux enrichis, boss, défis, niveaux secrets, collection et déblocages.
- `test-migration.js` : vérifie la migration des anciennes sauvegardes (v1 → v2).
- `srv.js` : petit serveur local utilisé par les tests (sert `public/`).

Sauvegarde : clés de niveau permanentes `idDuMonde:index` (ex. `ruines:3`).
Ne jamais changer l'`id` d'un monde dans `games/maze-worlds.js`.
