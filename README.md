# Milo — compagnon de convalescence

Application web installable (PWA) : traitements, soins, calendrier, progression, et Milo, un assistant qui répond à l'écrit et à voix haute.
**100 % gratuit** : hébergement Vercel (offre Hobby) + Google Gemini (offre gratuite) pour l'intelligence et la voix.

## Structure
```
public/          site statique (index.html + mascottes, icônes, manifeste PWA)
api/chat.js      relais vers Gemini (intelligence de Milo, avec outils)
api/tts.js       relais vers Gemini TTS (voix de Milo)
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
- **Quotas** : limités par minute et par jour (voir la page des quotas dans Google AI Studio). Si la limite est atteinte, Milo répond en mode simple et parle avec la voix du téléphone.
- **Usage** : l'offre gratuite convient à un usage personnel. Pour proposer l'app à d'autres personnes dans l'Union européenne, Google impose l'offre payante.

## Sans clé
Sans `GEMINI_API_KEY`, l'app fonctionne quand même : Milo répond avec ses réponses intégrées et parle avec la voix du téléphone.

## Variables optionnelles
| Variable | Défaut |
|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `GEMINI_TTS_MODEL` | `gemini-3.8-flash-tts` (ou `gemini-3.8-flash-lite-tts`, plus rapide) |
| `GEMINI_VOICE` | `Achird` (amical). Autres : `Puck` (enjoué), `Sulafat` (chaleureux), `Vindemiatrix` (doux) |
