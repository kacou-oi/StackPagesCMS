// js/utils.js

// Fonction pour inclure un fichier HTML dans un élément du DOM
async function includeHTML(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Erreur lors du chargement de ${filePath}: ${response.statusText}`);
        }
        const html = await response.text();
        document.getElementById(elementId).innerHTML = html;
    } catch (error) {
        console.error(error);
        // On affiche un message d'erreur dans l'élément si le chargement échoue
        document.getElementById(elementId).innerHTML = `<div class="text-center p-4 text-red-600">Erreur lors du chargement du contenu.</div>`;
    }
}

// On s'assure que le DOM est chargé avant d'exécuter les fonctions
document.addEventListener('DOMContentLoaded', () => {
    // Charge le header dans l'élément avec l'ID 'header-placeholder'
    // Le chemin est absolu pour que cela fonctionne sur toutes les pages
    includeHTML('header-placeholder', '/partials/header.html');
    
    // Charge le footer dans l'élément avec l'ID 'footer-placeholder'
    includeHTML('footer-placeholder', '/partials/footer.html');
});
