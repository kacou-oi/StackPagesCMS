// State
let allPosts = [];
let metadata = {};
let config = {};

// Init
// Init
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (window.location.pathname.includes('dashboard.html')) {
        await loadData();
        await loadConfig();
        renderDashboard();
        renderContentTable();
    }
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

// Domain Logic
async function saveDomain() {
    const domain = document.getElementById('domain-input').value.trim();
    if (!domain) return;

    // Update config object
    config.domain = domain;

    // Save via existing saveConfig logic (reusing the endpoint)
    // We construct a temporary form-like object or just call the API directly
    // But since saveConfig reads from the DOM form, we should probably just update the config object and save it.
    // However, saveConfig reads from specific IDs. Let's just call the API directly here for simplicity.

    const btn = document.querySelector('button[onclick="saveDomain()"]');
    const originalText = btn.innerText;
    btn.innerText = 'Enregistrement...';
    btn.disabled = true;

    try {
        // We need to include all other config fields to avoid overwriting them with nulls if we used a partial update
        // But the easiest way is to just update the local config object and send it all back.
        // Ensure local config is up to date with form values first? 
        // Actually, let's just send the current config object + new domain.

        const res = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Key': localStorage.getItem('stackpages_auth')
            },
            body: JSON.stringify(config)
        });

        if (res.ok) {
            document.getElementById('dns-config-section').classList.remove('hidden');
            setTimeout(() => document.getElementById('dns-config-section').classList.remove('opacity-50'), 50);

            document.getElementById('domain-verify-section').classList.remove('hidden');
            setTimeout(() => document.getElementById('domain-verify-section').classList.remove('opacity-50'), 50);

            btn.innerText = 'Enregistré !';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.disabled = false;
            }, 2000);
        } else {
            alert('Erreur lors de la sauvegarde.');
            btn.innerText = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        alert('Erreur réseau.');
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function verifyDomain() {
    const domain = document.getElementById('domain-input').value.trim();
    const statusDiv = document.getElementById('domain-status');

    statusDiv.innerHTML = '<span class="text-slate-500"><i class="fas fa-circle-notch fa-spin"></i> Vérification...</span>';

    try {
        const res = await fetch(`/api/domain-check?domain=${encodeURIComponent(domain)}`, {
            headers: {
                'X-Auth-Key': localStorage.getItem('stackpages_auth')
            }
        });

        const data = await res.json();

        if (data.active) {
            statusDiv.innerHTML = '<span class="text-green-600 font-bold"><i class="fas fa-check-circle"></i> Domaine Actif</span>';
        } else {
            statusDiv.innerHTML = '<span class="text-orange-600 font-bold"><i class="fas fa-exclamation-circle"></i> En attente de propagation</span>';
        }
    } catch (err) {
        statusDiv.innerHTML = '<span class="text-red-600 font-bold"><i class="fas fa-times-circle"></i> Erreur de vérification</span>';
    }
}

// Data Loading
async function loadData() {
    try {
        const [metaRes, postsRes] = await Promise.all([
            fetch('/api/metadata'),
            fetch('/api/posts')
        ]);

        metadata = await metaRes.json();
        allPosts = await postsRes.json();

        // Update Stats
        document.getElementById('stat-total-posts').textContent = allPosts.length;
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
            document.getElementById('conf-metaTitle').value = config.metaTitle || '';
            document.getElementById('conf-metaDesc').value = config.metaDescription || '';
            document.getElementById('conf-metaKeywords').value = config.metaKeywords || '';

            // Domain Config
            if (config.domain) {
                document.getElementById('domain-input').value = config.domain;
                document.getElementById('dns-config-section').classList.remove('hidden', 'opacity-50');
                document.getElementById('domain-verify-section').classList.remove('hidden', 'opacity-50');
            }
        }
    } catch (err) {
        console.error('Error loading config:', err);
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
    const tbody = document.getElementById('dashboard-recent-posts');
    if (!tbody) return;

    tbody.innerHTML = allPosts.slice(0, 5).map(post => `
        <tr class="hover:bg-slate-50 transition">
            <td class="px-6 py-4 font-medium text-slate-800 truncate max-w-xs">${post.title}</td>
            <td class="px-6 py-4 text-slate-500">${new Date(post.pubDate).toLocaleDateString('fr-FR')}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="openPreview('${post.slug}')" class="text-orange-500 hover:text-orange-700 font-medium text-xs uppercase tracking-wide">Voir</button>
            </td>
        </tr>
    `).join('');
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
