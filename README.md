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
│   ├── post.js         # Script pour la page de chaque article
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

### Étape 1 : Clonez ce dépôt

Commencez par cloner ce projet sur votre machine ou via l'interface de GitHub.

```
git clone [https://github.com/kacou-oi/Demo-stackpages.git](https://github.com/kacou-oi/Demo-stackpages.git)
```

### Étape 2 : Créez le Cloudflare Worker

Le cœur de la synchronisation réside dans le Cloudflare Worker. Vous devez créer un Worker qui va récupérer le flux RSS de votre Substack.

*Placez le code de votre worker dans le fichier **`_worker.js`** à la racine de votre projet.*

### Étape 3 : Configurez votre variable d'environnement

Connectez-vous à votre tableau de bord Cloudflare et rendez-vous dans la section "Pages".

1.  Créez un nouveau projet.

2.  Connectez-vous à votre compte GitHub et sélectionnez le dépôt que vous venez de cloner.

3.  Dans les **"Variables d'environnement"**, ajoutez une nouvelle variable :

    * **Nom :** `FEED_URL`

    * **Valeur :** L'URL de votre flux RSS Substack (ex : `https://votrenom.substack.com/feed`).

### Étape 4 : Déploiement

Cloudflare détectera automatiquement votre code et déploiera le site. Chaque fois que vous ferez une modification sur votre Substack, le Cloudflare Worker rafraîchira le contenu de votre site.

## Licence

Ce projet est sous licence MIT.
