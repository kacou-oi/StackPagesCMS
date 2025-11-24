// State
let allPosts = [];
let allVideos = [];
let metadata = {};
let config = {};

// Init
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadData();
    await loadConfig();
    renderDashboard();
    renderContentTable();
    renderVideos();
});

// Auth Check
// Auth Check
async function checkAuth() {
    const authKey = localStorage.getItem('stackpages_auth');
    if (!authKey) {
        window.location.href = '/';
        return;
    }

    // Optional: Verify with server if needed, but for now just trust existence + API 401s
    /*
    try {
        const res = await fetch('/api/check-auth', { 
            headers: { 'X-Auth-Key': authKey }
        });
        const data = await res.json();
        if (!data.authenticated) {
            localStorage.removeItem('stackpages_auth');
            window.location.href = '/';
        }
    } catch (e) {
        window.location.href = '/';
    }
    */
}

// Navigation
function showView(viewName) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    // Show selected
    document.getElementById(`view-${viewName}`).classList.remove('hidden');

    // Update Title
    const titles = {
        'dashboard': 'Tableau de bord',
        'content': 'Gestion des Articles',
        'videos': 'Vidéos YouTube',
        'api-explorer': 'Explorateur d\'API',
        'config': 'Configuration',
        'help': 'Aide & Support'
    };
    document.getElementById('page-title').textContent = titles[viewName];

    // Update Nav State
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-orange-50', 'text-orange-600');
        el.classList.add('text-slate-600');
    });
    const activeBtn = document.querySelector(`button[onclick="showView('${viewName}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('bg-orange-50', 'text-orange-600');
        activeBtn.classList.remove('text-slate-600');
    }
}

// Data Loading
async function loadData() {
    try {
        const [metaRes, postsRes, videosRes] = await Promise.all([
            fetch('/api/metadata'),
            fetch('/api/posts'),
            fetch('/api/videos')
        ]);

        metadata = await metaRes.json();
        allPosts = await postsRes.json();
        allVideos = await videosRes.json();

        // Update Stats
        document.getElementById('stat-total-posts').textContent = allPosts.length;
        document.getElementById('stat-total-videos').textContent = allVideos.length;
        if (metadata.lastBuildDate) {
            const date = new Date(metadata.lastBuildDate);
            document.getElementById('stat-last-update').textContent = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

            // Feed Status Logic
            const now = new Date();
            const diffHours = (now - date) / (1000 * 60 * 60);
            const statusEl = document.getElementById('stat-feed-status');

            if (diffHours < 24) {
                statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Actif';
                statusEl.className = "text-lg font-bold text-green-600 mt-2 flex items-center gap-2";
            } else if (diffHours < 72) {
                statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500"></span> Stable';
                statusEl.className = "text-lg font-bold text-yellow-600 mt-2 flex items-center gap-2";
            } else {
                statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span> Inactif';
                statusEl.className = "text-lg font-bold text-slate-500 mt-2 flex items-center gap-2";
            }
        }

    } catch (e) {
        console.error("Erreur de chargement:", e);
        // alert("Impossible de charger les données de l'API.");
    }
}

// Config Loading
async function loadConfig() {
    try {
        const authKey = localStorage.getItem('stackpages_auth');
        const res = await fetch('/api/config', {
            headers: { 'X-Auth-Key': authKey }
        });
        if (res.ok) {
            const data = await res.json();
            config = data.config;

            // Populate Form
            document.getElementById('conf-siteName').value = config.siteName || '';
            document.getElementById('conf-author').value = config.author || '';

            document.getElementById('conf-substack').value = config.substackRssUrl || '';
            document.getElementById('conf-youtube').value = config.youtubeRssUrl || '';
            document.getElementById('conf-metaTitle').value = config.seo?.metaTitle || '';
            document.getElementById('conf-metaDesc').value = config.seo?.metaDescription || '';
            document.getElementById('conf-metaKeywords').value = config.seo?.metaKeywords || '';
        }
    } catch (e) {
        console.error("Erreur chargement config:", e);
    }
}

// Config Saving
document.getElementById('config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('config-status');
    status.textContent = "Sauvegarde...";
    status.className = "text-sm font-medium text-slate-500";

    const newConfig = {
        siteName: document.getElementById('conf-siteName').value,
        author: document.getElementById('conf-author').value,
        substackRssUrl: document.getElementById('conf-substack').value,
        youtubeRssUrl: document.getElementById('conf-youtube').value,
        seo: {
            metaTitle: document.getElementById('conf-metaTitle').value,
            metaDescription: document.getElementById('conf-metaDesc').value,
            metaKeywords: document.getElementById('conf-metaKeywords').value
        }
    };

    try {
        const authKey = localStorage.getItem('stackpages_auth');
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Key': authKey
            },
            body: JSON.stringify(newConfig)
        });

        const data = await res.json();

        if (res.ok) {
            if (data.warning) {
                status.textContent = "Attention : " + data.warning;
                status.className = "text-sm font-medium text-orange-600";
            } else {
                status.textContent = "Sauvegardé avec succès !";
                status.className = "text-sm font-medium text-green-600";
                setTimeout(() => status.textContent = "", 3000);
            }
        } else {
            throw new Error(data.error || "Erreur inconnue");
        }
    } catch (e) {
        status.textContent = "Erreur: " + e.message;
        status.className = "text-sm font-medium text-red-600";
    }
});

// Renderers
function renderDashboard() {
    // Recent Posts
    const postsTbody = document.getElementById('dashboard-recent-posts');
    if (postsTbody) {
        postsTbody.innerHTML = allPosts.slice(0, 5).map(post => `
            <tr class="hover:bg-slate-50 transition">
                <td class="px-6 py-4 font-medium text-slate-800 truncate max-w-xs" title="${post.title}">${post.title}</td>
                <td class="px-6 py-4 text-slate-500">${new Date(post.pubDate).toLocaleDateString('fr-FR')}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="openPreview('${post.slug}')" class="text-orange-500 hover:text-orange-700 font-medium text-xs uppercase tracking-wide">Voir</button>
                </td>
            </tr>
        `).join('');
    }

    // Recent Videos
    const videosTbody = document.getElementById('dashboard-recent-videos');
    if (videosTbody) {
        videosTbody.innerHTML = allVideos.slice(0, 5).map(video => `
            <tr class="hover:bg-slate-50 transition">
                <td class="px-6 py-4 font-medium text-slate-800 truncate max-w-xs" title="${video.title}">${video.title}</td>
                <td class="px-6 py-4 text-slate-500">${new Date(video.published).toLocaleDateString('fr-FR')}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="openVideoPreview('${video.id}')" class="text-red-500 hover:text-red-700 font-medium text-xs uppercase tracking-wide">Voir</button>
                </td>
            </tr>
        `).join('');
    }
}

function renderContentTable() {
    const tbody = document.getElementById('all-posts-table');
    if (!tbody) return;

    const search = document.getElementById('search-posts').value.toLowerCase();

    const filtered = allPosts.filter(p => p.title.toLowerCase().includes(search));

    tbody.innerHTML = filtered.map(post => `
        <tr class="hover:bg-slate-50 transition group">
            <td class="px-6 py-4">
                <div class="w-10 h-10 rounded bg-slate-200 overflow-hidden">
                    ${post.image ? `<img src="${post.image}" class="w-full h-full object-cover" />` : '<div class="w-full h-full flex items-center justify-center text-slate-400"><i class="fas fa-image"></i></div>'}
                </div>
            </td>
            <td class="px-6 py-4 font-medium text-slate-800">
                ${post.title}
                <div class="text-xs text-slate-400 mt-0.5 truncate max-w-md">${post.description.substring(0, 60)}...</div>
            </td>
            <td class="px-6 py-4 text-slate-500 text-xs">${new Date(post.pubDate).toLocaleDateString('fr-FR')}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="openPreview('${post.slug}')" class="bg-white border border-slate-200 hover:border-orange-500 text-slate-600 hover:text-orange-600 px-3 py-1.5 rounded-md text-sm transition shadow-sm">
                    <i class="fas fa-eye mr-1"></i> Aperçu
                </button>
            </td>
        </tr>
    `).join('');
}

// Search Listener
function renderVideos() {
    const tbody = document.getElementById('videos-table');
    const emptyMsg = document.getElementById('no-videos-message');

    if (!tbody) return;

    if (!allVideos || allVideos.length === 0) {
        tbody.innerHTML = '';
        emptyMsg?.classList.remove('hidden');
        return;
    }

    emptyMsg?.classList.add('hidden');
    tbody.innerHTML = allVideos.map(video => `
        <tr class="hover:bg-slate-50 transition group">
            <td class="px-6 py-4 w-32">
                <div class="w-24 h-14 rounded bg-slate-200 overflow-hidden relative">
                    <img src="${video.thumbnail}" class="w-full h-full object-cover" />
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition">
                        <i class="fas fa-play text-white text-xs opacity-80"></i>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 font-medium text-slate-800">
                ${video.title}
                <div class="text-xs text-slate-400 mt-0.5 truncate max-w-md">${video.description ? video.description.substring(0, 60) + '...' : ''}</div>
            </td>
            <td class="px-6 py-4 text-slate-500 text-xs">${new Date(video.published).toLocaleDateString('fr-FR')}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="openVideoPreview('${video.id}')" class="bg-white border border-slate-200 hover:border-red-500 text-slate-600 hover:text-red-600 px-3 py-1.5 rounded-md text-sm transition shadow-sm">
                    <i class="fas fa-play mr-1"></i> Lire
                </button>
            </td>
        </tr>
    `).join('');
}

// Search Listener
document.getElementById('search-posts')?.addEventListener('input', renderContentTable);

// Modal Logic
function openPreview(slug) {
    const post = allPosts.find(p => p.slug === slug);
    if (!post) return;

    document.getElementById('modal-title').textContent = post.title;
    document.getElementById('modal-content').innerHTML = post.content; // Warning: Ensure content is sanitized in worker

    const modal = document.getElementById('preview-modal');
    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('preview-modal').classList.add('hidden');
    // Stop video if playing
    const content = document.getElementById('modal-content');
    content.innerHTML = '';
}

function openVideoPreview(videoId) {
    const video = allVideos.find(v => v.id === videoId);
    if (!video) return;

    document.getElementById('modal-title').textContent = video.title;

    // Embed YouTube Video
    const embedHtml = `
        <div class="aspect-video w-full bg-black rounded-lg overflow-hidden shadow-lg">
            <iframe 
                width="100%" 
                height="100%" 
                src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
                title="YouTube video player" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen>
            </iframe>
        </div>
        <div class="mt-6 prose prose-orange max-w-none">
            <p>${video.description || ''}</p>
            <a href="${video.link}" target="_blank" class="text-sm text-slate-500 hover:text-orange-500 flex items-center gap-2 mt-4">
                <i class="fab fa-youtube"></i> Regarder sur YouTube
            </a>
        </div>
    `;

    document.getElementById('modal-content').innerHTML = embedHtml;

    const modal = document.getElementById('preview-modal');
    modal.classList.remove('hidden');
}

// API Tester
async function testApiSlug() {
    const slug = document.getElementById('api-slug-input').value;
    if (!slug) {
        alert("Veuillez entrer un slug");
        return;
    }
    testApi(`/api/post/${slug}`);
}

async function testApi(endpoint) {
    const output = document.getElementById('api-output');
    output.textContent = "Chargement...";
    try {
        const res = await fetch(endpoint);
        const data = await res.json();
        output.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
        output.textContent = "Erreur: " + e.message;
    }
}

// Cache Clearing
async function clearCache() {
    const status = document.getElementById('cache-status');
    status.textContent = "Nettoyage...";
    try {
        const authKey = localStorage.getItem('stackpages_auth');
        const res = await fetch('/api/clear-cache', {
            method: 'POST',
            headers: { 'X-Auth-Key': authKey }
        });
        if (res.ok) {
            status.textContent = "Cache vidé avec succès !";
            status.className = "text-xs text-green-600 mt-2";
            setTimeout(() => status.textContent = "", 3000);
        } else {
            status.textContent = "Erreur lors du nettoyage.";
            status.className = "text-xs text-red-600 mt-2";
        }
    } catch (e) {
        status.textContent = "Erreur: " + e.message;
        status.className = "text-xs text-red-600 mt-2";
    }
}
