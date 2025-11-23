# 🚀 StackPages CMS v1.3

**Bienvenue dans la version Open Source de StackPages CMS !**

**StackPages CMS** est une solution ultra-légère et sans base de données, conçue pour transformer n'importe quel **flux RSS** (Substack, Medium, Ghost, etc.) en un site web complet, rapide et riche en données.

Ce projet s'adresse aux **développeurs** et aux utilisateurs ayant une expertise technique souhaitant déployer et maintenir leur propre API de données.

> 💡 **Utilisateur Non-Technique ?** Si vous recherchez la version "prête à l'emploi" sans configuration de Worker, veuillez vous diriger vers notre service hébergé sur [stackpages.net](https://stackpages.net).

---

## ✨ Fonctionnalités Clés

* **Zéro Base de Données :** Utilise votre flux RSS comme source unique de vérité.
* **Performance Globale :** Basé sur un **Cloudflare Worker** avec un cache intelligent, assurant un temps de chargement des données minimal.
* **Nettoyage de Contenu Avancé :** Supprime les éléments UI (comme les visionneuses d'images Substack) des plateformes sources pour une intégration front-end propre.
* **API Propre :** Fournit des endpoints JSON dédiés pour la liste d'articles et le détail.

---

## 🛠️ Prérequis et Technologies

Pour déployer et utiliser ce projet dans votre propre infrastructure, vous aurez besoin des éléments suivants :

| Composant | Rôle | Statut Requis |
| :--- | :--- | :--- |
| **Cloudflare Workers** | Héberge le moteur de l'API (Parsing et Cache). | **Obligatoire** |
| **Webstudio** | Utilisation de ses **Variables Resources** et du **Routage Dynamique** pour le Frontend. | **Obligatoire** (ou tout autre outil supportant les API REST) |
| **Un Flux RSS** | La source de données de votre contenu (ex: Substack, Ghost, etc.). | **Obligatoire** |

---

## ⚙️ Déploiement Rapide (Cloudflare Worker)

Le cœur de ce CMS est le code JavaScript de l'API. Pour commencer rapidement, cliquez sur le bouton ci-dessous pour ouvrir le fichier `worker.js` et copiez-le dans votre projet Cloudflare Worker.

[![Bouton pour ouvrir le fichier worker.js](https://img.shields.io/badge/Ouvrir_le_Code_du_Worker-262D34?style=for-the-badge&logo=github&logoColor=white)](https://cdn.jsdelivr.net/gh/kacou-oi/StackPagesCMS@main/_worker.js)


```html
// Worker Cloudflare (Méthode Pages/Domaine)

// L'URL pointe maintenant vers votre domaine géré par Cloudflare Pages.
const STACKPAGE_CDN = 'https://cdn.jsdelivr.net/gh/kacou-oi/StackPagesCMS@main/_worker.js;

try {
  importScripts(STACKPAGE_CDN);
} catch (error) {
  // ... gestion d'erreur ...
}

```

Ensuite, veuillez suivre le [Guide de Déploiement](docs/deploiement/README.md) pour définir votre variable d'environnement (`SUBSTACK_FEED_URL`) et connecter Webstudio.
---
## ⚙️ Déploiement Rapide (Cloudflare Worker)

Le cœur de ce CMS est le code JavaScript de l'API. Pour commencer rapidement, cliquez sur le bouton ci-dessous pour ouvrir le fichier `worker.js` et copiez-le dans votre projet Cloudflare Worker.

## 📄 Structure de la Documentation

Cette documentation vous guidera à travers la configuration complète du système.

* [1. Architecture et API](docs/architecture/README.md)
* [2. Guide de Déploiement](docs/deploiement/README.md)
* [3. Maintenance et Dépannage](docs/maintenance/README.md)
* [4. Licence et Contribution](LICENSE)

