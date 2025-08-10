document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('config-form');
    const statusDiv = document.getElementById('form-status');
    let currentConfigMode = 'file';

    // Charger la configuration existante
    async function loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error('Impossible de récupérer la configuration depuis l\'API.');
            }
            const { configMode, config } = await response.json();
            currentConfigMode = configMode;
            
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
            
            updateStatus(`Configuration chargée en mode : <strong>${configMode.toUpperCase()}</strong>.`, 'text-green-600');

        } catch (error) {
            console.error('Erreur lors du chargement de la config:', error);
            updateStatus(`Erreur : ${error.message}`, 'text-red-600');
        }
    }

    // Gérer la soumission du formulaire
    form.addEventListener('submit', async (event) => {
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

        if (currentConfigMode === 'kv') {
            // Mode KV : Sauvegarder via l'API
            try {
                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newConfig),
                });
                if (!response.ok) {
                    throw new Error(await response.text());
                }
                updateStatus('Configuration sauvegardée avec succès !', 'text-blue-600');
            } catch (error) {
                console.error('Erreur lors de la sauvegarde en mode KV:', error);
                updateStatus(`Erreur : ${error.message}`, 'text-red-600');
            }
        } else {
            // Mode Fichier : Télécharger le JSON
            const blob = new Blob([JSON.stringify(newConfig, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'config.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            updateStatus('Fichier config.json généré ! Remplacez l\'ancien fichier dans votre projet.', 'text-blue-600');
        }
    });

    function updateStatus(message, colorClass) {
        statusDiv.innerHTML = message;
        statusDiv.className = `text-center mt-4 text-sm font-semibold ${colorClass}`;
    }

    // Charger la config au démarrage
    loadConfig();
});
