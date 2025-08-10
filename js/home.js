document.addEventListener('DOMContentLoaded', () => {
    loadLatestPosts();
    loadLatestVideo();
});

async function loadLatestPosts() {
    const container = document.getElementById('latest-posts-container');
    if (!container) return;

    try {
        const response = await fetch('/api/posts');
        const posts = await response.json();

        // On prend les 3 premiers articles
        const latestPosts = posts.slice(0, 3);

        if (latestPosts.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 col-span-3">Aucun article à afficher.</p>';
            return;
        }

        let html = '';
        latestPosts.forEach(post => {
            const snippet = post.description.replace(/(<([^>]+)>)/gi, "").substring(0, 120) + '...';
            html += `
                <a href="/blog/article.html?slug=${post.slug}" class="block bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 overflow-hidden">
                    ${post.image ? `<img src="${post.image}" alt="${post.title}" class="w-full h-48 object-cover">` : ''}
                    <div class="p-6">
                        <h3 class="text-xl font-bold mb-2">${post.title}</h3>
                        <p class="text-gray-600 text-sm mb-4">${snippet}</p>
                        <span class="text-orange-500 font-semibold">Lire la suite <i class="fas fa-arrow-right ml-1"></i></span>
                    </div>
                </a>
            `;
        });
        container.innerHTML = html;

    } catch (error) {
        console.error('Erreur lors du chargement des articles:', error);
        container.innerHTML = '<p class="text-center text-red-500 col-span-3">Erreur lors du chargement des articles.</p>';
    }
}

async function loadLatestVideo() {
    const container = document.getElementById('latest-video-container');
    if (!container) return;

    try {
        const response = await fetch('/api/videos');
        const videos = await response.json();

        // On prend les 2 dernières vidéos
        const latestVideos = videos.slice(0, 2);

        if (latestVideos.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 col-span-2">Aucune vidéo à afficher.</p>';
            return;
        }

        let html = '';
        latestVideos.forEach(video => {
            html += `
                <a href="/videos/player.html?id=${video.id}" class="block bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 overflow-hidden group">
                    <div class="relative aspect-video">
                        <img src="${video.thumbnail}" alt="${video.title}" class="w-full h-full object-cover">
                        <div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <i class="fab fa-youtube text-white text-6xl"></i>
                        </div>
                    </div>
                    <div class="p-6 text-center">
                        <h3 class="text-xl font-bold mb-2">${video.title}</h3>
                        <p class="text-gray-600 text-sm mb-3">${new Date(video.pubDate).toLocaleDateString('fr-FR')}</p>
                    </div>
                </a>
            `;
        });
        container.innerHTML = html;

    } catch (error) {
        console.error('Erreur lors du chargement des vidéos:', error);
        container.innerHTML = '<p class="text-center text-red-500 col-span-2">Erreur lors du chargement des vidéos.</p>';
    }
}
