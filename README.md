# StackPages Portal (SaaS Edition)

StackPages est un CMS "headless" et un agrégateur de contenus (RSS, YouTube, Podcast) conçu pour être déployé sur **Cloudflare Workers**.
Cette version "SaaS" inclut une gestion des utilisateurs via **Google OAuth** et une base de données **Cloudflare D1**.

## Prérequis

-   Un compte [Cloudflare](https://dash.cloudflare.com/)
-   [Node.js](https://nodejs.org/) et npm installés
-   [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installé (`npm install -g wrangler`)
-   Un projet [Google Cloud](https://console.cloud.google.com/) pour l'authentification OAuth

## Installation & Configuration

### 1. Cloner le projet

```bash
git clone https://github.com/votre-repo/stackpages-portal.git
cd stackpages-portal
npm install
```

### 2. Configurer la Base de Données (Cloudflare D1)

Créez une base de données D1 pour stocker les utilisateurs :

```bash
wrangler d1 create stackpages-users
```

Copiez l'`database_id` retourné par cette commande et collez-le dans votre fichier `wrangler.toml` :

```toml
[[d1_databases]]
binding = "DB"
database_name = "stackpages-users"
database_id = "VOTRE_ID_ICI"
```

Appliquez la migration pour créer la table des utilisateurs :

```bash
wrangler d1 migrations apply stackpages-users --local
```
*(Pour la production, retirez `--local`)*

### 3. Configurer l'Authentification Google (OAuth 2.0)

1.  Allez sur la [Google Cloud Console](https://console.cloud.google.com/).
2.  Créez un nouveau projet.
3.  Allez dans **APIs & Services > Credentials**.
4.  Créez un **OAuth Client ID** (Type: Web Application).
5.  Ajoutez l'URI de redirection autorisée :
    *   Local : `http://localhost:8787/auth/callback`
    *   Prod : `https://votre-worker.workers.dev/auth/callback`
6.  Copiez le `Client ID` et le `Client Secret`.

Ajoutez le `Client ID` dans `wrangler.toml` :

```toml
[vars]
GOOGLE_CLIENT_ID = "votre-client-id.apps.googleusercontent.com"
```

Ajoutez le `Client Secret` de manière sécurisée via Wrangler :

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
# Collez votre secret quand demandé
```

### 4. Configuration Générale (`wrangler.toml`)

Renommez `draft-wrangler.toml` en `wrangler.toml` si ce n'est pas déjà fait, et configurez vos variables :

```toml
[vars]
# URLs de vos flux
SUBSTACK_FEED_URL = "https://votre-substack.com/feed"
YOUTUBE_FEED_URL = "..."

# Admin Legacy (Secours)
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "..."
```

### 5. Lancement Local

Pour tester en local avec la base de données D1 locale :

```bash
npm start
# ou
wrangler dev
```

Accédez à `http://localhost:8787`.

### 6. Déploiement

Pour déployer sur Cloudflare Workers :

1.  Appliquez les migrations D1 en production :
    ```bash
    wrangler d1 migrations apply stackpages-users
    ```
2.  Publiez le worker :
    ```bash
    npm run deploy
    # ou
    wrangler deploy
    ```

## Architecture

-   **`/admin`** : Dashboard Super-Admin (gestion globale).
-   **`/app`** : Dashboard Utilisateur (gestion des pages perso).
-   **`/auth/*`** : Routes d'authentification (Google OAuth).
-   **`_worker.js`** : Backend (API, Auth, SSR).
-   **`migrations/`** : Schémas SQL pour D1.

## Développement

-   **Frontend** : HTML/Tailwind (fichiers dans `admin/`, `app/`, `core/`).
-   **Backend** : Cloudflare Worker (`_worker.js`).
