# StackPages : Site web personnel et blog Substack propulsé par Cloudflare Pages

StackPages est un template de site web statique conçu pour les créateurs de contenu souhaitant avoir un site web simple et élégant avec un blog dynamique. Il est particulièrement adapté aux utilisateurs de **Substack**, car il se synchronise automatiquement avec leur flux RSS pour afficher les articles. L'ensemble est hébergé gratuitement sur **Cloudflare Pages**.

## Fonctionnalités

* **Intégration Substack :** Récupère et affiche automatiquement les articles de votre blog Substack via son flux RSS.

* **Hébergement gratuit et rapide :** Déploiement et hébergement sans frais sur Cloudflare Pages.

* **Design moderne et responsif :** Construit avec **Tailwind CSS** pour un affichage parfait sur tous les appareils.

* **Structure simple :** HTML, CSS et JavaScript pour une compréhension et une personnalisation faciles.

* **Déploiement automatique :** Une fois configuré, votre blog se met à jour à chaque fois que vous publiez un nouvel article sur Substack.

## Structure du projet

```
/
├── .gitignore
├── README.md
├── index.html          # Page d'accueil
├── guide.html          # Guide de démarrage
├── _worker.js          # Cloudflare Worker à la racine
├── css/
│   └── style.css       # Styles CSS partagés
├── js/
│   ├── blog.js         # Script pour la page de blog
│   ├── article.js         # Script pour la page de chaque article
│   └── utils.js        # Fonctions utilitaires pour charger les parties
├── partials/
│   ├── header.html     # Le header commun à toutes les pages
│   └── footer.html     # Le footer commun à toutes les pages
└── blog/
    ├── index.html      # Liste des articles du blog (Substack Blog)
    └── article.html    # Modèle pour un article unique
```

## Guide de démarrage

Suivez ces étapes pour lancer votre site web personnel et blog en un rien de temps.

### Gérer la Configuration

Ce projet inclut un petit panneau d'administration pour gérer les configurations du site sans avoir à modifier le code directement.

1.  Ouvrez le fichier `admin/index.html` dans votre navigateur.
2.  La page chargera la configuration actuelle depuis `config.json`.
3.  Modifiez les champs souhaités (URL des flux RSS, informations SEO, etc.).
4.  Cliquez sur "Générer et Télécharger config.json".
5.  Remplacez l'ancien `config.json` à la racine de votre projet par celui que vous venez de télécharger.
6.  Faites un `commit` et un `push` de vos changements sur GitHub. Cloudflare redéploiera automatiquement votre site avec la nouvelle configuration.

### Étape 1 : Clonez ce dépôt

Commencez par cloner ce projet sur votre machine ou via l'interface de GitHub.

```
git clone [https://github.com/kacou-oi/Demo-stackpages.git](https://github.com/kacou-oi/Demo-stackpages.git)
```

### Étape 2 : Créez le Cloudflare Worker

Le cœur de la synchronisation réside dans le Cloudflare Worker. Vous devez créer un Worker qui va récupérer le flux RSS de votre Substack.

*Placez le code de votre worker dans le fichier **`_worker.js`** à la racine de votre projet.*

### Étape 3 : Déploiement

Connectez-vous à votre tableau de bord Cloudflare et rendez-vous dans la section "Pages".

1.  Créez un nouveau projet.
2.  Connectez-vous à votre compte GitHub et sélectionnez le dépôt que vous venez de cloner.
3.  Pour la configuration de build, vous pouvez laisser les paramètres par défaut.
4.  Cliquez sur "Déployer le site".

La configuration des flux RSS se fait maintenant via le fichier `config.json` et le panneau d'administration.

Cloudflare détectera automatiquement votre code et déploiera le site. Chaque fois que vous ferez une modification sur votre Substack, le Cloudflare Worker rafraîchira le contenu de votre site.

## Licence

Ce projet est sous licence MIT.
