# 2.1 Configuration du Worker Cloudflare

Cette étape consiste à déployer le code du Worker et à lui fournir l'URL de votre flux RSS via une variable d'environnement sécurisée.

### A. Déploiement du Code

1.  **Créer un Worker :** Dans votre tableau de bord Cloudflare, créez un nouveau service Worker.
2.  **Coller le Code :** Copiez l'intégralité du contenu du fichier `worker.js` dans l'éditeur de code de votre Worker.
3.  **Déployer :** Publiez le Worker.

### B. Définition de la Variable d'Environnement

Le Worker a besoin de connaître l'adresse de votre flux RSS.

1.  **Accéder aux Paramètres :** Rendez-vous dans les paramètres (Settings) de votre Worker.
2.  **Variables d'Environnement :** Dans la section **Variables d'environnement** (ou Secrets), ajoutez :
    * **Nom :** `SUBSTACK_FEED_URL`
    * **Valeur :** L'URL complète de votre flux (ex: `https://mon-blog.com/feed`).
3.  **Sauvegarder et Déployer :** Enregistrez les changements.

### C. Récupération de l'URL de l'API

Une fois le Worker déployé, notez son URL (ex: `https://stackcms.workers.dev`). Cette URL sera utilisée dans Webstudio comme base de toutes vos Variables Resources.
