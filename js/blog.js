// On s'assure que le script s'exécute après le chargement complet du DOM
document.addEventListener('DOMContentLoaded', async () => {
    // La div où les articles seront insérés
    const postsContainer = document.getElementById('posts-container');
    // L'élément pour afficher l'état de chargement
    const loadingIndicator = document.getElementById('loading-indicator');

    try {
        // L'URL du Cloudflare Worker qui va récupérer le flux RSS.
        // Le chemin a été mis à jour pour pointer vers le fichier à la racine.
        const workerUrl = '/_worker.js';

        // Afficher l'indicateur de chargement
        loadingIndicator.classList.remove('hidden');

        // On va chercher le flux RSS via le worker
        const response = await fetch(workerUrl);
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        // On convertit la réponse en texte pour la parser
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // On trouve tous les éléments <item> qui représentent les articles
        const items = xmlDoc.querySelectorAll('item');

        // Si aucun article n'est trouvé
        if (items.length === 0) {
            postsContainer.innerHTML = '<p class="text-center text-gray-500">Aucun article n\'a été trouvé.</p>';
        } else {
            // On masque l'indicateur de chargement une fois les données reçues
            loadingIndicator.classList.add('hidden');
            
            // On itère sur chaque article pour l'afficher
            items.forEach(item => {
                const title = item.querySelector('title')?.textContent;
                const link = item.querySelector('link')?.textContent;
                const description = item.querySelector('description')?.textContent;

                // On crée une carte pour l'article
                const postCard = document.createElement('div');
                postCard.className = 'bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 transform hover:-translate-y-1';
                postCard.innerHTML = `
                    <div class="p-6">
                        <h3 class="text-xl font-semibold text-orange-600 mb-2">${title}</h3>
                        <p class="text-gray-600 text-sm mb-4">${description}</p>
                        <a href="${link}" class="text-orange-500 font-bold hover:underline">Lire la suite →</a>
                    </div>
                `;
                postsContainer.appendChild(postCard);
            });
        }

    } catch (error) {
        console.error("Erreur lors de la récupération des articles:", error);
        loadingIndicator.classList.add('hidden');
        postsContainer.innerHTML = '<p class="text-center text-red-500">Impossible de charger les articles. Veuillez vérifier l\'URL du flux RSS et le Cloudflare Worker.</p>';
    }
});
