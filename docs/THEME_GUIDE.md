# Guide de Création de Thèmes StackPages CMS (Worker + HTMX)

Ce guide condense les meilleures pratiques et les pièges à éviter pour développer des thèmes frontend performants sur StackPages CMS, basé sur l'architecture Cloudflare Workers et HTMX.

## 1. Architecture & Philosophie

StackPages utilise une architecture **Server-Side Rendering (SSR) à la volée** via Cloudflare Workers.
- **Pas de base de données classique** : Les données viennent de flux RSS/JSON (Substack, YouTube) et sont mises en cache.
- **Single File Template** : Tout le thème (HTML, CSS, JS, Templates) réside dans un seul fichier HTML (ex: `moneyradar.html`).
- **HTMX pour la navigation** : Le site se comporte comme une SPA (Single Page App) sans la complexité de React/Vue.

---

## 2. Intégration HTMX : Les Règles d'Or

### Navigation & Remplacement
Utilisez `hx-get`, `hx-target` et `hx-push-url` pour la navigation standard.
```html
<a href="/contact" 
   hx-get="/contact" 
   hx-target="#main-content" 
   hx-push-url="true">
   Contact
</a>
```

### ⚠️ Piège #1 : L'Héritage de `hx-select`
**Problème rencontré** : Une carte d'article sur la page d'accueil affichait une page vide au clic.
**Cause** : La carte était dans un conteneur qui avait `hx-select="#publications-container"`. Au clic, le lien héritait de ce sélecteur, mais la page de destination (article) n'avait pas cet ID.
**Solution** : Toujours forcer le sélecteur sur les éléments cliquables qui changent de contexte.
```html
<!-- CORRECT -->
<a href="/post/slug" 
   hx-get="/post/slug" 
   hx-select="article"  <!-- Force la sélection du contenu article -->
   hx-swap="innerHTML show:window:top">
   Lire l'article
</a>
```

### ⚠️ Piège #2 : Le Titre de Page (OOB Swaps)
**Problème rencontré** : Le titre de la page d'accueil devenait "Publications" car un widget chargeait les derniers articles.
**Cause** : La réponse HTMX incluait une balise `<title hx-swap-oob="true">` qui écrasait le titre courant.
**Solution** : Côté Worker, conditionner l'envoi des métadonnées OOB.
```javascript
// _worker.js
const hxTarget = req.headers.get("HX-Target");
// Ne pas mettre à jour le titre si c'est juste un widget
if (hxTarget && hxTarget !== "main-content") return ""; 
```

### Chargement Dynamique & Scripts
Si vous injectez du HTML via JS (ex: bouton "Load More"), HTMX ne le voit pas automatiquement.
**Solution** : Utiliser `htmx.process()`.
```javascript
container.insertAdjacentHTML('beforeend', newContent);
htmx.process(container); // Active les attributs hx-* sur le nouveau contenu
```

---

## 3. Le Worker (Backend Logic)

Le fichier `_worker.js` est le cerveau. Il ne faut pas avoir peur de le modifier pour passer des données au template.

### Injection de Données
Le worker remplace des placeholders `{{key}}` dans votre template HTML.
**Best Practice** : Si vous ajoutez une fonctionnalité (ex: boutons de partage), passez les données nécessaires (ex: `currentUrl`) depuis le worker.

```javascript
// _worker.js
function generatePostContent(template, post, currentUrl) {
    return replacePlaceholders(template, {
        title: post.title,
        currentUrl: currentUrl // Nécessaire pour les boutons de partage
    });
}
```

### Pagination API
Pour le "Load More", ne renvoyez pas du HTML complet, mais du JSON ou un fragment HTML.
**Pattern recommandé** : API JSON + Rendu Client (plus flexible pour les thèmes).
1. Endpoint API : `/api/posts?offset=6&limit=6`
2. JS Client : Fetch JSON -> Generate HTML -> Insert -> `htmx.process()`

---

## 4. Styling & CSS

### Tailwind vs Vanilla
- **Tailwind** : Parfait pour la structure du layout (`grid`, `flex`, `padding`).
- **Vanilla CSS** : Indispensable pour le contenu dynamique (articles de blog) où vous ne contrôlez pas les classes HTML.

```css
/* Dans le <style> du template pour le contenu riche */
.article-content h2 { font-size: 1.5rem; font-weight: bold; color: white; }
.article-content p { color: #d1d5db; line-height: 1.6; }
.article-content a { color: #22d3ee; text-decoration: underline; }
```

### Gestion de l'État Actif (Menu)
HTMX ne recharge pas la page, donc les classes CSS "active" ne se mettent pas à jour seules.
**Solution** : Un petit script JS qui écoute `htmx:afterSettle`.

```javascript
document.body.addEventListener('htmx:afterSettle', () => {
    const path = window.location.pathname;
    // Mettre à jour les classes des liens du menu
});
```

---

## 5. Checklist pour un Nouveau Thème

1.  **Structure** : Créer les `<template id="tpl-name">` pour chaque vue (home, list, detail).
2.  **Navigation** : Vérifier que tous les liens internes ont `hx-get` et `hx-target="#main-content"`.
3.  **Isolation** : Vérifier que les widgets (sidebar, footer) n'écrasent pas l'état global (titre, meta) via OOB.
4.  **Robustesse** : Ajouter `hx-select` sur les cartes pour éviter les erreurs de contexte.
5.  **Scripts** : S'assurer que les scripts d'initialisation (sliders, menus) sont relancés après navigation (`htmx:afterSettle`).

En suivant ces principes, vous aurez un thème rapide, fluide et maintenable ! 🚀
