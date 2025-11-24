# StackPages Portal

Un CMS léger et performant propulsé par **Cloudflare Workers**, conçu pour transformer votre newsletter Substack en un site web dynamique avec une interface d'administration moderne.

## 🚀 Fonctionnalités

*   **Synchronisation Substack** : Récupère et met en cache automatiquement vos articles via RSS.
*   **API JSON** : Expose vos données via des endpoints rapides (`/api/posts`, `/api/metadata`).
*   **Interface Admin** : Tableau de bord moderne pour visualiser vos stats et gérer la configuration.
*   **Authentification** : Système de login sécurisé pour protéger l'admin.
*   **Configuration Dynamique** : Modifiez le titre, l'auteur et le SEO sans redéployer (via Cloudflare KV).

---

## 🛠️ Prérequis

*   Un compte [Cloudflare](https://dash.cloudflare.com/).
*   [Node.js](https://nodejs.org/) et `npm` installés.
*   [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installé globalement :
    ```bash
    npm install -g wrangler
    ```

---

## ⚙️ Configuration Rapide

### 1. Variables d'Environnement
Ce projet nécessite certaines variables pour fonctionner.

*   **En Local** : Créez un fichier `.dev.vars` à la racine du projet :
    ```env
    SUBSTACK_FEED_URL="https://votre-substack.substack.com/feed"
    ADMIN_PASSWORD="votre-mot-de-passe-securise"
    ```

*   **En Production (Cloudflare Dashboard)** :
    Allez dans **Settings > Variables and Secrets** de votre projet Workers/Pages et ajoutez les mêmes variables.

### 2. Base de Données (KV Namespace)
Pour sauvegarder la configuration (Titre du site, SEO...) depuis l'admin, vous devez créer un KV Namespace.

1.  Créez le namespace :
    ```bash
    npx wrangler kv:namespace create "STACKPAGES_CONFIG"
    ```
2.  Copiez l'ID retourné et ajoutez-le à votre `wrangler.toml` (si vous en avez un) ou liez-le via le dashboard Cloudflare dans **Settings > Functions > KV Namespace Bindings**.
    *   **Variable Name** : `STACKPAGES_CONFIG`
    *   **KV Namespace** : Sélectionnez celui que vous venez de créer.

---

## 🏃‍♂️ Démarrage Local

Pour lancer le projet sur votre machine :

```bash
npx wrangler dev
```

Accédez ensuite à :
*   **Site** : `http://localhost:8787` (Si vous avez un frontend)
*   **Admin** : `http://localhost:8787/admin/index.html`
*   **API** : `http://localhost:8787/api/posts`

---

## 📦 Déploiement

Déployez votre projet sur le réseau mondial de Cloudflare :

```bash
npx wrangler deploy
```

---

## 🖥️ Guide de l'Interface Admin

1.  **Connexion** : Accédez à `/admin/index.html`. Entrez le mot de passe défini dans `ADMIN_PASSWORD`.
2.  **Tableau de Bord** : Visualisez le nombre d'articles et la dernière mise à jour.
3.  **Articles** : Parcourez vos articles, recherchez par titre et prévisualisez le contenu.
4.  **Configuration** :
    *   Allez dans l'onglet **Configuration**.
    *   Modifiez le nom du site, l'auteur, ou les métadonnées SEO.
    *   Cliquez sur **Sauvegarder**. Les changements sont immédiats via l'API.
5.  **API Explorer** : Testez les routes API directement depuis l'interface pour vérifier les données brutes.

---

## 🔒 Sécurité

*   L'interface admin est protégée par un cookie de session (`HttpOnly`).
*   Assurez-vous de définir un mot de passe fort pour `ADMIN_PASSWORD` en production.
*   Le code source du Worker (`_worker.js`) contient la logique de validation.

---

**Auteur** : Kacou Oi
**Licence** : MIT
