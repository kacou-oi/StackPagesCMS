// fonction pour charger les parties HTML
async function loadPartial(id, filename) {
    try {
        const response = await fetch(`/frontend/partials/${filename}`);
        if (!response.ok) {
            throw new Error(`Erreur lors du chargement du fichier: ${filename}`);
        }
        const html = await response.text();
        document.getElementById(id).innerHTML = html;
    } catch (error) {
        console.error(error);
    }
}
