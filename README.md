# Milo — compagnon de convalescence

Application web installable (PWA) : traitements, soins, calendrier, progression, et Milo, un assistant de convalescence par chat qui se souvient de vos échanges.
**100 % gratuit** : hébergement Vercel (offre Hobby) + Google Gemini (offre gratuite).

## Structure
```
public/          site statique (index.html + mascottes, icônes, manifeste PWA)
public/games/    Milo Games : milo-games.js (hub + moteur commun), crush.js, blocks.js, flap.js, jump.js, melon-data.js (catalogue) + melon.js, dash-levels.js (niveaux) + dash.js
api/chat.js      relais vers Gemini (intelligence de Milo, avec outils)
vercel.json      configuration Vercel
```
La clé API reste côté serveur (variable d'environnement Vercel). Le navigateur n'y a jamais accès.

## Déployer sur Vercel (gratuit)
1. **Clé Gemini** : aistudio.google.com → **Get API key** → **Create API key**. Aucune carte bancaire.
2. vercel.com → **Add New… → Project** → importer `xSkyDream/milo-app`. Framework : **Other**.
3. **Environment Variables** : `GEMINI_API_KEY` = ta clé.
4. **Deploy**. Chaque `git push` sur `main` redéploie automatiquement.

## Installer sur iPhone
Ouvrir l'adresse Vercel dans Safari → Partager → **Sur l'écran d'accueil**.

## Ce qu'il faut savoir sur l'offre gratuite de Google
- **Confidentialité** : sur l'offre gratuite, Google peut utiliser les échanges pour améliorer ses produits, et des personnes peuvent les relire. N'écris pas à Milo d'informations que tu ne veux pas partager (nom complet, numéro de sécurité sociale, adresse…).
- **Quotas** : limités par minute et par jour (voir la page des quotas dans Google AI Studio). Si la limite est atteinte, Milo répond en mode simple.
- **Usage** : l'offre gratuite convient à un usage personnel. Pour proposer l'app à d'autres personnes dans l'Union européenne, Google impose l'offre payante.

## Sans clé
Sans `GEMINI_API_KEY`, l'app fonctionne quand même : Milo répond avec ses réponses intégrées.

## Variables optionnelles
| Variable | Défaut |
|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` |

## Mémoire de Milo
- **Historique** : les 30 derniers messages (horodatés) accompagnent chaque question, pour que Milo garde le fil.
- **Résumé glissant** : au-delà de 40 messages, les 20 plus anciens sont résumés dans un carnet de suivi et restent connus de Milo.
- **Souvenirs** : Milo enregistre ce que tu lui confies de durable (douleurs, sommeil, moral, habitudes) et les met à jour quand ils changent. Bouton ✦ en haut du chat pour les consulter ou les supprimer.
- Tout est stocké dans le navigateur du téléphone.

## Milo Games
- **Milo Crush** : match-3 à niveaux infinis générés à partir du numéro de niveau (formes de grille, objectifs score / collecte / gelée / glaçons, difficulté progressive). Milo rayés, bombes et arc-en-ciel, combos entre spéciaux.
- **Milo Blocks V2** : grille 8×8 de « gommes » pastel à symboles, plateau-coussin clair, animations de prise / pose / destruction, faisceaux sur les lignes, combos, Milo qui réagit sur le plateau, écran d'accueil, sons.
- **Milo Jump** : course infinie inspirée du Dino de Chrome. Touche pour sauter, maintiens pour sauter plus haut ; cactus, rochers, buissons, barrières en bois, pics et trous ; étoiles et bulle-pansement ; décor ciel, nuages, montagnes, collines et sol herbe / briques (jour / nuit tous les 700 points) ; classement des 10 meilleurs scores.
- **Course de Milo** (Jump et Dash) : `public/assets/games/jump/run.webp`, planche de 12 images (deux foulées) détourée depuis le visuel officiel, alignée sur le sol ; cadence calée sur la vitesse, rebond et étirement image par image, poussière aux appuis.
- **Sons** : synthétisés en Web Audio dans `milo-games.js` (`MiloGames.sfx`), aucun fichier audio, bouton muet mémorisé.
- **Milo Flap** : tapoter pour voler entre les poteaux. Partie infinie, vitesse et difficulté progressives, poteaux mobiles, cycle jour / coucher de soleil / nuit tous les 25 passages, médailles (10, 25, 50, 100), poteau doré au niveau du record. Rendu canvas 60 FPS.
- Sauvegarde automatique après chaque coup (niveau atteint, étoiles, records, statistiques, partie en cours).
- **Remplacer les visuels de Milo volant** : déposer les fichiers dans `public/assets/games/flap/` et ajuster la liste `SPRITES` en haut de `public/games/flap.js` (`ax` / `ay` = centre du corps dans l'image).
- **Milo Melon** : jeu de fusion (principe Suika). Physique maison (Verlet sous-échantillonné), fusions en chaîne avec multiplicateur, alerte de débordement, partie sauvegardée et reprise, statistiques (parties, fusions, plus grosse mascotte, top 10).
- **Mascottes de Milo Melon** : tout se règle dans `public/games/melon-data.js` (id, nom, taille, points, image, cercle du corps, poids d'apparition). Ajouter, retirer ou remplacer une mascotte ne demande aucune modification du moteur.
- **Milo Dash** : plateforme rythmique néon (principe auto-run). Touche pour sauter, maintiens pour enchaîner ; orbes de saut, trampolines, portails (vol, gravité inversée, vitesses), scies. 4 niveaux (Envol, Pulsar, Gravité, Hyperdrive) avec musique synthétisée en direct calée sur le tempo, progression en %, record par niveau, 3 étoiles par niveau (gardées seulement si le niveau est terminé), déblocage progressif des niveaux, 6 personnages (aura et traînée) à débloquer, mode entraînement avec points de contrôle. Simulation déterministe à 240 Hz : les appuis tactiles sont horodatés et appliqués au bon pas de simulation.
- **Personnages de Milo Dash** : 6 skins (Néon, Aurore, Glacier, Galaxie, Soleil, Prisme), chacun avec sa planche de course `public/assets/games/dash/skin_<id>.webp` (11 poses, même cadrage, échelle normalisée sur les yeux, rebond d'origine conservé) et sa traînée animée (3 rubans qui suivent la trajectoire, longueur liée à la vitesse, particules propres : éclairs, braises, flocons et cristaux, étoiles, éclats dorés, arc-en-ciel). Réglages dans `SKINS` en haut de `dash.js`.
- **Niveaux de Milo Dash** : `public/games/dash-levels.js`. Les objets se placent en temps musicaux (`B.spikes(t)` = « saute sur le temps t »). Après toute modification, valider avec le bot intégré : `MiloGames.byId.dash._debug.solve(MiloGames.byId.dash._debug.lvl(0))` doit renvoyer `ok: true` (le bot cherche une suite d'appuis qui termine le niveau).
- **Animation de course de Milo (Jump)** : planche de 8 images `public/assets/games/jump/run.webp` générée depuis le visuel officiel ; constante `SHEET` en haut de `jump.js`.
- **Changer les bonbons** : déposer les images dans `public/assets/games/` et modifier la liste `PIECES` en haut de `public/games/crush.js`.
- **Ajouter un jeu** : créer `public/games/mon-jeu.js` qui appelle `MiloGames.register({ id, name, logo, card(), mount(), unmount() })`, puis l'inclure dans `index.html`.


## Comptes et synchronisation (Supabase)

Connexion avec Google ou e-mail + mot de passe (Apple prévu, désactivé tant que `AUTH_APPLE` ≠ `1`). Toutes les données de l'app (traitements, prises, soins, profil, mémoire et conversations de Milo, progression des jeux) sont synchronisées par compte. Sans configuration, l'app reste 100 % locale.

Aucune clé dans le code : l'app lit sa configuration sur `/api/config`, qui renvoie les variables d'environnement Vercel.

### Mise en place (une seule fois)

1. **Créer le projet** sur supabase.com : *New project*, région **Europe (Paris ou Frankfurt)**.
2. **Créer la table** : *SQL Editor* → coller le contenu de `supabase/schema.sql` → *Run*. Les règles RLS garantissent que chacun ne lit que ses propres données.
3. **Adresses autorisées** : *Authentication → URL Configuration*
   - *Site URL* : l'adresse Vercel de Milo (ex. `https://milo-app.vercel.app`)
   - *Redirect URLs* : la même adresse + `/**`
4. **E-mail** : *Authentication → Providers → Email* activé (confirmation par e-mail conseillée). Les modèles d'e-mail peuvent être traduits en français dans *Authentication → Email Templates*.
5. **Google** :
   - console.cloud.google.com → *APIs & Services → Credentials → Create credentials → OAuth client ID* (type *Web application*)
   - *Authorized redirect URI* : `https://<projet>.supabase.co/auth/v1/callback` (affichée dans Supabase, *Providers → Google*)
   - copier le *Client ID* et le *Client secret* dans Supabase → *Providers → Google* → activer
6. **Vercel** : *Settings → Environment Variables*
   - `SUPABASE_URL` = *Project Settings → API → Project URL*
   - `SUPABASE_ANON_KEY` = *Project Settings → API → anon / publishable key*
   - puis *Redeploy*.
7. **Apple (plus tard)** : compte Apple Developer requis. Créer un *Services ID* + une clé *Sign in with Apple*, les renseigner dans Supabase → *Providers → Apple*, puis ajouter `AUTH_APPLE=1` dans Vercel.

### Fonctionnement de la synchronisation

- Chaque modification est envoyée au compte 1,5 s après la dernière action ; les données du compte sont relues à l'ouverture et au retour sur l'app.
- Première connexion sur un appareil qui a déjà des données différentes : l'utilisateur choisit lesquelles garder.
- Déconnexion : les données restent sur l'appareil. « Supprimer les données du compte » efface la ligne côté serveur.
