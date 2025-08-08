// On s'assure que le script s'exécute après le chargement complet du DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Récupérer le paramètre 'id' de l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');

    const loadingIndicator = document.getElementById('loading-indicator');
    const postTitle = document.getElementById('post-title');
    const postDate = document.getElementById('post-date');
    const postContent = document.getElementById('post-content');

    if (!postId) {
        // Si aucun ID n'est fourni, on affiche un message d'erreur
        postContent.innerHTML = '<p class="text-center text-red-500">Erreur : Aucun article spécifié.</p>';
        return;
    }

    try {
        // L'URL du Cloudflare Worker pour récupérer le flux RSS complet
        const workerUrl = '/cf-worker/worker.js';

        // Afficher l'indicateur de chargement
        loadingIndicator.classList.remove('hidden');

        const response = await fetch(workerUrl);
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // Trouver l'article correspondant à l'ID
        const item = Array.from(xmlDoc.querySelectorAll('item')).find(
            item => item.querySelector('guid')?.textContent === postId
        );

        if (item) {
            // On masque l'indicateur de chargement
            loadingIndicator.classList.add('hidden');
            
            // On extrait les informations de l'article
            const title = item.querySelector('title')?.textContent;
            const description = item.querySelector('description')?.textContent;
            const pubDate = item.querySelector('pubDate')?.textContent;
            const author = item.querySelector('author')?.textContent || 'Kacou Oi';

            // Mettre à jour le titre de la page
            document.title = `${title} - StackPages`;
            
            // Remplir les éléments de la page avec les données de l'article
            postTitle.textContent = title;
            postDate.innerHTML = `Publié le ${new Date(pubDate).toLocaleDateString('fr-FR', {
                year: 'numeric', month: 'long', day: 'numeric'
            })} par ${author}`;
            postContent.innerHTML = description; // On utilise innerHTML car le contenu est en HTML
        } else {
            loadingIndicator.classList.add('hidden');
            postContent.innerHTML = '<p class="text-center text-red-500">Article non trouvé.</p>';
        }

    } catch (error) {
        console.error("Erreur lors de la récupération de l'article:", error);
        loadingIndicator.classList.add('hidden');
        postContent.innerHTML = '<p class="text-center text-red-500">Impossible de charger l\'article.</p>';
    }
});
