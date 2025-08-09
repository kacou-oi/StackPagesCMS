// Le fichier article.js devient obsolète car le rendu est maintenant fait par le Worker.
// Le contenu de l'article est directement injecté dans le HTML avant d'être envoyé au navigateur.
// Le code ci-dessous est un exemple de ce qui n'est plus nécessaire.

/*
// Exemple de l'ancienne logique CSR
document.addEventListener('DOMContentLoaded', async () => {
    // Le Worker gère maintenant le SSR, ce code n'est plus utile pour le rendu de l'article.
    // L'ajout de nouvelles fonctionnalités JavaScript pour l'article se fera ici.
});
*/

// Ce fichier peut maintenant être utilisé pour ajouter de l'interactivité post-chargement
// par exemple pour ajouter des commentaires, des interactions sociales, etc.
