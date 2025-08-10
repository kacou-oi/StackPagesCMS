// Ce script gère l'affichage d'une vidéo unique
document.addEventListener('DOMContentLoaded', async () => {
    // Sélectionne les éléments du DOM
    const videoContainer = document.getElementById('video-container');
    const playerEmbed = document.getElementById('player-embed');
    const videoTitle = document.getElementById('video-title');
    const videoDate = document.getElementById('video-date');
    const videoDescription = document.getElementById('video-description');
    const loadingIndicator = document.getElementById('loading-indicator');
    const pageTitle = document.getElementById('page-title');

    // Récupère l'ID de la vidéo de l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('id');

    if (!videoId) {
        // Si aucun ID n'est trouvé, on affiche un message d'erreur
        videoDescription.innerHTML = '<p class="text-center text-red-500 text-lg">Vidéo non spécifiée.</p>';
        loadingIndicator.style.display = 'none';
        return;
    }

    try {
        // Appelle l'API de notre Cloudflare Worker pour obtenir la vidéo spécifique
        const response = await fetch(`/api/video/${videoId}`);
        if (!response.ok) {
            if (response.status === 404) {
                videoDescription.innerHTML = '<p class="text-center text-red-500 text-lg">Vidéo non trouvée.</p>';
            } else {
                videoDescription.innerHTML = '<p class="text-center text-red-500 text-lg">Erreur lors de la récupération de la vidéo.</p>';
            }
            loadingIndicator.style.display = 'none';
            return;
        }
        
        const video = await response.json();

        // Une fois les données reçues, on cache l'indicateur de chargement et on affiche le conteneur
        loadingIndicator.style.display = 'none';
        videoContainer.classList.remove('hidden');
        
        // Met à jour le contenu de la page avec les données de la vidéo
        pageTitle.textContent = `${video.title} - StackPages`;
        videoTitle.textContent = video.title;
        
        // Formatte la date
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = new Date(video.pubDate).toLocaleDateString('fr-FR', dateOptions);
        videoDate.textContent = `Publié le ${formattedDate}`;

        // Insère la description
        videoDescription.innerHTML = video.description;

        // Insère le lecteur vidéo YouTube
        playerEmbed.innerHTML = `
            <iframe 
                class="w-full h-full"
                src="https://www.youtube.com/embed/${video.id}" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen>
            </iframe>
        `;

    } catch (error) {
        console.error('Erreur lors du chargement de la vidéo:', error);
        loadingIndicator.style.display = 'none';
        videoDescription.innerHTML = '<p class="text-center text-red-500 text-lg">Erreur lors du chargement de la vidéo. Veuillez réessayer plus tard.</p>';
    }
});
