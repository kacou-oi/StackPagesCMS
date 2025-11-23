# 1.2 Détail des Endpoints API

Le Cloudflare Worker expose trois endpoints JSON principaux pour la consommation par votre frontend Webstudio.

Tous les endpoints renvoient une réponse JSON et sont protégés par des en-têtes CORS pour être appelés depuis n'importe quel domaine.

### Endpoint /api/metadata

| Propriété | Description | Type |
| :--- | :--- | :--- |
| **Chemin :** | `/api/metadata` | |
| **Méthode :** | `GET` | |
| **Contenu :** | Informations globales sur le blog (Titre, URL, Description). |

### Endpoint /api/posts

| Propriété | Description | Type |
| :--- | :--- | :--- |
| **Chemin :** | `/api/posts` | |
| **Méthode :** | `GET` | |
| **Contenu :** | Tableau complet des articles. Utilisé par la **Collection** de Webstudio. |

### Endpoint /api/post/:slug

| Propriété | Description | Type |
| :--- | :--- | :--- |
| **Chemin :** | `/api/post/{slug-de-l-article}` | |
| **Méthode :** | `GET` | |
| **Contenu :** | Objet JSON unique de l'article, incluant le champ **`content`** (HTML nettoyé) et **`image`** (URL de l'image principale). |
| **Utilisation :** | Utilisé par la **Variable Resource** `SinglePostData` sur la page dynamique `/post/{slug}`. |
