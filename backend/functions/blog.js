// Ce script se charge de récupérer et d'afficher la liste des articles
document.addEventListener('DOMContentLoaded', async () => {
    const postsContainer = document.getElementById('posts-container');
    
    // Fonction pour créer une carte d'article
    function createPostCard(post) {
        // Crée une carte d'article avec un lien vers la page de l'article en SSR
        const articleHtml = `
            <div class="bg-white rounded-lg shadow-lg overflow-hidden transform transition duration-300 hover:scale-105 hover:shadow-2xl">
                ${post.image ? `<img src="${post.image}" alt="${post.title}" class="w-full h-48 object-cover">` : ''}
                <div class="p-6">
                    <h2 class="text-xl font-bold text-gray-900 mb-2">${post.title}</h2>
                    <p class="text-gray-600 text-sm mb-4">Publié le ${new Date(post.pubDate).toLocaleDateString()}</p>
                    <p class="text-gray-700 text-base mb-4">${post.description}</p>
                    <a href="/blog/${post.slug}" class="text-orange-500 hover:text-orange-600 font-semibold transition duration-300">
                        Lire la suite →
                    </a>
                </div>
            </div>
        `;
        return articleHtml;
    }

    try {
        // Appel à l'API pour récupérer les articles
        const response = await fetch('/api/posts');
        const posts = await response.json();

        if (posts.length > 0) {
            // Création et ajout des cartes d'articles au conteneur
            posts.forEach(post => {
                postsContainer.innerHTML += createPostCard(post);
            });
        } else {
            postsContainer.innerHTML = '<p class="text-center text-gray-500 col-span-full">Aucun article n\'a été trouvé.</p>';
        }
    } catch (error) {
        console.error('Erreur lors du chargement des articles:', error);
        postsContainer.innerHTML = '<p class="text-center text-red-500 col-span-full">Une erreur est survenue lors du chargement des articles.</p>';
    }
});
