# 🚀 StackPages CMS

**StackPages CMS** est une solution ultra-légère et sans base de données, conçue pour transformer n'importe quel flux RSS (Substack, Medium, Ghost, etc.) en un site web complet, rapide et riche en données.

Il s'agit d'un système Headless (sans interface utilisateur) qui combine la puissance du réseau **Cloudflare** pour la vitesse des données avec la flexibilité d'un frontend No-Code comme **Webstudio**.

---

## ✨ Fonctionnalités Clés

* **Zéro Base de Données :** Utilise votre flux RSS comme source unique de vérité.
* **Performance Globale :** Basé sur un **Cloudflare Worker** avec un cache intelligent, assurant un temps de chargement des données minimal.
* **Routage Dynamique Fiable :** Supporte nativement les pages de détail d'article basées sur le *slug* (ex: `/post/nom-de-l-article`).
* **Nettoyage de Contenu Avancé :** Supprime les éléments UI (comme les visionneuses d'images Substack) des plateformes sources pour une intégration front-end propre.
* **API Propre :** Fournit des endpoints JSON dédiés pour la liste d'articles et le détail.

---

## 🛠️ Architecture du Système

Le système est décomposé en deux parties principales : la couche de données (le Worker) et la couche de présentation (Webstudio).



### 1. Le Cœur : Cloudflare Worker

Ce Worker, contenu dans `worker.js`, gère le parsing, le nettoyage et la mise en cache. Il expose les endpoints suivants :

| Endpoint | Méthode | Rôle |
| :--- | :--- | :--- |
| `/api/posts` | `GET` | Renvoie la liste de tous les articles, triée par date. |
| `/api/metadata` | `GET` | Renvoie les informations globales du blog (titre, description). |
| `/api/post/:slug` | `GET` | Renvoie le détail complet d'un article spécifique. |

### 2. Le Frontend : Webstudio

Le frontend No-Code (Webstudio) consomme les endpoints via des **Variables Resources** pour le design et la structure visuelle.

---

## 🚀 Guide de Déploiement

### Étape 1 : Déployer le Worker Cloudflare

1.  **Code Source :** Utilisez le code JavaScript fourni pour le fichier `worker.js`.
2.  **Déploiement :** Déployez le Worker via l'interface Cloudflare ou l'outil CLI **`wrangler`**.
3.  **Variable Secrète :** Définissez la variable d'environnement (Secret) suivante :
    * **`SUBSTACK_FEED_URL`**: L'URL complète de votre flux RSS (ex: `https://votre-blog.com/feed`).
4.  **Notez l'URL :** Récupérez l'URL du Worker déployé (ex: `https://stackcms.workers.dev`). Cette valeur sera votre variable `WorkerUrl`.

### Étape 2 : Configuration du Routage Dynamique dans Webstudio

#### A. Variables de Base

1.  **`WorkerUrl` (Variable Statique) :** Créez une variable de type **String** et collez l'URL de votre Worker.
2.  **`PostFeed` (Variable Resource) :** Liez son URL à l'expression : `WorkerUrl + "api/posts"`

#### B. Modèle de Page de Lecture (`/post/{slug}`)

1.  **Création du Modèle :** Créez une nouvelle page avec le chemin **/post/{slug}**.
2.  **Ressource de Détail :** Créez une **Variable Resource** nommée `SinglePostData` sur cette page :
    * **URL de la Ressource :** L'expression doit être : $$\text{WorkerUrl} + \text{"api/post/"} + \text{\$slug}$$

#### C. Liaisons de Contenu

1.  **Collection (Page d'accueil) :** Liez le bouton "Lire l'article" :
    * **Href :** $$\text{"/post/"} + \text{collectionItem.slug}$$
2.  **Page de Lecture :** Liez le contenu :
    * **Titre :** `SinglePostData.title`
    * **Contenu du Corps :** `SinglePostData.content` (avec l'option **Render as HTML** activée).

---

## 🤝 Contribution et Amélioration

Ce projet est **Open Source**. Toute contribution est la bienvenue pour améliorer le parsing des flux, le nettoyage du contenu, ou la compatibilité avec d'autres plateformes.

### Comment Contribuer :

1.  Faites un *fork* du projet.
2.  Créez une branche de fonctionnalité ou correction.
3.  Ouvrez une **Pull Request** vers la branche `main`.

---

## 📄 Fichiers du Projet

| Fichier | Description |
| :--- | :--- |
| `README.md` | Ce fichier. Guide d'installation et vue d'ensemble. |
| `worker.js` | Le code complet du Cloudflare Worker (parsing, cache, endpoints). |
| `LICENSE` | Le fichier de licence (MIT recommandé). |

---

## 📝 Licence

Ce projet est distribué sous la [Licence MIT](LICENSE).
