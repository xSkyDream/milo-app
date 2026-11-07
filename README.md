# Milo — compagnon de convalescence

Application web installable (PWA) : traitements, soins, calendrier, progression, et Milo, un assistant qui répond avec la voix **Marcel** (ElevenLabs).

## Structure
```
public/          site statique (index.html + mascottes, icônes, manifeste PWA)
api/chat.js      relais vers l'API Anthropic (intelligence de Milo)
api/tts.js       relais vers ElevenLabs (voix Marcel)
vercel.json      configuration Vercel
```
Les clés API restent côté serveur (variables d'environnement Vercel). Le navigateur n'y a jamais accès.

## Déployer sur Vercel
1. vercel.com → **Add New… → Project** → importer `xSkyDream/milo-app`.
2. Framework : **Other**. Ne rien changer d'autre (la config est dans `vercel.json`).
3. **Environment Variables** :
   - `ANTHROPIC_API_KEY` — console.anthropic.com → API Keys
   - `ELEVENLABS_API_KEY` — elevenlabs.io → API Keys (droit « Text to Speech » suffit)
4. **Deploy**. Chaque `git push` sur `main` redéploie automatiquement.

## Installer sur iPhone
Ouvrir l'adresse Vercel dans Safari → Partager → **Sur l'écran d'accueil**.

## Sécurité et coûts
- Les relais refusent les appels qui ne viennent pas du site lui-même.
- Fixe un plafond de dépense sur console.anthropic.com et un quota mensuel sur ElevenLabs.
- Les données de santé restent dans le navigateur (stockage local). Rien n'est envoyé ailleurs, sauf le texte des conversations, transmis à Anthropic pour la réponse et à ElevenLabs pour la voix.

## Variables optionnelles
| Variable | Défaut |
|---|---|
| `ELEVENLABS_VOICE_ID` | `kENkNtk0xyzG09WW40xE` (Marcel) |
| `ELEVENLABS_MODEL` | `eleven_flash_v2_5` |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` |
