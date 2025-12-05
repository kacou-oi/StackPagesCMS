// State
const appState = {
    posts: [],
    videos: [],
    podcasts: [],
    metadata: {},
    config: {}
};

// Auto-load GitHub config from Worker environment variables
async function autoLoadGithubConfig() {
    try {
        const res = await fetch('/api/github-config');
        if (res.ok) {
            const config = await res.json();

            // Only auto-fill if not already configured
            const existingConfig = localStorage.getItem('stackpages_github_config');
            if (!existingConfig && config.owner && config.repo) {
                console.log('Auto-loading GitHub config from environment variables');

                // Pre-fill owner, repo, and branch (token must be manually added)
                const partialConfig = {
                    owner: config.owner,
                    repo: config.repo,
                    branch: config.branch,
                    token: '' // User will need to provide this
                };

                // Save to localStorage so it's available for other functions
                localStorage.setItem('stackpages_github_config', JSON.stringify(partialConfig));

                // Update the display
                updateGitHubDisplay();

                console.log('GitHub owner, repo, and branch loaded from server.');
                console.log('⚠️ Please configure your GitHub Personal Access Token in the GitHub settings.');
            }
        }
    } catch (e) {
        console.log('Could not auto-load GitHub config:', e);
    }
}

// --- MAIN INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();

    if (isAuthenticated) {
        await autoLoadGithubConfig(); // Auto-load GitHub config first
        await loadConfig(); // Legacy config
        await loadData(); // Load dashboard data
    }
});

// Search Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search-posts')?.addEventListener('input', () => {
        currentPage = 1;
        renderContentTable();
    });

    document.getElementById('search-videos')?.addEventListener('input', () => {
        currentVideoPage = 1;
        renderVideos();
    });

    document.getElementById('search-podcasts')?.addEventListener('input', () => {
        currentPodcastPage = 1;
        renderPodcasts();
    });
});

// Auth Check
// Auth Check
async function checkAuth() {
    // Only check auth on dashboard page
    const currentPath = window.location.pathname;

    // If we are on the dashboard and NOT authenticated
    const authKey = localStorage.getItem('stackpages_auth');

    if (!authKey) {
        // Show login overlay if it exists
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            // Prevent scrolling on body
            document.body.style.overflow = 'hidden';

            // Bind login form if not already bound (simple check)
            const form = document.getElementById('dashboard-login-form');
            if (form && !form.dataset.bound) {
                form.dataset.bound = "true";
                form.addEventListener('submit', handleDashboardLogin);
            }
        } else {
            // Fallback if overlay is missing (should not happen on dashboard)
            console.warn("Login overlay missing on dashboard");
        }
        return false; // Not authenticated
    }

    return true; // Authenticated
}

async function handleDashboardLogin(e) {
    e.preventDefault();
    const email = document.getElementById('dash-email').value;
    const password = document.getElementById('dash-password').value;
    const errorDiv = document.getElementById('dash-login-error');
    const btn = e.target.querySelector('button');
    const originalBtnContent = btn.innerHTML;

    // Reset UI
    errorDiv.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (res.ok) {
            localStorage.setItem('stackpages_auth', password);
            // Hide overlay and reload data
            document.getElementById('login-overlay').classList.add('hidden');
            document.body.style.overflow = '';
            btn.disabled = false;
            btn.innerHTML = originalBtnContent;

            // Trigger data load
            await loadConfig();
            await loadData();
        } else {
            errorDiv.textContent = "Identifiants incorrects.";
            errorDiv.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = originalBtnContent;
        }
    } catch (err) {
        errorDiv.textContent = "Erreur de connexion.";
        errorDiv.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = originalBtnContent;
    }
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
        'builder': 'Frontend Builder',
        'page-creator': 'Pages Frame IDE',
        'analytics': 'Google Analytics',
        'podcasts': 'Podcasts',
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

    // Specific View Logic
    if (viewName === 'builder') {
        loadPublishedPages();
    } else if (viewName === 'page-creator') {
        loadSavedPages();
    }
}

// Data Loading
async function loadData() {
    try {
        // Force refresh on load
        const refreshParam = '?refresh=true';

        // 1. Metadata
        const metaRes = await fetch(`/api/metadata${refreshParam}`);
        appState.metadata = await metaRes.json();

        // Update UI with Metadata
        // Update UI with Metadata
        // const siteNameEl = document.getElementById('dashboard-site-name');
        // if (siteNameEl) siteNameEl.textContent = metadata.siteName || 'StackPages CMS';

        // const authorEl = document.getElementById('dashboard-author');
        // if (authorEl) authorEl.textContent = metadata.author || 'Admin';

        // Compute diffHours for feed status (use lastBuildDate if present)
        const statusEl = document.getElementById('stat-feed-status');
        let diffHours = 0;
        if (appState.metadata.lastBuildDate) {
            const now = new Date();
            const then = new Date(appState.metadata.lastBuildDate);
            diffHours = Math.abs(now - then) / 36e5; // milliseconds → hours
        }

        // 2. Load Content (Individually to prevent one failure from blocking others)
        const loadPosts = fetch('/api/posts?limit=100').then(res => res.ok ? res.json() : { posts: [] }).catch(e => { console.error("Posts fetch error:", e); return { posts: [] }; });
        const loadVideos = fetch('/api/videos?limit=100').then(res => res.ok ? res.json() : { videos: [] }).catch(e => { console.error("Videos fetch error:", e); return { videos: [] }; });
        const loadPodcasts = fetch('/api/podcasts').then(res => res.ok ? res.json() : []).catch(e => { console.error("Podcasts fetch error:", e); return []; });

        const [postsData, videosData, podcasts] = await Promise.all([loadPosts, loadVideos, loadPodcasts]);

        // Handle paginated responses
        appState.posts = Array.isArray(postsData) ? postsData : (postsData.posts || []);
        appState.videos = Array.isArray(videosData) ? videosData : (videosData.videos || []);
        appState.podcasts = podcasts;


        // Update Stats
        document.getElementById('stat-total-posts').textContent = appState.posts.length;
        document.getElementById('stat-total-videos').textContent = appState.videos.length;
        document.getElementById('stat-total-podcasts').textContent = appState.podcasts.length;


        // Update Published Pages Stat
        const pages = JSON.parse(localStorage.getItem('stackpages_custom_pages') || '[]');
        const publishedCount = pages.filter(p => p.status === 'published').length;
        const statPagesEl = document.getElementById('stat-total-pages');
        if (statPagesEl) {
            statPagesEl.textContent = publishedCount;
        }


        // Feed status UI (only if element exists)
        if (statusEl) {
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

        // Render UI with new data
        renderDashboard();
        renderContentTable();
        renderVideos();
        renderPodcasts(); // Call renderPodcasts here

    } catch (e) {
        console.error("Erreur de chargement:", e);
        // alert("Impossible de charger les données de l'API.");
    }
}


// Config Loading from GitHub config.json
async function loadConfig() {
    // Legacy function - just loads from API for backwards compatibility
    try {
        const authKey = localStorage.getItem('stackpages_auth');
        const configRes = await fetch('/api/config', {
            headers: { 'X-Auth-Key': authKey }
        });
        const config = await configRes.json();
        appState.config = config;

        // Update UI Elements
        // 1. Sidebar Site Name
        const sidebarTitle = document.querySelector('aside h1 span');
        if (sidebarTitle) sidebarTitle.textContent = config.siteName || 'StackPages';

        // 2. Header Site Link
        const domainLink = document.getElementById('site-domain-link');
        const headerBtn = document.getElementById('header-site-btn');

        if (domainLink) domainLink.textContent = config.domain ? new URL(config.domain).hostname : 'Voir le site';
        if (headerBtn) headerBtn.href = config.domain || '/';

        // 3. Browser Title
        document.title = `Dashboard - ${config.siteName || 'StackPages CMS'}`;

        // Show warning if Substack URL missing
        if (!config.substackRssUrl) {
            document.getElementById('config-warning')?.classList.remove('hidden');
        } else {
            document.getElementById('config-warning')?.classList.add('hidden');
        }
    } catch (e) {
        console.error("Erreur chargement config:", e);
    }
}

// Load Site Config from GitHub config.json
async function loadSiteConfig() {
    console.log("loadSiteConfig called");
    const statusEl = document.getElementById('config-status');
    const loadingEl = document.getElementById('config-loading');
    const formEl = document.getElementById('config-form');

    // Get GitHub config from localStorage
    let ghConfig = {};
    try {
        ghConfig = JSON.parse(localStorage.getItem('stackpages_github_config') || '{}');
        console.log("GitHub Config loaded:", ghConfig);
    } catch (e) {
        console.error("Error parsing GitHub config:", e);
    }

    if (!ghConfig.owner || !ghConfig.repo || !ghConfig.token) {
        console.warn("GitHub config missing");
        if (statusEl) {
            statusEl.textContent = "⚠️ Veuillez d'abord configurer GitHub (cliquez sur votre nom en bas à gauche)";
            statusEl.className = "text-sm text-center text-amber-600";
        }
        return;
    }

    // Show loading
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (formEl) formEl.classList.add('opacity-50');

    const branch = ghConfig.branch || 'Portal';
    const rawUrl = `https://raw.githubusercontent.com/${ghConfig.owner}/${ghConfig.repo}/${branch}/config.json`;
    console.log("Fetching config from:", rawUrl);

    try {
        const res = await fetch(rawUrl);
        if (!res.ok) {
            throw new Error("config.json not found");
        }
        const config = await res.json();
        console.log("Config fetched:", config);

        // Populate form fields
        if (document.getElementById('conf-siteName')) document.getElementById('conf-siteName').value = config.site?.name || '';
        if (document.getElementById('conf-domain')) document.getElementById('conf-domain').value = config.site?.domain || '';
        if (document.getElementById('conf-description')) document.getElementById('conf-description').value = config.site?.description || '';
        if (document.getElementById('conf-author')) document.getElementById('conf-author').value = config.site?.author || '';

        if (document.getElementById('conf-metaTitle')) document.getElementById('conf-metaTitle').value = config.seo?.title || '';
        if (document.getElementById('conf-metaDesc')) document.getElementById('conf-metaDesc').value = config.seo?.metaDescription || '';
        if (document.getElementById('conf-metaKeywords')) document.getElementById('conf-metaKeywords').value = config.seo?.keywords || '';

        if (document.getElementById('conf-activeTemplate')) document.getElementById('conf-activeTemplate').value = config.theme?.activeTemplate || 'default';
        if (document.getElementById('conf-primaryColor')) document.getElementById('conf-primaryColor').value = config.theme?.primaryColor || '#3B82F6';

        if (document.getElementById('conf-substack')) document.getElementById('conf-substack').value = config.feeds?.substack || '';
        if (document.getElementById('conf-youtube')) document.getElementById('conf-youtube').value = config.feeds?.youtube || '';
        if (document.getElementById('conf-podcast')) document.getElementById('conf-podcast').value = config.feeds?.podcast || '';

        if (document.getElementById('conf-twitter')) document.getElementById('conf-twitter').value = config.social?.twitter || '';
        if (document.getElementById('conf-linkedin')) document.getElementById('conf-linkedin').value = config.social?.linkedin || '';
        if (document.getElementById('conf-github')) document.getElementById('conf-github').value = config.social?.github || '';

        if (statusEl) {
            statusEl.textContent = "✓ Configuration chargée";
            statusEl.className = "text-sm text-center text-green-600";
            setTimeout(() => statusEl.textContent = "", 3000);
        }
    } catch (e) {
        console.error("Error loading site config:", e);
        if (statusEl) {
            statusEl.textContent = "⚠️ config.json non trouvé. Les champs sont vides.";
            statusEl.className = "text-sm text-center text-amber-600";
        }
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (formEl) formEl.classList.remove('opacity-50');
    }
}

// Load available templates from API
async function loadAvailableTemplates() {
    try {
        const res = await fetch('/api/templates');
        if (!res.ok) {
            console.warn('Could not load templates, status:', res.status);
            return;
        }

        const templates = await res.json();
        const selectEl = document.getElementById('conf-activeTemplate');

        if (!selectEl) {
            console.warn('Template select element not found');
            return;
        }

        // Get current value before updating
        const currentValue = selectEl.value;

        // Clear existing options
        selectEl.innerHTML = '';

        // Add templates from API
        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.name;
            // Capitalize first letter for display
            option.textContent = template.name.charAt(0).toUpperCase() + template.name.slice(1);
            selectEl.appendChild(option);
        });

        // Restore selected value if it exists
        if (currentValue && templates.find(t => t.name === currentValue)) {
            selectEl.value = currentValue;
        }

        console.log(`Loaded ${templates.length} templates from API`);
    } catch (e) {
        console.error('Error loading templates:', e);
    }
}

// Save Site Config to GitHub config.json
async function saveSiteConfig() {
    console.log("saveSiteConfig called");
    const statusEl = document.getElementById('config-status');

    // Get GitHub config from localStorage
    let ghConfig = {};
    try {
        ghConfig = JSON.parse(localStorage.getItem('stackpages_github_config') || '{}');
    } catch (e) {
        console.error("Error parsing GitHub config:", e);
    }

    if (!ghConfig.owner || !ghConfig.repo || !ghConfig.token) {
        console.warn("GitHub config missing during save");
        if (statusEl) {
            statusEl.textContent = "⚠️ Veuillez d'abord configurer GitHub";
            statusEl.className = "text-sm text-center text-red-600";
        }
        return;
    }

    // Build config object from form values
    const newConfig = {
        site: {
            name: document.getElementById('conf-siteName').value,
            domain: document.getElementById('conf-domain').value,
            description: document.getElementById('conf-description').value,
            author: document.getElementById('conf-author').value,
            logo: "",
            favicon: ""
        },
        seo: {
            title: document.getElementById('conf-metaTitle').value,
            metaDescription: document.getElementById('conf-metaDesc').value,
            keywords: document.getElementById('conf-metaKeywords').value,
            ogImage: ""
        },
        social: {
            twitter: document.getElementById('conf-twitter').value,
            linkedin: document.getElementById('conf-linkedin').value,
            github: document.getElementById('conf-github').value
        },
        theme: {
            activeTemplate: document.getElementById('conf-activeTemplate').value || 'default',
            primaryColor: document.getElementById('conf-primaryColor').value || '#3B82F6'
        },
        feeds: {
            substack: document.getElementById('conf-substack').value,
            youtube: document.getElementById('conf-youtube').value,
            podcast: document.getElementById('conf-podcast').value
        }
    };

    console.log("Saving config:", newConfig);

    const branch = ghConfig.branch || 'Portal';
    const filePath = 'config.json';
    const apiUrl = `https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/contents/${filePath}`;

    if (statusEl) {
        statusEl.textContent = "⏳ Enregistrement en cours...";
        statusEl.className = "text-sm text-center text-blue-600";
    }

    try {
        // First, try to get existing file SHA (for update)
        let sha = null;
        try {
            const getRes = await fetch(`${apiUrl}?ref=${branch}`, {
                headers: {
                    'Authorization': `Bearer ${ghConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (getRes.ok) {
                const data = await getRes.json();
                sha = data.sha;
            }
        } catch (e) {
            // File doesn't exist yet, that's OK
        }

        // Create or update the file
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(newConfig, null, 2))));
        const body = {
            message: `Update config.json via Dashboard`,
            content: content,
            branch: branch
        };
        if (sha) body.sha = sha;

        const res = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${ghConfig.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            console.log("Config saved successfully");
            if (statusEl) {
                statusEl.textContent = "✓ Configuration sauvegardée sur GitHub !";
                statusEl.className = "text-sm text-center text-green-600";
            }
        } else {
            const err = await res.json();
            console.error("GitHub API Error:", err);
            throw new Error(err.message || 'GitHub API error');
        }
    } catch (e) {
        console.error("Error saving site config:", e);
        if (statusEl) {
            statusEl.textContent = "❌ Erreur : " + e.message;
            statusEl.className = "text-sm text-center text-red-600";
        }
    }
}

// Expose functions to window
window.loadSiteConfig = loadSiteConfig;
window.saveSiteConfig = saveSiteConfig;
window.loadAvailableTemplates = loadAvailableTemplates;


// Auto-load config when showing config view
document.addEventListener('DOMContentLoaded', () => {
    // Override showView to load config when navigating to config tab
    const originalShowView = window.showView;
    if (originalShowView) {
        window.showView = function (viewName) {
            originalShowView(viewName);
            if (viewName === 'config') {
                loadSiteConfig();
                // Also load templates independently
                loadAvailableTemplates();
            }
        };
    }
});


// Renderers
function renderDashboard() {
    // Recent Posts
    const postsTbody = document.getElementById('dashboard-recent-posts');
    if (postsTbody) {
        if (!appState.posts || appState.posts.length === 0) {
            postsTbody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-slate-500">Aucun article trouvé.</td></tr>';
        } else {
            postsTbody.innerHTML = appState.posts.slice(0, 5).map(post => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-6 py-4 font-medium text-slate-800 truncate max-w-xs" title="${post.title}">${post.title}</td>
                    <td class="px-6 py-4 text-slate-500">${new Date(post.pubDate).toLocaleDateString('fr-FR')}</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="openPreview('${post.slug}')" class="text-orange-500 hover:text-orange-700 font-medium text-xs uppercase tracking-wide">Voir</button>
                    </td>
                </tr>
            `).join('');
        }
    }

    // Recent Published Pages (New Table)
    const pagesTbody = document.getElementById('dashboard-recent-pages');
    if (pagesTbody) {
        const pages = JSON.parse(localStorage.getItem('stackpages_custom_pages') || '[]');
        const publishedPages = pages
            .filter(p => p.status === 'published')
            .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
            .slice(0, 5);

        if (publishedPages.length === 0) {
            pagesTbody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-slate-500">Aucune page publiée.</td></tr>';
        } else {
            pagesTbody.innerHTML = publishedPages.map(page => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-6 py-4 font-medium text-slate-800 truncate max-w-xs" title="${page.title}">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-green-500"></span>
                            ${page.title}
                        </div>
                    </td>
                    <td class="px-6 py-4 text-slate-500">
                        ${new Date(page.updatedAt || Date.now()).toLocaleDateString('fr-FR')}
                    </td>
                    <td class="px-6 py-4 text-right">
                        <a href="/p/${page.slug}" 
                           target="_blank"
                           class="text-orange-500 hover:text-orange-700 font-medium text-xs uppercase tracking-wide">
                            Voir
                        </a>
                    </td>
                </tr>
            `).join('');
        }
    }

    // Recent Videos
    const videosTbody = document.getElementById('dashboard-recent-videos');
    if (videosTbody) {
        if (!appState.videos || appState.videos.length === 0) {
            videosTbody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-slate-500">Aucune vidéo trouvée.</td></tr>';
        } else {
            videosTbody.innerHTML = appState.videos.slice(0, 5).map(video => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-6 py-4 font-medium text-slate-800 truncate max-w-xs" title="${video.title}">${video.title}</td>
                    <td class="px-6 py-4 text-slate-500">${new Date(video.published).toLocaleDateString('fr-FR')}</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="openVideoPreview('${video.link}')" class="text-red-500 hover:text-red-700 font-medium text-xs uppercase tracking-wide">Voir</button>
                    </td>
                </tr>
            `).join('');
        }
    }

    // Recent Podcasts
    const podcastsTbody = document.getElementById('dashboard-recent-podcasts');
    if (podcastsTbody) {
        if (!appState.podcasts || appState.podcasts.length === 0) {
            podcastsTbody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-slate-500">Aucun podcast trouvé.</td></tr>';
        } else {
            podcastsTbody.innerHTML = appState.podcasts.slice(0, 5).map(podcast => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-6 py-4 font-medium text-slate-800 truncate max-w-xs" title="${podcast.title}">${podcast.title}</td>
                    <td class="px-6 py-4 text-slate-500">${new Date(podcast.pubDate).toLocaleDateString('fr-FR')}</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="openPodcastPreview('${podcast.link}')" class="text-blue-500 hover:text-blue-700 font-medium text-xs uppercase tracking-wide">Ouvrir</button>
                    </td>
                </tr>
            `).join('');
        }
    }
}

let currentPage = 1;
const itemsPerPage = 10;

function renderContentTable() {
    const tbody = document.getElementById('all-posts-table');
    if (!tbody) return;

    const search = document.getElementById('search-posts').value.toLowerCase();
    const filtered = appState.posts.filter(p => p.title.toLowerCase().includes(search));

    // Pagination Logic
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = 1; // Reset if out of bounds

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedPosts = filtered.slice(start, end);

    // Update Table
    tbody.innerHTML = paginatedPosts.map(post => `
        <tr class="hover:bg-slate-50 transition group">
            <td class="px-6 py-4">
                <div class="w-16 h-10 rounded bg-slate-200 overflow-hidden">
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

    // Update Pagination Controls
    document.getElementById('pagination-info').textContent = `Page ${currentPage} sur ${totalPages || 1} `;
    document.getElementById('prev-page-btn').disabled = currentPage === 1;
    document.getElementById('next-page-btn').disabled = currentPage === totalPages || totalPages === 0;
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderContentTable();
    }
}

function nextPage() {
    const search = document.getElementById('search-posts').value.toLowerCase();
    const filtered = appState.posts.filter(p => p.title.toLowerCase().includes(search));
    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    if (currentPage < totalPages) {
        currentPage++;
        renderContentTable();
    }
}

// Video Pagination State
let currentVideoPage = 1;
const VIDEOS_PER_PAGE = 10; // Renamed for consistency with diff

// Search Listener
function renderVideos() {
    const tbody = document.getElementById('videos-table');
    if (!tbody) return;

    const search = document.getElementById('search-videos')?.value.toLowerCase() || '';
    const filtered = appState.videos.filter(v => v.title.toLowerCase().includes(search));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300"><i class="fas fa-video text-4xl text-slate-300 mb-3"></i><p class="text-slate-500">Aucune vidéo trouvée</p></td></tr>`;
        document.getElementById('video-pagination-info').textContent = `Page 1 sur 1`;
        document.getElementById('prev-video-page-btn').disabled = true;
        document.getElementById('next-video-page-btn').disabled = true;
        return;
    }

    const totalPages = Math.ceil(filtered.length / VIDEOS_PER_PAGE);
    if (currentVideoPage > totalPages) currentVideoPage = 1;

    const start = (currentVideoPage - 1) * VIDEOS_PER_PAGE;
    const pageVideos = filtered.slice(start, start + VIDEOS_PER_PAGE);

    tbody.innerHTML = pageVideos.map(video => `
        <tr class="hover:bg-slate-50 transition group">
            <td class="px-6 py-4">
                <div class="w-16 h-10 rounded bg-slate-200 overflow-hidden">
                    ${video.thumbnail ? `<img src="${video.thumbnail}" class="w-full h-full object-cover"/>` : '<div class="w-full h-full flex items-center justify-center text-slate-400"><i class="fas fa-video"></i></div>'}
                </div>
            </td>
            <td class="px-6 py-4 font-medium text-slate-800">
                ${video.title}
                <div class="text-xs text-slate-400 mt-0.5 truncate max-w-md">${video.description ? video.description.substring(0, 60) + '...' : ''}</div>
            </td>
            <td class="px-6 py-4 text-slate-500 text-xs">${new Date(video.published).toLocaleDateString('fr-FR')}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="openVideoPreview('${video.link}')" class="bg-white border border-slate-200 hover:border-orange-500 text-slate-600 hover:text-orange-600 px-3 py-1.5 rounded-md text-sm transition shadow-sm">
                    <i class="fas fa-eye mr-1"></i> Aperçu
                </button>
            </td>
        </tr>
            `).join('');

    document.getElementById('video-pagination-info').textContent = `Page ${currentVideoPage} sur ${totalPages} `;
    document.getElementById('prev-video-page-btn').disabled = currentVideoPage === 1;
    document.getElementById('next-video-page-btn').disabled = currentVideoPage === totalPages;
}

// Podcast Pagination State
let currentPodcastPage = 1;
const PODCASTS_PER_PAGE = 10;

function renderPodcasts() {
    const tbody = document.getElementById('podcasts-table');
    if (!tbody) return;

    const search = document.getElementById('search-podcasts')?.value.toLowerCase() || '';
    const filtered = appState.podcasts.filter(p => p.title.toLowerCase().includes(search));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300"><i class="fas fa-microphone text-4xl text-slate-300 mb-3"></i><p class="text-slate-500">Aucun épisode trouvé</p></td></tr>`;
        document.getElementById('podcast-pagination-info').textContent = `Page 1 sur 1`;
        document.getElementById('prev-podcast-page-btn').disabled = true;
        document.getElementById('next-podcast-page-btn').disabled = true;
        return;
    }

    const totalPages = Math.ceil(filtered.length / PODCASTS_PER_PAGE);
    if (currentPodcastPage > totalPages) currentPodcastPage = 1;

    const start = (currentPodcastPage - 1) * PODCASTS_PER_PAGE;
    const pagePodcasts = filtered.slice(start, start + PODCASTS_PER_PAGE);

    tbody.innerHTML = pagePodcasts.map(podcast => {
        const globalIndex = appState.podcasts.findIndex(p => p.link === podcast.link);
        return `
        <tr class="hover:bg-slate-50 transition group">
            <td class="px-6 py-4 font-medium text-slate-800">
                ${podcast.title}
                <div class="text-xs text-slate-400 mt-0.5 truncate max-w-md">${podcast.description ? podcast.description.replace(/<[^>]*>/g, '').substring(0, 60) + '...' : ''}</div>
            </td>
            <td class="px-6 py-4 text-slate-500 text-xs">${new Date(podcast.pubDate).toLocaleDateString('fr-FR')}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="openPodcastPreview(${globalIndex})" class="bg-white border border-slate-200 hover:border-orange-500 text-slate-600 hover:text-orange-600 px-3 py-1.5 rounded-md text-sm transition shadow-sm">
                    <i class="fas fa-play mr-1"></i> Ouvrir
                </button>
            </td>
        </tr>
            `;
    }).join('');

    document.getElementById('podcast-pagination-info').textContent = `Page ${currentPodcastPage} sur ${totalPages} `;
    document.getElementById('prev-podcast-page-btn').disabled = currentPodcastPage === 1;
    document.getElementById('next-podcast-page-btn').disabled = currentPodcastPage === totalPages;
}

function prevPodcastPage() {
    if (currentPodcastPage > 1) {
        currentPodcastPage--;
        renderPodcasts();
    }
}

function nextPodcastPage() {
    const search = document.getElementById('search-podcasts')?.value.toLowerCase() || '';
    const filtered = appState.podcasts.filter(p => p.title.toLowerCase().includes(search));
    const totalPages = Math.ceil(filtered.length / PODCASTS_PER_PAGE);

    if (currentPodcastPage < totalPages) {
        currentPodcastPage++;
        renderPodcasts();
    }
}

function prevVideoPage() {
    if (currentVideoPage > 1) {
        currentVideoPage--;
        renderVideos();
    }
}

function nextVideoPage() {
    const search = document.getElementById('search-videos')?.value.toLowerCase() || '';
    const filtered = appState.videos.filter(v => v.title.toLowerCase().includes(search));
    const totalPages = Math.ceil(filtered.length / VIDEOS_PER_PAGE);

    if (currentVideoPage < totalPages) {
        currentVideoPage++;
        renderVideos();
    }
}

// Search Listener
document.getElementById('search-posts')?.addEventListener('input', renderContentTable);

// Modal Logic
function openPreview(slug) {
    const post = appState.posts.find(p => p.slug === slug);
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

// New function to preview a video in the same modal
function openVideoPreview(link) {
    const video = appState.videos.find(v => v.link === link);
    if (!video) return;

    document.getElementById('modal-title').textContent = video.title;

    // Extract Video ID
    let videoId = '';
    try {
        const url = new URL(link);
        if (url.hostname.includes('youtube.com')) {
            videoId = url.searchParams.get('v');
        } else if (url.hostname.includes('youtu.be')) {
            videoId = url.pathname.slice(1);
        }
    } catch (e) {
        console.error("Invalid video URL", link);
    }

    const embedSrc = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : link;

    // Build modal content: embed video if possible, otherwise show link and description
    const content = `<div class="flex flex-col gap-4">
        <div class="aspect-video w-full bg-black rounded-lg overflow-hidden shadow-lg">
            <iframe 
                width="100%" 
                height="100%" 
                src="${embedSrc}" 
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

    document.getElementById('modal-content').innerHTML = content;
    const modal = document.getElementById('preview-modal');
    modal.classList.remove('hidden');
}

function openPodcastPreview(index) {
    const podcast = appState.podcasts[index];

    if (!podcast) {
        console.error("Podcast not found for index:", index);
        return;
    }

    document.getElementById('modal-title').textContent = podcast.title;

    const content = `<div class="flex flex-col gap-4">
        <div class="w-full bg-slate-50 rounded-xl p-6 border border-slate-200 flex flex-col items-center justify-center gap-4">
            <div class="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center text-purple-500 mb-2">
                <i class="fas fa-microphone-alt text-4xl"></i>
            </div>
            <audio controls class="w-full max-w-md" preload="auto">
                <source src="${podcast.audioUrl}" type="audio/mpeg">
                Votre navigateur ne supporte pas l'élément audio.
            </audio>
        </div>
        <div class="mt-6 prose prose-orange max-w-none">
            <div class="text-sm text-slate-500 mb-2">
                <i class="far fa-calendar mr-2"></i> ${new Date(podcast.pubDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <p>${podcast.description || ''}</p>
            <a href="${podcast.link}" target="_blank" class="text-sm text-slate-500 hover:text-orange-500 flex items-center gap-2 mt-4">
                <i class="fas fa-external-link-alt"></i> Écouter sur la plateforme d'origine
            </a>
        </div>
    </div>`;

    document.getElementById('modal-content').innerHTML = content;
    const modal = document.getElementById('preview-modal');
    modal.classList.remove('hidden');
}


// API Tester
async function testApiSlug() {
    const slug = document.getElementById('api-slug-input').value;
    if (!slug) {
        document.getElementById('api-output').textContent = "Erreur : Veuillez entrer un slug";
        return;
    }
    testApi(`/api/post/${slug}`);
}

async function testApiVideo() {
    const id = document.getElementById('api-video-input').value;
    if (!id) {
        document.getElementById('api-output').textContent = "Erreur : Veuillez entrer un ID vidéo";
        return;
    }
    testApi(`/api/video/${id}`);
}

async function testApiPodcast() {
    const id = document.getElementById('api-podcast-input').value;
    if (!id) {
        document.getElementById('api-output').textContent = "Erreur : Veuillez entrer un GUID ou un Slug de podcast";
        return;
    }
    testApi(`/api/podcast/${id}`);
}

async function testApi(endpoint) {
    const output = document.getElementById('api-output');
    const title = document.getElementById('api-response-title');

    if (title) title.textContent = `Réponse : ${endpoint}`;
    output.textContent = "Chargement...";

    try {
        const res = await fetch(endpoint);
        const data = await res.json();
        output.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
        output.textContent = "Erreur: " + e.message;
    }
}

function clearApiOutput() {
    const output = document.getElementById('api-output');
    const title = document.getElementById('api-response-title');

    if (output) output.textContent = "En attente...";
    if (title) title.textContent = "Réponse";
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

// GitHub Config Functions
function updateGitHubDisplay() {
    let config = {};
    try {
        config = JSON.parse(localStorage.getItem('stackpages_github_config') || '{}');
    } catch (e) {
        console.error("Error parsing GitHub config:", e);
        config = {};
    }

    const display = document.getElementById('gh-username-display');
    const subtext = document.getElementById('dashboard-author');

    if (display) {
        if (config.owner) {
            display.textContent = config.owner;
            if (subtext) subtext.textContent = 'Connecté';
        } else {
            display.textContent = 'Non connecté';
            if (subtext) subtext.textContent = 'Configurer GitHub';
        }
    }
}

function openGitHubConfig() {
    const modal = document.getElementById('github-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Load saved values
        let config = {};
        try {
            config = JSON.parse(localStorage.getItem('stackpages_github_config') || '{}');
        } catch (e) {
            console.error("Error parsing GitHub config:", e);
        }

        if (config.owner) document.getElementById('gh-owner').value = config.owner;
        if (config.repo) document.getElementById('gh-repo').value = config.repo;
        if (config.token) document.getElementById('gh-token').value = config.token;
    }
}

function closeGitHubConfig() {
    const modal = document.getElementById('github-modal');
    if (modal) modal.classList.add('hidden');
}

function saveGitHubConfig() {
    const owner = document.getElementById('gh-owner').value.trim();
    const repo = document.getElementById('gh-repo').value.trim();
    const token = document.getElementById('gh-token').value.trim();

    if (!owner || !repo || !token) {
        alert("Veuillez remplir tous les champs.");
        return;
    }

    const config = { owner, repo, token };
    localStorage.setItem('stackpages_github_config', JSON.stringify(config));

    updateGitHubDisplay(); // Update UI immediately

    alert("Configuration GitHub sauvegardée !");
    closeGitHubConfig();
}

// Init GitHub Display on load
document.addEventListener('DOMContentLoaded', updateGitHubDisplay);


// ==================== PAGES FRAME IDE FUNCTIONS ====================

// Initialize Code Editor with Prism highlighting
function initializeCodeEditor() {
    const editor = document.getElementById('page-html-editor');
    const highlight = document.getElementById('page-html-highlight');
    const charCount = document.getElementById('html-char-count');

    if (!editor) return;

    // Update syntax highlighting on input
    editor.addEventListener('input', function () {
        const code = this.value;
        const highlightCode = highlight?.querySelector('code');

        if (highlightCode) {
            highlightCode.textContent = code;
            if (window.Prism) {
                Prism.highlightElement(highlightCode);
            }
        }

        // Update character count
        if (charCount) {
            charCount.textContent = `${code.length} caractères`;
        }
    });

    // Sync scroll between textarea and highlight
    editor.addEventListener('scroll', function () {
        if (highlight) {
            highlight.scrollTop = this.scrollTop;
            highlight.scrollLeft = this.scrollLeft;
        }
    });

    // Trigger initial highlight if there's content
    if (editor.value) {
        editor.dispatchEvent(new Event('input'));
    }
}

// Generate URL-friendly slug from title
function generateSlug(title) {
    return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

// Auto-generate slug when title changes
document.addEventListener('DOMContentLoaded', () => {
    const titleInput = document.getElementById('page-title');
    const slugInput = document.getElementById('page-slug');

    if (titleInput && slugInput) {
        titleInput.addEventListener('input', function () {
            slugInput.value = generateSlug(this.value);
        });
    }

    // Initialize code editor
    initializeCodeEditor();

    // Load saved pages on init
    loadSavedPages();
});

// Save page to localStorage
function savePage(status = 'published') {
    const title = document.getElementById('page-title')?.value.trim();
    const slug = document.getElementById('page-slug')?.value.trim();
    const metaDesc = document.getElementById('page-meta-desc')?.value.trim();
    const metaKeywords = document.getElementById('page-meta-keywords')?.value.trim();
    const thumbnail = document.getElementById('page-thumbnail')?.value.trim();
    // Get content from Monaco Editor (global variable from IDE.html)
    const htmlContent = (window.monacoEditor ? window.monacoEditor.getValue() : document.getElementById('page-html-editor')?.value || '').trim();
    const statusEl = document.getElementById('page-save-status');
    const statusBadge = document.getElementById('page-status-badge');

    // Validation
    if (!title) {
        if (statusEl) {
            statusEl.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>Le titre est requis</span>';
        }
        return;
    }

    if (!htmlContent) {
        if (statusEl) {
            statusEl.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>Le contenu HTML est requis</span>';
        }
        return;
    }

    // Create page object
    const page = {
        title,
        slug,
        metaDesc,
        metaKeywords,
        thumbnail,
        htmlContent,
        status: status, // 'draft' or 'published'
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // Get existing pages from localStorage
    let pages = [];
    try {
        const stored = localStorage.getItem('stackpages_custom_pages');
        if (stored) {
            pages = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error loading pages:', e);
    }

    // Check if page with same slug exists
    const existingIndex = pages.findIndex(p => p.slug === slug);
    if (existingIndex !== -1) {
        // Update existing page
        page.createdAt = pages[existingIndex].createdAt;
        pages[existingIndex] = page;
        if (statusEl) {
            const statusText = status === 'draft' ? 'brouillon sauvegardé' : 'page publiée';
            statusEl.innerHTML = `<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>Page mise à jour (${statusText})!</span>`;
        }
    } else {
        // Add new page
        pages.push(page);
        if (statusEl) {
            const statusText = status === 'draft' ? 'brouillon sauvegardé' : 'page publiée';
            statusEl.innerHTML = `<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>Page sauvegardée (${statusText})!</span>`;
        }
    }

    // Save to localStorage
    try {
        localStorage.setItem('stackpages_custom_pages', JSON.stringify(pages));
        loadSavedPages(); // Refresh the list

        // Update status badge
        if (statusBadge) {
            if (status === 'draft') {
                statusBadge.innerHTML = '<i class="fas fa-circle text-orange-500 mr-1" style="font-size: 6px;"></i> Brouillon';
                statusBadge.className = 'text-xs px-2 py-1 rounded bg-orange-900 text-orange-300';
            } else {
                statusBadge.innerHTML = '<i class="fas fa-circle text-green-500 mr-1" style="font-size: 6px;"></i> Publié';
                statusBadge.className = 'text-xs px-2 py-1 rounded bg-green-900 text-green-300';
            }
        }

        // Clear status message after 3 seconds
        setTimeout(() => {
            if (statusEl) statusEl.innerHTML = '';
        }, 3000);
    } catch (e) {
        console.error('Error saving page:', e);
        if (statusEl) {
            statusEl.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>Erreur lors de la sauvegarde</span>';
        }
    }
}

// Load saved pages from localStorage
function loadSavedPages() {
    const listEl = document.getElementById('saved-pages-list');
    if (!listEl) return;

    let pages = [];
    try {
        const stored = localStorage.getItem('stackpages_custom_pages');
        if (stored) {
            pages = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error loading pages:', e);
    }

    if (pages.length === 0) {
        listEl.innerHTML = '<div class="text-center py-12 text-slate-500"><i class="fas fa-folder-open text-4xl mb-3"></i><p class="text-lg">Aucune page sauvegardée</p><p class="text-sm mt-2">Cliquez sur "Nouvelle Page" pour commencer</p></div>';
        return;
    }

    // Sort by updated date (newest first)
    pages.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    listEl.innerHTML = pages.map((page, index) => `
            <div class="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition group mb-3">
            <div class="flex-1">
                <h4 class="font-medium text-slate-800 text-lg">${page.title}</h4>
                <div class="flex items-center gap-4 mt-2">
                    <span class="text-sm font-medium ${page.status === 'published' ? 'text-green-600' : 'text-yellow-600'}">
                        <i class="fas ${page.status === 'published' ? 'fa-check-circle' : 'fa-pencil-alt'} mr-1"></i>${page.status === 'published' ? 'Publié' : 'Brouillon'}
                    </span>
                    <span class="text-sm text-slate-500">
                        <i class="fas fa-link mr-1"></i>${page.slug}
                    </span>
                    <span class="text-sm text-slate-400">
                        <i class="far fa-clock mr-1"></i>${new Date(page.updatedAt).toLocaleDateString('fr-FR')}
                    </span>
                    ${page.metaDesc ? `<span class="text-xs text-slate-400 truncate max-w-md"><i class="fas fa-info-circle mr-1"></i>${page.metaDesc.substring(0, 60)}...</span>` : ''}
                </div>
            </div>
            <div class="flex items-center gap-2">
                <a href="/admin/IDE.html?page=${encodeURIComponent(page.slug)}"
                    class="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm hover:bg-orange-50 hover:border-orange-500 hover:text-orange-600 transition flex items-center gap-2">
                    <i class="fas fa-edit"></i> Éditer
                </a>
                <button onclick="previewSavedPage(${index})" 
                    class="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm hover:bg-blue-50 hover:border-blue-500 hover:text-blue-600 transition flex items-center gap-2">
                    <i class="fas fa-eye"></i> Aperçu
                </button>
                <button onclick="deletePage(${index})" 
                    class="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm hover:bg-red-50 hover:border-red-500 hover:text-red-600 transition flex items-center gap-2">
                    <i class="fas fa-trash-alt"></i> Supprimer
                </button>
            </div>
        </div >
            `).join('');
}

// Load a saved page into the editor (redirects to IDE.html)
function loadPageToEditor(index) {
    let pages = [];
    try {
        const stored = localStorage.getItem('stackpages_custom_pages');
        if (stored) {
            pages = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error loading pages:', e);
        return;
    }

    pages.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const page = pages[index];

    if (!page) return;

    // Redirect to IDE.html with page slug
    window.location.href = `/ admin / IDE.html ? page = ${encodeURIComponent(page.slug)} `;
}

// Delete a page
function deletePage(index) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette page ?')) {
        return;
    }

    let pages = [];
    try {
        const stored = localStorage.getItem('stackpages_custom_pages');
        if (stored) {
            pages = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error loading pages:', e);
        return;
    }

    pages.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    pages.splice(index, 1);

    try {
        localStorage.setItem('stackpages_custom_pages', JSON.stringify(pages));
        loadSavedPages();
    } catch (e) {
        console.error('Error deleting page:', e);
        alert('Erreur lors de la suppression de la page');
    }
}

// Preview current page in modal
function previewPage() {
    const title = document.getElementById('page-title')?.value.trim();
    const htmlContent = document.getElementById('page-html-editor')?.value.trim();
    const thumbnail = document.getElementById('page-thumbnail')?.value.trim();

    if (!title || !htmlContent) {
        alert('Veuillez remplir au moins le titre et le contenu HTML');
        return;
    }

    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('preview-modal');

    if (modalTitle) modalTitle.textContent = title;

    let previewHtml = '';
    if (thumbnail) {
        previewHtml += `<img src="${thumbnail}" alt="${title}" class="w-full rounded-lg mb-6" />`;
    }
    previewHtml += htmlContent;

    if (modalContent) modalContent.innerHTML = previewHtml;
    if (modal) modal.classList.remove('hidden');
}

// Preview a saved page
function previewSavedPage(index) {
    let pages = [];
    try {
        const stored = localStorage.getItem('stackpages_custom_pages');
        if (stored) {
            pages = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error loading pages:', e);
        return;
    }

    pages.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const page = pages[index];

    if (!page) return;

    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('preview-modal');

    if (modalTitle) modalTitle.textContent = page.title;

    let previewHtml = '';
    if (page.thumbnail) {
        previewHtml += `<img src="${page.thumbnail}" alt="${page.title}" class="w-full rounded-lg mb-6" />`;
    }
    previewHtml += page.htmlContent;

    if (modalContent) modalContent.innerHTML = previewHtml;
    if (modal) modal.classList.remove('hidden');
}

// Clear Pages Frame IDE form
function clearPageForm() {
    if (!confirm('Effacer tous les champs du formulaire ?')) {
        return;
    }

    document.getElementById('page-title').value = '';
    document.getElementById('page-slug').value = '';
    document.getElementById('page-meta-desc').value = '';
    document.getElementById('page-meta-keywords').value = '';
    document.getElementById('page-thumbnail').value = '';
    document.getElementById('page-html-editor').value = '';
    document.getElementById('page-save-status').innerHTML = '';

    // Reset syntax highlighting
    const editor = document.getElementById('page-html-editor');
    if (editor) {
        editor.dispatchEvent(new Event('input'));
    }
}

// Copy HTML code to clipboard
function copyHtmlCode() {
    const editor = document.getElementById('page-html-editor');
    if (!editor) return;

    const code = editor.value;

    if (!code) {
        alert('Aucun code à copier');
        return;
    }

    navigator.clipboard.writeText(code).then(() => {
        // Show success feedback
        const btn = event.target.closest('button');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copié!';
        btn.classList.add('text-green-600');

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('text-green-600');
        }, 2000);
    }).catch(err => {
        console.error('Error copying to clipboard:', err);
        alert('Erreur lors de la copie');
    });
}

// Load Published Pages for Frontend Builder View
function loadPublishedPages() {
    const container = document.getElementById('published-pages-container');
    const emptyState = document.getElementById('published-pages-empty');
    if (!container || !emptyState) return;

    container.innerHTML = '';

    const pages = JSON.parse(localStorage.getItem('stackpages_custom_pages') || '[]');
    const publishedPages = pages.filter(p => p.status === 'published');

    if (publishedPages.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    publishedPages.forEach(page => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-[#252526] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition group';

        const thumbnail = page.thumbnail || 'https://placehold.co/600x400/e2e8f0/64748b?text=No+Image';
        const date = new Date(page.updatedAt || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

        card.innerHTML = `
            <div class="relative h-48 overflow-hidden bg-slate-100 dark:bg-slate-800">
                <img src="${thumbnail}" alt="${page.title}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-4">
                    <span class="text-white text-xs font-medium px-2 py-1 bg-green-500/80 backdrop-blur-sm rounded-full">
                        <i class="fas fa-check-circle mr-1"></i> Publié
                    </span>
                </div>
            </div>
            <div class="p-5">
                <h4 class="font-bold text-slate-800 dark:text-white text-lg mb-2 truncate" title="${page.title}">${page.title}</h4>
                <p class="text-slate-500 dark:text-slate-400 text-sm mb-4 line-clamp-2 h-10">
                    ${page.metaDesc || 'Aucune description disponible.'}
                </p>
                
                <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
                    <span class="text-xs text-slate-400">
                        <i class="far fa-clock mr-1"></i> ${date}
                    </span>
                    <div class="flex gap-2">
                        <a href="/ide?page=${encodeURIComponent(page.slug)}" 
                           class="text-blue-600 hover:text-blue-800 font-medium text-xs uppercase tracking-wide">
                            Éditer
                        </a>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// GitHub Integration
function getGitHubConfig() {
    const owner = localStorage.getItem('stackpages_gh_owner');
    const repo = localStorage.getItem('stackpages_gh_repo');
    const token = localStorage.getItem('stackpages_gh_token');
    return { owner, repo, token };
}

async function publishToGitHub() {
    const { owner, repo, token } = getGitHubConfig();

    if (!owner || !repo || !token) {
        alert("Configuration GitHub manquante. Veuillez configurer votre dépôt dans les paramètres.");
        // Open GitHub config modal if possible
        const modal = document.getElementById('github-modal');
        if (modal) modal.classList.remove('hidden');
        return;
    }

    const title = document.getElementById('page-title').value.trim();
    const slug = document.getElementById('page-slug').value.trim();
    const htmlContent = monacoEditor ? monacoEditor.getValue().trim() : '';

    if (!title || !slug || !htmlContent) {
        alert("Veuillez remplir le titre et le contenu de la page.");
        return;
    }

    const btn = document.getElementById('btn-publish-github');
    const originalBtnContent = btn.innerHTML;

    // UI Loading
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Publication...';

    try {
        const path = `content/pages/${slug}.html`;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

        // 1. Check if file exists to get SHA (for update)
        let sha = null;
        const checkRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (checkRes.ok) {
            const data = await checkRes.json();
            sha = data.sha;
        }

        // 2. Prepare content (Base64 encode with UTF-8 support)
        const contentEncoded = btoa(unescape(encodeURIComponent(htmlContent)));

        // 3. Create/Update file
        const body = {
            message: `Update page: ${title} (${slug})`,
            content: contentEncoded,
            branch: localStorage.getItem('stackpages_gh_branch') || 'main'
        };

        if (sha) {
            body.sha = sha;
        }

        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!putRes.ok) {
            const errorData = await putRes.json();
            throw new Error(errorData.message || "Erreur lors de la publication sur GitHub");
        }

        // Success
        btn.innerHTML = '<i class="fas fa-check"></i> Publié !';
        btn.classList.remove('bg-gray-800', 'hover:bg-gray-900');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');

        // Also save locally as published
        savePage('published');

        setTimeout(() => {
            btn.innerHTML = originalBtnContent;
            btn.disabled = false;
            btn.classList.add('bg-gray-800', 'hover:bg-gray-900');
            btn.classList.remove('bg-green-600', 'hover:bg-green-700');
        }, 3000);

    } catch (error) {
        console.error("GitHub Publish Error:", error);
        alert(`Erreur: ${error.message}`);
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erreur';
        btn.classList.add('bg-red-600');

        setTimeout(() => {
            btn.innerHTML = originalBtnContent;
            btn.disabled = false;
            btn.classList.remove('bg-red-600');
        }, 3000);
    }
}

async function saveAsTheme() {
    const { owner, repo, token } = getGitHubConfig();

    if (!owner || !repo || !token) {
        alert("Configuration GitHub manquante. Veuillez configurer votre dépôt dans les paramètres.");
        const modal = document.getElementById('github-modal');
        if (modal) modal.classList.remove('hidden');
        return;
    }

    const htmlContent = monacoEditor ? monacoEditor.getValue().trim() : '';

    if (!htmlContent) {
        alert("L'éditeur est vide. Veuillez générer ou écrire du code HTML.");
        return;
    }

    // Prompt for filename
    let filename = prompt("Nom du fichier de thème (ex: mon-theme.html) :", "nouveau-theme.html");
    if (!filename) return; // User cancelled

    filename = filename.trim();
    if (!filename.endsWith('.html')) {
        filename += '.html';
    }

    const btn = document.getElementById('btn-save-theme');
    const originalBtnContent = btn.innerHTML;

    // UI Loading
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sauvegarde...';

    try {
        const path = `frontend/${filename}`;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

        // 1. Check if file exists to get SHA (for update)
        let sha = null;
        const checkRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (checkRes.ok) {
            const data = await checkRes.json();
            sha = data.sha;
            if (!confirm(`Le thème "${filename}" existe déjà. Voulez-vous l'écraser ?`)) {
                throw new Error("Sauvegarde annulée par l'utilisateur.");
            }
        }

        // 2. Prepare content (Base64 encode with UTF-8 support)
        const contentEncoded = btoa(unescape(encodeURIComponent(htmlContent)));

        // 3. Create/Update file
        const body = {
            message: `Add/Update theme: ${filename}`,
            content: contentEncoded,
            branch: localStorage.getItem('stackpages_gh_branch') || 'main'
        };

        if (sha) {
            body.sha = sha;
        }

        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!putRes.ok) {
            const errorData = await putRes.json();
            throw new Error(errorData.message || "Erreur lors de la sauvegarde du thème sur GitHub");
        }

        // Success
        btn.innerHTML = '<i class="fas fa-check"></i> Sauvegardé !';
        btn.classList.remove('bg-purple-600', 'hover:bg-purple-700');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');

        alert(`Thème "${filename}" sauvegardé avec succès dans le dossier frontend/ !`);

        setTimeout(() => {
            btn.innerHTML = originalBtnContent;
            btn.disabled = false;
            btn.classList.add('bg-purple-600', 'hover:bg-purple-700');
            btn.classList.remove('bg-green-600', 'hover:bg-green-700');
        }, 3000);

    } catch (error) {
        console.error("Theme Save Error:", error);
        if (error.message !== "Sauvegarde annulée par l'utilisateur.") {
            alert(`Erreur: ${error.message}`);
        }
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erreur';
        btn.classList.add('bg-red-600');

        setTimeout(() => {
            btn.innerHTML = originalBtnContent;
            btn.disabled = false;
            btn.classList.remove('bg-red-600');
        }, 3000);
    }
}
