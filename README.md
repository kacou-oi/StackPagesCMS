# StackPages CMS : Le CMS Jamstack pour les Créateurs de Contenu Modernes

**StackPages CMS** est un CMS (Content Management System) basé sur l'architecture Jamstack, conçu pour permettre aux créateurs de contenu de construire un site vitrine élégant et complet avec des fonctionnalités dynamiques, sans la complexité d'un backend traditionnel.

Propulsé par l'écosystème serverless de **Cloudflare**, StackPages offre la vitesse et la sécurité d'un site statique avec la puissance de fonctionnalités dynamiques gérées par un worker intelligent.

## Fonctionnalités Clés

*   **Architecture Jamstack Puissante :** Profitez d'un site pré-rendu ultra-rapide, sécurisé et scalable, servi depuis le réseau global de Cloudflare.
*   **Contenu Dynamique "Headless" :**
    *   **Blog :** Synchronisez automatiquement les articles de votre blog **Substack**.
    *   **Vidéos :** Affichez les dernières vidéos de votre **chaîne YouTube**.
    *   Le contenu est récupéré via des flux RSS et servi par une API interne, vous donnant un contrôle total sur la présentation.
*   **Formulaires Dynamiques Intégrés :** Le formulaire de contact est géré par le worker Cloudflare, vous permettant de recevoir des soumissions sans backend. Le worker peut être facilement étendu pour envoyer des e-mails ou notifier d'autres services.
*   **Panneau d'Administration Intuitif :**
    *   Gérez les configurations de votre site (URL des flux, SEO, etc.) via une interface simple et protégée par mot de passe.
    *   **Mode de Stockage Hybride :**
        *   **Mode Fichier (par défaut) :** Simple et rapide à déployer.
        *   **Mode KV (optionnel) :** Activez les mises à jour de configuration instantanées en liant un Namespace Cloudflare KV.
*   **Design Moderne et Responsif :** Construit avec **Tailwind CSS** pour une apparence professionnelle et une adaptation parfaite à tous les appareils.
*   **Hébergement Gratuit et Déploiement Continu :** Déployez et hébergez votre site gratuitement sur **Cloudflare Pages**, avec des mises à jour automatiques à chaque `git push`.

## Guide de Démarrage

### Gérer la Configuration

Ce projet utilise un système de configuration hybride. Par défaut, il lit un fichier `config.json`, mais il peut être mis à niveau pour utiliser Cloudflare KV pour des mises à jour instantanées.

**Sécurisation :**
L'accès à l'administration est protégé par un mot de passe. Allez dans les paramètres de votre projet sur Cloudflare Pages > "Environment Variables" et ajoutez :
*   **Nom :** `ADMIN_PASSWORD`
*   **Valeur :** `votre_mot_de_passe_secret`

---

#### Mode 1 : Fichier `config.json` (par défaut)

Ce mode est activé par défaut et ne nécessite aucune configuration supplémentaire.

1.  Rendez-vous sur `/admin/` sur votre site et connectez-vous.
2.  Le panneau chargera la configuration depuis le fichier `config.json` du projet.
3.  Après modification, cliquez sur "Générer et Télécharger config.json".
4.  Remplacez l'ancien `config.json` à la racine de votre projet par le nouveau.
5.  Faites un `commit` et un `push` sur GitHub pour que Cloudflare redéploie le site avec la nouvelle configuration.

---

#### Mode 2 : Cloudflare KV (Optionnel, pour mises à jour instantanées)

Pour activer ce mode, vous devez lier un Namespace KV à votre projet.

1.  **Créez un Namespace KV :** Dans votre tableau de bord Cloudflare, allez dans "Workers & Pages" > "KV" et créez un nouveau namespace. Nommez-le `stackpages_config`.
2.  **Liez le Namespace à votre projet :**
    *   Allez dans les paramètres de votre projet Cloudflare Pages.
    *   Allez dans "Functions" > "KV namespace bindings".
    *   Cliquez sur "Add binding".
    *   **Variable name :** `CONFIG_KV`
    *   **KV namespace :** Sélectionnez le namespace `stackpages_config` que vous venez de créer.
    *   Sauvegardez et redéployez votre projet.
3.  **Utilisation :**
    *   Retournez sur la page `/admin/`. Elle détectera automatiquement le mode KV.
    *   Lorsque vous cliquerez sur "Sauvegarder", les modifications seront appliquées instantanément, sans avoir besoin de `git push`.

### Déploiement (Processus 100% en Ligne)

1.  **Forkez le Dépôt :** Cliquez sur le bouton "Use this template" > "Create a new repository" en haut de la page GitHub pour créer votre propre copie du projet.
2.  **Déployez sur Cloudflare :**
    *   Connectez-vous à votre tableau de bord Cloudflare.
    *   Allez dans `Workers & Pages` > `Créer une application` > `Pages` > `Connecter à Git`.
    *   Sélectionnez le dépôt que vous venez de créer.
    *   Ajoutez la variable d'environnement `ADMIN_PASSWORD` pour sécuriser votre panneau d'administration.
    *   Cliquez sur "Enregistrer et Déployer".
3.  **Configurez :** Une fois le site déployé, allez sur `https://votre-site.pages.dev/admin` pour configurer vos flux et paramètres.

## Licence

Ce projet est sous licence MIT.
