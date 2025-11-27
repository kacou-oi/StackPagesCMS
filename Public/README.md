# StackPages Public API - Mode d'emploi

Ce dossier contient la version **Public** de StackPages, conçue pour être utilisée comme **API Headless** avec des builders visuels comme **Webstudio**.

## 📁 Contenu

- `admin/` - Interface d'administration (pour référence, non servie par le worker)
- `core/` - Scripts JavaScript (pour référence, non servis par le worker)
- `index.html` - Page d'accueil (pour référence, non servie par le worker)
- `public-worker.js` - **Worker Cloudflare API-Only** avec support multi-tenant

## 🚀 Différence avec la version Root

| Aspect | Version Root (Self-Hosted) | Version Public (Headless) |
|--------|---------------------------|----------------|
| **Worker** | `_worker.js` - Config via Env Vars + Proxy + Static Files | `public-worker.js` - **API ONLY** via Query Params |
| **Déploiement** | Un worker par client | Un worker pour tous les clients |
| **Frontend** | Hébergé avec le worker | **Déployé sur Webstudio/autre** |
| **Configuration** | `wrangler.toml` | Query Parameters dans les appels API |
| **Mode** | Full-Stack (Frontend + API + Proxy) | **Headless API uniquement** |

## ⚙️ Architecture

```
┌─────────────────┐
│   Webstudio     │  ← Le site public est créé visuellement ici
│  (Frontend)     │
└────────┬────────┘
         │
         │ API calls avec query params
         │ ?substack_url=...&youtube_url=...
         ▼
┌─────────────────┐
│ public-worker.js│  ← Worker Cloudflare (API uniquement)
│   (Headless)    │
└─────────────────┘
```

## 🔧 Configuration

### 1. Déployer le Worker API

```bash
# Depuis le dossier Public/
wrangler deploy public-worker.js
```

Le worker sera accessible sur : `https://votre-worker.workers.dev`

### 2. Créer le site sur Webstudio

1. Aller sur [Webstudio.is](https://webstudio.is)
2. Créer un nouveau projet
3. Utiliser les **CMS Collections** pour afficher vos contenus
4. Configurer les appels API avec vos flux RSS :

```javascript
// Exemple d'appel API depuis Webstudio
fetch('https://votre-worker.workers.dev/api/posts?substack_url=https://votre-blog.substack.com/feed')
```

### 3. Exemples d'appels API

```bash
# Récupérer les articles
GET /api/posts?substack_url=https://votre-compte.substack.com/feed

# Récupérer les vidéos
GET /api/videos?youtube_url=https://www.youtube.com/feeds/videos.xml?channel_id=UC...

# Récupérer les podcasts
GET /api/podcasts?podcast_url=https://anchor.fm/s/podcast-id/podcast/rss

# Récupérer toutes les métadonnées
GET /api/metadata?substack_url=...&youtube_url=...&podcast_url=...
```

## 🔒 Sécurité

- Le Worker **ne sert PAS** de fichiers statiques
- Le Worker **n'a PAS** de reverse proxy
- C'est une API pure et sécurisée
- Chaque client envoie ses propres URLs RSS via query parameters

## 📝 Routes API Disponibles

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/metadata` | GET | Métadonnées générales |
| `/api/posts` | GET | Liste des articles |
| `/api/post/:slug` | GET | Article individuel |
| `/api/videos` | GET | Liste des vidéos |
| `/api/video/:id` | GET | Vidéo individuelle |
| `/api/podcasts` | GET | Liste des podcasts |
| `/api/podcast/:id` | GET | Podcast individuel |
| `/api/config` | GET | Config (protégé) |
| `/api/clear-cache` | POST | Vider le cache (protégé) |

## ⚠️ Important

- Ce worker est **100% headless** (pas de HTML/CSS/JS servi)
- Le frontend doit être déployé ailleurs (Webstudio recommandé)
- Les fichiers `admin/`, `core/`, `index.html` sont là pour **référence uniquement**

