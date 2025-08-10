document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('config-form');
    const statusDiv = document.getElementById('form-status');

    // Charger la configuration existante
    async function loadConfig() {
        try {
            const response = await fetch('/config.json');
            if (!response.ok) {
                throw new Error('Le fichier config.json est introuvable.');
            }
            const config = await response.json();
            
            // Remplir le formulaire
            document.getElementById('siteName').value = config.siteName || '';
            document.getElementById('author').value = config.author || '';
            document.getElementById('substackRssUrl').value = config.substackRssUrl || '';
            document.getElementById('youtubeRssUrl').value = config.youtubeRssUrl || '';
            
            if (config.seo) {
                document.getElementById('metaTitle').value = config.seo.metaTitle || '';
                document.getElementById('metaDescription').value = config.seo.metaDescription || '';
                document.getElementById('metaKeywords').value = config.seo.metaKeywords || '';
            }
            
            statusDiv.textContent = 'Configuration actuelle chargée.';
            statusDiv.className = 'text-center mt-4 text-sm font-semibold text-green-600';

        } catch (error) {
            console.error('Erreur lors du chargement de la config:', error);
            statusDiv.textContent = `Erreur : ${error.message}`;
            statusDiv.className = 'text-center mt-4 text-sm font-semibold text-red-600';
        }
    }

    // Gérer la soumission du formulaire
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        
        const newConfig = {
            siteName: document.getElementById('siteName').value,
            author: document.getElementById('author').value,
            substackRssUrl: document.getElementById('substackRssUrl').value,
            youtubeRssUrl: document.getElementById('youtubeRssUrl').value,
            seo: {
                metaTitle: document.getElementById('metaTitle').value,
                metaDescription: document.getElementById('metaDescription').value,
                metaKeywords: document.getElementById('metaKeywords').value,
            }
        };

        // Créer un blob avec le nouveau contenu JSON
        const blob = new Blob([JSON.stringify(newConfig, null, 2)], { type: 'application/json' });
        
        // Créer un lien de téléchargement
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'config.json';
        
        // Simuler un clic pour démarrer le téléchargement
        document.body.appendChild(a);
        a.click();
        
        // Nettoyer
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        statusDiv.textContent = 'Fichier config.json généré ! Remplacez l\'ancien fichier dans votre projet.';
        statusDiv.className = 'text-center mt-4 text-sm font-semibold text-blue-600';
    });

    // Charger la config au démarrage
    loadConfig();
});
