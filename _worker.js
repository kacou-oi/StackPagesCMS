// Fichier: _worker.js
// Ce fichier est le point d'entrée de votre application Cloudflare Pages.
// Son seul rôle est d'importer la logique du backend et de gérer les requêtes.

import { createRouter } from 'itty-router';
import { handleRequest } from './backend/index.js';

// Initialiser le routeur itty-router
const router = createRouter();

// Gérer toutes les requêtes en utilisant la logique de notre backend
// Le Worker agira comme un proxy pour les fichiers statiques si aucune route n'est trouvée.
router.all('*', handleRequest);

export default {
  fetch: router.handle
};
```javascript
// Fichier: backend/index.js
// Ce fichier contient toute la logique de routage de votre application.
// Il gère les routes dynamiques et s'assure que les fichiers statiques sont servis comme prévu.

import { createRouter } from 'itty-router';

// Les données des articles (généralement récupérées depuis une API ou une base de données)
const posts = [
  // ... vos données d'articles ici ...
  { slug: 'mon-premier-article', title: 'Mon premier article', content: 'Le contenu de mon premier article...' },
  { slug: 'un-autre-article', title: 'Un autre article', content: 'Le contenu d\'un autre article...' }
];

const router = createRouter();

// Route pour l'API qui renvoie tous les articles
router.get('/api/posts', () => {
  return new Response(JSON.stringify(posts), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// Route dynamique pour les articles de blog
router.get('/blog/:slug', ({ params }) => {
  const post = posts.find(p => p.slug === params.slug);
  if (!post) {
    // Si l'article n'est pas trouvé, renvoyer une erreur 404
    return new Response('404 Not Found', { status: 404 });
  }

  // Rendu HTML pour l'article
  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>${post.title}</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <div class="container">
        <h1>${post.title}</h1>
        <p>${post.content}</p>
        <a href="/">Retour à la page d'accueil</a>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
});

// Route pour gérer la soumission du formulaire de contact
router.post('/api/contact', async (request) => {
  try {
    const formData = await request.formData();
    // Ici, vous pouvez traiter les données du formulaire
    // Par exemple, les envoyer à un service externe ou à une base de données
    console.log('Formulaire de contact soumis:', {
      name: formData.get('name'),
      email: formData.get('email'),
      message: formData.get('message')
    });
    return new Response('Formulaire soumis avec succès!', { status: 200 });
  } catch (error) {
    return new Response('Erreur lors de la soumission du formulaire', { status: 500 });
  }
});

// Gérer les requêtes non mises en correspondance (fallback)
// Cloudflare Pages va automatiquement servir le contenu statique
// de votre dossier `frontend/` pour toutes les requêtes qui ne correspondent
// pas à une route ici. C'est le comportement par défaut.
router.all('*', (request) => {
    // Cela ne sera appelé que si aucune route n'est mise en correspondance ci-dessus.
    // Dans le cas de Cloudflare Pages, il sert les fichiers statiques de votre dossier frontend/.
    // Vous n'avez pas besoin d'un code spécifique ici, le comportement est automatique.
});

// Exportez la fonction de gestion des requêtes
export async function handleRequest(request, env, ctx) {
  return router.handle(request, env, ctx);
}
