// Ce script gère l'affichage de la liste des articles du blog
document.addEventListener('DOMContentLoaded', async () => {
    // Sélectionne les éléments du DOM
    const postsContainer = document.getElementById('posts-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    try {
        // Appelle l'API de notre Cloudflare Worker pour obtenir tous les articles
        const response = await fetch('/api/posts');
        const posts = await response.json();

        // Une fois les données reçues, on cache l'indicateur de chargement
        loadingIndicator.style.display = 'none';

        // S'il n'y a pas d'articles, on affiche un message
        if (posts.length === 0) {
            postsContainer.innerHTML = '<p class="text-center text-gray-500 text-lg">Aucun article trouvé pour le moment.</p>';
            return;
        }

        // On génère une carte HTML pour chaque article
        posts.forEach(post => {
            const postCard = document.createElement('a');
            // Le lien utilise le slug pour pointer vers la page de l'article
            postCard.href = `/blog/article.html?slug=${post.slug}`;
            postCard.className = 'block bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 overflow-hidden';
            
            // On s'assure que la description est un texte simple pour l'aperçu
            const snippet = post.description.replace(/(<([^>]+)>)/gi, "").substring(0, 150) + '...';

            postCard.innerHTML = `
                ${post.image ? `<img src="${post.image}" alt="${post.title}" class="w-full h-48 object-cover">` : ''}
                <div class="p-6">
                    <h2 class="text-xl font-bold mb-2">${post.title}</h2>
                    <p class="text-gray-600 text-sm mb-4">${snippet}</p>
                    <span class="text-orange-500 font-semibold">Lire la suite <i class="fas fa-arrow-right ml-1"></i></span>
                </div>
            `;
            postsContainer.appendChild(postCard);
        });

    } catch (error) {
        console.error('Erreur lors du chargement des articles:', error);
        loadingIndicator.style.display = 'none';
        postsContainer.innerHTML = '<p class="text-center text-red-500 text-lg">Erreur lors du chargement des articles. Veuillez réessayer plus tard.</p>';
    }
});
