/**
 * Insère le contenu d'un fichier HTML dans un élément de la page.
 * @param {string} elementId - L'ID de l'élément où insérer le contenu.
 * @param {string} filePath - Le chemin vers le fichier HTML à charger.
 */
async function loadHTML(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Erreur lors du chargement du fichier : ${filePath}`);
        }
        const html = await response.text();
        document.getElementById(elementId).innerHTML = html;

        // Si le header est chargé, on initialise le menu mobile
        if (elementId === 'header-placeholder') {
            initMobileMenu();
        }
    } catch (error) {
        console.error("Impossible de charger la partie du site :", error);
    }
}

/**
 * Initialise le menu mobile, appelé après le chargement du header.
 */
function initMobileMenu() {
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }
}

// On s'assure que le DOM est chargé avant d'essayer d'insérer le contenu
document.addEventListener('DOMContentLoaded', () => {
    loadHTML('header-placeholder', '/partials/header.html');
    loadHTML('footer-placeholder', '/partials/footer.html');
});
