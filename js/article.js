// js/article.js

// Le script s'exécute une fois que le DOM est complètement chargé
document.addEventListener('DOMContentLoaded', async () => {
    // Récupérer les éléments du DOM
    const articleContainer = document.getElementById('article-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const articleTitleTag = document.getElementById('article-title-tag');

    try {
        // Obtenir le "slug" de l'URL
        // On récupère le paramètre 'slug' de l'URL (e.g. ?slug=mon-super-article)
        const urlParams = new URLSearchParams(window.location.search);
        const slug = urlParams.get('slug');

        if (!slug) {
            throw new Error("Slug de l'article introuvable dans l'URL.");
        }

        // On fait une requête à l'API pour récupérer l'article spécifique
        const response = await fetch(`/api/post/${slug}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("Article introuvable. Veuillez vérifier l'URL.");
            }
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const article = await response.json();

        // On masque l'indicateur de chargement
        loadingIndicator.style.display = 'none';

        // On met à jour le titre de la page
        articleTitleTag.textContent = article.title;

        // On crée le contenu HTML de l'article
        articleContainer.innerHTML = `
            <h1 class="text-4xl font-bold text-gray-900 mb-4">${article.title}</h1>
            <p class="text-gray-500 text-sm mb-6">
                Par <span class="font-semibold">${article.author}</span> le ${new Date(article.published).toLocaleDateString('fr-FR')}
            </p>
            <div class="prose max-w-none">
                <p>${article.content.replace(/\n/g, '<br>')}</p>
            </div>
        `;

    } catch (error) {
        loadingIndicator.style.display = 'none';
        articleContainer.innerHTML = `<div class="text-center text-red-500 p-8">
            <p class="text-xl font-semibold mb-2">Erreur de chargement :</p>
            <p>${error.message}</p>
        </div>`;
        console.error('Erreur lors du chargement de l\'article:', error);
    }
});
