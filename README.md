# StackPages

StackPages est un starter kit pour créer un site personnel statique hébergé sur **Cloudflare Pages**, avec un blog dynamique alimenté par un flux RSS **Substack** via un Worker Cloudflare.

## Structure

- `index.html` → page d'accueil
- `contact.html` → page de contact
- `posts/index.html` → liste des articles
- `posts/article.html` → modèle d'article
- `_worker.js` → Worker Cloudflare pour exposer l'API RSS
- `README.md` → documentation

## Déploiement

1. **Cloner le dépôt** dans votre GitHub
2. Connecter votre dépôt à **Cloudflare Pages**
3. Dans **Pages > Settings > Environment Variables**, ajouter :
   - Nom : `FEED_URL`
   - Valeur : URL du flux RSS Substack (`https://votresubstack.substack.com/feed`)
4. Déployer.

Le blog s'alimentera automatiquement à partir de votre Substack.
