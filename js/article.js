// Ce script gère l'affichage d'un article unique
document.addEventListener('DOMContentLoaded', async () => {
    // Sélectionne les éléments du DOM
    const postTitle = document.getElementById('post-title');
    const postDate = document.getElementById('post-date');
    const postContent = document.getElementById('post-content');
    const loadingIndicator = document.getElementById('loading-indicator');
    const pageTitle = document.getElementById('page-title');

    // Récupère le slug de l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');

    if (!slug) {
        // Si aucun slug n'est trouvé, on affiche un message d'erreur
        postContent.innerHTML = '<p class="text-center text-red-500 text-lg">Article non spécifié.</p>';
        loadingIndicator.style.display = 'none';
        return;
    }

    try {
        // Appelle l'API de notre Cloudflare Worker pour obtenir l'article spécifique
        const response = await fetch(`/api/post/${slug}`);
        if (!response.ok) {
            if (response.status === 404) {
                postContent.innerHTML = '<p class="text-center text-red-500 text-lg">Article non trouvé.</p>';
            } else {
                postContent.innerHTML = '<p class="text-center text-red-500 text-lg">Erreur lors de la récupération de l\'article.</p>';
            }
            loadingIndicator.style.display = 'none';
            return;
        }
        
        const post = await response.json();

        // Une fois les données reçues, on cache l'indicateur de chargement
        loadingIndicator.style.display = 'none';
        
        // Met à jour le contenu de la page avec les données de l'article
        pageTitle.textContent = `${post.title} - StackPages`;
        postTitle.textContent = post.title;
        
        // Formatte la date
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = new Date(post.pubDate).toLocaleDateString('fr-FR', dateOptions);
        postDate.textContent = `Publié le ${formattedDate}`;

        // Insère le contenu de l'article tel quel (il s'agit d'HTML)
        postContent.innerHTML = post.content;

    } catch (error) {
        console.error('Erreur lors du chargement de l\'article:', error);
        loadingIndicator.style.display = 'none';
        postContent.innerHTML = '<p class="text-center text-red-500 text-lg">Erreur lors du chargement de l\'article. Veuillez réessayer plus tard.</p>';
    }
});
