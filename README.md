# Milo — compagnon de convalescence

Application web installable (PWA) : traitements, soins, calendrier, progression, et Milo, un assistant de convalescence par chat qui se souvient de vos échanges.
**100 % gratuit** : hébergement Vercel (offre Hobby) + Google Gemini (offre gratuite).

## Structure
```
public/          site statique (index.html + mascottes, icônes, manifeste PWA)
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
