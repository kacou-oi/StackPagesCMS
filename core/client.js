const mainContent = document.getElementById('main-content');
const siteTitleElem = document.getElementById('site-title');
const headerLogo = document.getElementById('header-logo');
const headerLogoLink = document.getElementById('header-logo-link');
const headerSiteName = document.getElementById('header-site-name');
const footerSiteNameCopyright = document.getElementById('footer-site-name-copyright');

const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
const closeMobileMenu = document.getElementById('close-mobile-menu');
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');

let allPosts = [];
let allVideos = [];
let allPodcasts = [];
let currentPodcastIndex = 0;
const itemsPerPage = 6; // Changed from 9 to 6 as per request
let currentPostsPage = 1;
let currentVideosPage = 1;

const articleModal = document.getElementById('article-modal');
const closeArticleModal = document.getElementById('close-article-modal');
const videoModal = document.getElementById('video-modal');
const closeVideoModal = document.getElementById('close-video-modal');
const videoPlayer = document.getElementById('video-player');

async function fetchMetadata() {
    try {
        const response = await fetch(window.location.origin + '/api/metadata');
        if (!response.ok) throw new Error('Failed to fetch metadata');
        const metadata = await response.json();
        if (siteTitleElem) siteTitleElem.textContent = metadata.title || 'M. Kacou Oi';
        if (headerSiteName) headerSiteName.textContent = metadata.title || 'M. kacou Oi';
        if (footerSiteNameCopyright) footerSiteNameCopyright.textContent = metadata.title || 'M. Kacou Oi';
        if (metadata.logo && headerLogo) {
            headerLogo.src = metadata.logo;
            headerLogo.style.display = 'block';
        } else if (headerLogo) {
            headerLogo.style.display = 'none';
        }
    } catch (error) {
        console.error('Error fetching metadata:', error);
        if (siteTitleElem) siteTitleElem.textContent = 'Erreur de chargement';
        if (headerSiteName) headerSiteName.textContent = 'M. Kacou Oi';
        if (footerSiteNameCopyright) footerSiteNameCopyright.textContent = 'M. Kacou oi';
        if (headerLogo) headerLogo.style.display = 'none';
    }
}

function closeAllModals() {
    // Add modal-fade-leave-to first to trigger transition, then hide
    if (articleModal) {
        articleModal.classList.add('modal-fade-leave-to');
        articleModal.classList.remove('modal-fade-enter-to');
    }
    if (videoModal) {
        videoModal.classList.add('modal-fade-leave-to');
        videoModal.classList.remove('modal-fade-enter-to');
    }

    // Wait for transition to finish before adding 'hidden'
    setTimeout(() => {
        if (articleModal) articleModal.classList.add('hidden');
        if (videoModal) videoModal.classList.add('hidden');
    }, 300); // Duration of modal-fade-leave-active transition

    if (videoPlayer) videoPlayer.src = '';
    // Removed podcast player pause from here to allow it to continue playing when modals are closed or tabs are changed.
}

// Modified modal open to handle transitions
function openModalWithTransition(modalElement) {
    if (!modalElement) return;
    modalElement.classList.remove('hidden');
    // Allow a tiny reflow for the browser to register 'hidden' removal before adding 'enter-to'
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modalElement.classList.remove('modal-fade-leave-to');
            modalElement.classList.add('modal-fade-enter-to');
        });
    });
    document.body.classList.add('overflow-hidden');
}


if (closeArticleModal) closeArticleModal.addEventListener('click', closeAllModals);
if (articleModal) articleModal.addEventListener('click', (e) => {
    if (e.target === articleModal) closeAllModals();
});

if (closeVideoModal) closeVideoModal.addEventListener('click', closeAllModals);
if (videoModal) videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) closeAllModals();
});

function showLoading() {
    if (!mainContent) return;
    mainContent.innerHTML = `
                <div class="flex flex-col items-center justify-center min-h-[calc(100vh-80px-48px)] text-blue-600">
                    <div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
                    <p class="mt-4 text-xl font-semibold">Chargement du contenu...</p>
                </div>
            `;
    window.scrollTo(0, 0);
}

// NOTE: renderHomePage, renderPublicationsPage, renderVideosPage, renderContactPage 
// are replaced by Server Side Rendering in the new architecture.
// However, we might need some client-side logic for pagination or modals.
// For now, I'm keeping the modal logic and podcast player.
// The routing logic will be replaced by HTMX or standard navigation.

async function fetchPodcasts() {
    const podcastPlayerContainer = document.getElementById('header-podcast-player-container');
    if (!podcastPlayerContainer) return;

    podcastPlayerContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-2 px-4 text-blue-600">
                    <div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500 mb-0.5"></div>
                    <p class="text-xs font-semibold">Chargement...</p>
                </div>
            `;

    try {
        const response = await fetch(window.location.origin + '/api/podcasts');
        if (!response.ok) throw new Error('Failed to fetch podcasts');
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            allPodcasts = data.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
            currentPodcastIndex = 0; // Start with the latest podcast
            renderPodcastPlayer();
        } else {
            podcastPlayerContainer.innerHTML = `
                        <p class="py-2 px-4 text-gray-600 text-sm">Aucun podcast trouvé.</p>
                    `;
        }
    } catch (error) {
        console.error('Error fetching podcasts:', error);
        podcastPlayerContainer.innerHTML = `
                    <div class="flex items-center px-4 py-2 text-red-500">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <p class="text-sm">Erreur de chargement.</p>
                    </div>
                `;
    }
}

function renderPodcastPlayer() {
    const podcastPlayerContainer = document.getElementById('header-podcast-player-container');
    if (!podcastPlayerContainer || allPodcasts.length === 0) return;

    // Preserve current audio state if player already exists
    const existingAudioPlayer = document.getElementById('podcast-audio-player');
    const currentTime = existingAudioPlayer ? existingAudioPlayer.currentTime : 0;
    const isPaused = existingAudioPlayer ? existingAudioPlayer.paused : true;

    podcastPlayerContainer.innerHTML = `
                <audio id="podcast-audio-player" class="hidden"></audio>
                <div class="tooltip">
                    <button id="podcast-prev-button" class="p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
                    </button>
                    <span id="podcast-prev-tooltip" class="tooltiptext"></span>
                </div>
                <div class="tooltip">
                    <button id="podcast-play-pause-button" class="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                        <svg id="podcast-play-icon" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <svg id="podcast-pause-icon" class="w-6 h-6 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </button>
                    <span id="podcast-play-pause-tooltip" class="tooltiptext"></span>
                </div>
                <div class="tooltip">
                    <button id="podcast-next-button" class="p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M6 5l7 7-7 7"></path></svg>
                    </button>
                    <span id="podcast-next-tooltip" class="tooltiptext"></span>
                </div>
            `;

    const podcastAudioPlayer = document.getElementById('podcast-audio-player');
    const podcastPlayPauseButton = document.getElementById('podcast-play-pause-button');
    const podcastPlayIcon = document.getElementById('podcast-play-icon');
    const podcastPauseIcon = document.getElementById('podcast-pause-icon');
    const podcastPrevButton = document.getElementById('podcast-prev-button');
    const podcastNextButton = document.getElementById('podcast-next-button');
    const podcastPrevTooltip = document.getElementById('podcast-prev-tooltip');
    const podcastPlayPauseTooltip = document.getElementById('podcast-play-pause-tooltip');
    const podcastNextTooltip = document.getElementById('podcast-next-tooltip');

    function updatePlayPauseButton(isPaused) {
        if (isPaused) {
            podcastPlayIcon.classList.remove('hidden');
            podcastPauseIcon.classList.add('hidden');
        } else {
            podcastPlayIcon.classList.add('hidden');
            podcastPauseIcon.classList.remove('hidden');
        }
    }

    function updatePodcastPlayerDisplay() {
        if (allPodcasts.length > 0) {
            const currentPodcast = allPodcasts[currentPodcastIndex];
            podcastAudioPlayer.src = currentPodcast.audioUrl;
            if (!isPaused) { // Only attempt to play if it was playing
                podcastAudioPlayer.currentTime = currentTime; // Restore time
                podcastAudioPlayer.play().catch(e => console.log("Autoplay prevented for podcast:", e));
            }

            podcastPrevButton.disabled = currentPodcastIndex === 0;
            podcastNextButton.disabled = currentPodcastIndex === allPodcasts.length - 1;

            podcastPlayPauseTooltip.innerHTML = `<strong>${currentPodcast.title}</strong>`; // Changed this line as per request

            if (currentPodcastIndex > 0) {
                const prevPodcast = allPodcasts[currentPodcastIndex - 1];
                podcastPrevTooltip.textContent = `Précédent: ${prevPodcast.title}`;
            } else {
                podcastPrevTooltip.textContent = 'Début de la playlist';
            }

            if (currentPodcastIndex < allPodcasts.length - 1) {
                const nextPodcast = allPodcasts[currentPodcastIndex + 1];
                podcastNextTooltip.textContent = `Suivant: ${nextPodcast.title}`;
            } else {
                podcastNextTooltip.textContent = 'Fin de la playlist';
            }
        }
    }

    function playPausePodcast() {
        if (podcastAudioPlayer.paused) {
            podcastAudioPlayer.play().catch(e => console.log("Autoplay prevented:", e));
        } else {
            podcastAudioPlayer.pause();
        }
    }

    function nextPodcast() {
        if (currentPodcastIndex < allPodcasts.length - 1) {
            currentPodcastIndex++;
            updatePodcastPlayerDisplay();
            podcastAudioPlayer.play().catch(e => console.log("Autoplay prevented:", e));
        } else {
            podcastAudioPlayer.pause();
            updatePlayPauseButton(true);
        }
    }

    function prevPodcast() {
        if (currentPodcastIndex > 0) {
            currentPodcastIndex--;
            updatePodcastPlayerDisplay();
            podcastAudioPlayer.play().catch(e => console.log("Autoplay prevented:", e));
        }
    }

    podcastPlayPauseButton.addEventListener('click', playPausePodcast);
    podcastNextButton.addEventListener('click', nextPodcast);
    podcastPrevButton.addEventListener('click', prevPodcast);

    podcastAudioPlayer.addEventListener('play', () => updatePlayPauseButton(false));
    podcastAudioPlayer.addEventListener('pause', () => updatePlayPauseButton(true));
    podcastAudioPlayer.addEventListener('ended', nextPodcast);

    updatePodcastPlayerDisplay();
    updatePlayPauseButton(isPaused); // Restore play/pause state
}

function openArticleModal(article) {
    document.getElementById('modal-article-image').src = article.image || 'https://via.placeholder.com/800x400/edf2f7/4a5568?text=Image+de+Couverture';
    document.getElementById('modal-article-title').textContent = article.title;
    document.getElementById('modal-article-author').textContent = article.author || 'Inconnu';
    const pubDate = new Date(article.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('modal-article-pubdate').textContent = pubDate;
    document.getElementById('modal-article-body').innerHTML = article.content;

    const shareUrl = encodeURIComponent(article.link || window.location.href);
    const shareTitle = encodeURIComponent(article.title);

    document.getElementById('share-facebook').href = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
    document.getElementById('share-twitter').href = `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`;
    document.getElementById('share-linkedin').href = `https://www.linkedin.com/shareArticle?mini=true&url=${shareUrl}&title=${shareTitle}`;
    document.getElementById('share-mail').href = `mailto:?subject=${shareTitle}&body=${shareUrl}`;

    openModalWithTransition(articleModal);
}

// Expose to window for inline calls if needed (though we should avoid them)
window.openArticleModal = openArticleModal;

function openVideoModal(videoLink) {
    const embedLink = videoLink.replace("watch?v=", "embed/");
    if (videoPlayer) videoPlayer.src = embedLink + '?autoplay=1'; // Autoplay video
    openModalWithTransition(videoModal);
}
window.openVideoModal = openVideoModal;

// Mobile menu toggle logic
if (mobileMenuButton) mobileMenuButton.addEventListener('click', () => {
    mobileMenu.classList.remove('translate-x-full');
    mobileMenu.classList.add('translate-x-0');
    mobileMenuOverlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
});

if (closeMobileMenu) closeMobileMenu.addEventListener('click', () => {
    mobileMenu.classList.remove('translate-x-0');
    mobileMenu.classList.add('translate-x-full');
    mobileMenuOverlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
});

if (mobileMenuOverlay) mobileMenuOverlay.addEventListener('click', () => {
    closeMobileMenu.click();
});

// Navigation and routing - UPDATED FOR HTMX / SSR
// We still want to highlight the active link based on URL
function updateActiveNavLink() {
    const path = window.location.pathname;
    document.querySelectorAll('.header-nav-link').forEach(link => {
        const span = link.querySelector('span');
        if (link.getAttribute('href') === path) {
            link.classList.add('text-blue-600', 'font-semibold');
            link.classList.remove('text-gray-600');
            if (span) span.style.width = '100%';
        } else {
            link.classList.remove('text-blue-600', 'font-semibold');
            link.classList.add('text-gray-600');
            if (span) span.style.width = '0px';
        }
    });
    // ... (footer links logic)
}

window.addEventListener('DOMContentLoaded', () => {
    fetchMetadata();
    fetchPodcasts(); // Fetch podcasts on initial load
    updateActiveNavLink();
});

// HTMX Event Listeners
document.body.addEventListener('htmx:afterOnLoad', () => {
    updateActiveNavLink();
    // Re-initialize any other dynamic content if needed (e.g. syntax highlighting, etc.)
    window.scrollTo(0, 0);
});

// Infinite Scroll Functions
let hiddenBlogs = [];
let hiddenVideos = [];

window.loadMoreBlogs = function () {
    const container = document.getElementById('publications-container');
    const button = document.getElementById('blog-load-more');

    if (!container || hiddenBlogs.length === 0) {
        if (button) button.style.display = 'none';
        return;
    }

    // Load next 6 items
    const nextBatch = hiddenBlogs.splice(0, 6);
    nextBatch.forEach(html => {
        container.insertAdjacentHTML('beforeend', html);
    });

    // Hide button if no more items
    if (hiddenBlogs.length === 0 && button) {
        button.style.display = 'none';
    }
};

window.loadMoreVideos = function () {
    const container = document.getElementById('videos-container');
    const button = document.getElementById('video-load-more');

    if (!container || hiddenVideos.length === 0) {
        if (button) button.style.display = 'none';
        return;
    }

    // Load next 6 items
    const nextBatch = hiddenVideos.splice(0, 6);
    nextBatch.forEach(html => {
        container.insertAdjacentHTML('beforeend', html);
    });

    // Hide button if no more items
    if (hiddenVideos.length === 0 && button) {
        button.style.display = 'none';
    }
};

// Hide items beyond initial load
document.body.addEventListener('htmx:afterSwap', (event) => {
    // Handle blog posts
    const blogContainer = document.getElementById('publications-container');
    if (blogContainer) {
        const allBlogs = Array.from(blogContainer.children);
        if (allBlogs.length > 6) {
            hiddenBlogs = allBlogs.slice(6).map(el => el.outerHTML);
            allBlogs.slice(6).forEach(el => el.remove());
        } else {
            hiddenBlogs = [];
            const loadMoreBtn = document.getElementById('blog-load-more');
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        }
    }

    // Handle videos
    const videoContainer = document.getElementById('videos-container');
    if (videoContainer) {
        const allVideos = Array.from(videoContainer.children);
        if (allVideos.length > 6) {
            hiddenVideos = allVideos.slice(6).map(el => el.outerHTML);
            allVideos.slice(6).forEach(el => el.remove());
        } else {
            hiddenVideos = [];
            const loadMoreBtn = document.getElementById('video-load-more');
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        }
    }
});
