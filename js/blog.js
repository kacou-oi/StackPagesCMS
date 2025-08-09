// blog.js

// Cette fonction est une copie exacte de la fonction slugify de notre Cloudflare Worker
function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .trim();
}

// Fonction pour formater la date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('fr-FR', options);
}

// Fonction asynchrone principale pour charger les articles
async function loadPosts() {
    const postList = document.getElementById('post-list');

    // Afficher un message de chargement
    postList.innerHTML = '<p class="text-center text-gray-500">Chargement des articles...</p>';

    try {
        // Fetch les articles depuis notre API endpoint
        const response = await fetch('/api/posts');
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        const posts = await response.json();

        // Si aucun article n'est trouvé
        if (posts.length === 0) {
            postList.innerHTML = '<p class="text-center text-gray-500">Aucun article trouvé.</p>';
            return;
        }

        // Nettoyer la liste
        postList.innerHTML = '';

        // Créer l'HTML pour chaque article
        posts.forEach(post => {
            const articleElement = document.createElement('article');
            articleElement.className = 'bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300';

            const formattedDate = formatDate(post.published);

            // Important: Le lien est généré ici en utilisant la même fonction slugify
            const postUrl = `/blog/${slugify(post.title)}`;

            const imageHtml = post.image ? 
                `<a href="${postUrl}" class="block mb-4"><img src="${post.image}" alt="${post.title}" class="w-full h-48 object-cover rounded-lg"></a>` : '';

            articleElement.innerHTML = `
                ${imageHtml}
                <div class="mb-2 text-sm text-gray-500">${formattedDate}</div>
                <h2 class="text-2xl font-semibold text-gray-900 mb-2">
                    <a href="${postUrl}" class="hover:text-blue-600 transition-colors duration-200">${post.title}</a>
                </h2>
                <p class="text-gray-700 mb-4">${post.summary}</p>
                <a href="${postUrl}" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200">
                    Lire l'article
                    <svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </a>
            `;
            postList.appendChild(articleElement);
        });

    } catch (error) {
        console.error("Erreur lors du chargement des articles:", error);
        postList.innerHTML = `<p class="text-center text-red-500">Une erreur est survenue lors du chargement des articles.</p>`;
    }
}

// Exécuter la fonction lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', loadPosts);
