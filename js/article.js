// article.js

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

// Fonction asynchrone principale pour charger l'article
async function loadArticle() {
    const postTitle = document.getElementById('post-title');
    const postDate = document.getElementById('post-date');
    const postImage = document.getElementById('post-image');
    const postContent = document.getElementById('post-content');

    // Récupère le slug depuis l'URL actuelle
    const pathSegments = window.location.pathname.split('/');
    const slug = pathSegments[pathSegments.length - 1];

    if (!slug) {
        postContent.innerHTML = `<p class="text-center text-red-500">Erreur : Slug d'article non trouvé.</p>`;
        return;
    }

    try {
        // Fetch l'article unique depuis notre API endpoint
        const response = await fetch(`/api/post/${slug}`);
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        const post = await response.json();

        if (!post) {
            postContent.innerHTML = `<p class="text-center text-red-500">Article non trouvé.</p>`;
            return;
        }

        // Remplir les éléments de la page avec les données de l'article
        postTitle.textContent = post.title;
        postDate.textContent = formatDate(post.published);
        postContent.innerHTML = post.content; // Utilise innerHTML pour le contenu HTML
        
        // Afficher l'image si elle existe
        if (post.image) {
            postImage.innerHTML = `<img src="${post.image}" alt="${post.title}" class="w-full h-auto object-cover rounded-lg mb-6">`;
        } else {
            postImage.innerHTML = '';
        }

    } catch (error) {
        console.error("Erreur lors du chargement de l'article:", error);
        postContent.innerHTML = `<p class="text-center text-red-500">Une erreur est survenue lors du chargement de l'article.</p>`;
    }
}

// Exécuter la fonction lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', loadArticle);
