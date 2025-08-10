// Ce script gère l'affichage de la liste des vidéos
document.addEventListener('DOMContentLoaded', async () => {
    // Sélectionne les éléments du DOM
    const videosContainer = document.getElementById('videos-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    try {
        // Appelle l'API de notre Cloudflare Worker pour obtenir toutes les vidéos
        const response = await fetch('/api/videos');
        const videos = await response.json();

        // Une fois les données reçues, on cache l'indicateur de chargement
        loadingIndicator.style.display = 'none';

        // S'il n'y a pas de vidéos, on affiche un message
        if (videos.length === 0) {
            videosContainer.innerHTML = '<p class="text-center text-gray-500 text-lg">Aucune vidéo trouvée pour le moment.</p>';
            return;
        }

        // On génère une carte HTML pour chaque vidéo
        videos.forEach(video => {
            const videoCard = document.createElement('a');
            // Le lien utilise l'ID de la vidéo pour pointer vers la page de lecture
            videoCard.href = `/videos/player.html?id=${video.id}`;
            videoCard.className = 'block bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 overflow-hidden group';
            
            const snippet = video.description.replace(/(<([^>]+)>)/gi, "").substring(0, 100) + '...';

            videoCard.innerHTML = `
                <div class="relative">
                    <img src="${video.thumbnail}" alt="${video.title}" class="w-full h-48 object-cover">
                    <div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <i class="fab fa-youtube text-white text-6xl"></i>
                    </div>
                </div>
                <div class="p-4">
                    <h2 class="text-md font-bold mb-2 truncate">${video.title}</h2>
                    <p class="text-gray-600 text-sm mb-3">${new Date(video.pubDate).toLocaleDateString('fr-FR')}</p>
                </div>
            `;
            videosContainer.appendChild(videoCard);
        });

    } catch (error) {
        console.error('Erreur lors du chargement des vidéos:', error);
        loadingIndicator.style.display = 'none';
        videosContainer.innerHTML = '<p class="text-center text-red-500 text-lg">Erreur lors du chargement des vidéos. Veuillez réessayer plus tard.</p>';
    }
});
