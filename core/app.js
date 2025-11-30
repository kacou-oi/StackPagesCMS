async function init() {
    try {
        const res = await fetch('/api/user');
        if (!res.ok) {
            // Check if admin is logged in (fallback)
            const adminAuth = localStorage.getItem('stackpages_auth');
            if (adminAuth) {
                // Admin is logged in, show admin info
                document.getElementById('user-name').textContent = 'Admin';
                document.getElementById('welcome-name').textContent = 'Admin';
                loadPages();
                return;
            }
            // Not logged in at all, redirect to login
            window.location.href = '/';
            return;
        }
        const user = await res.json();

        document.getElementById('user-name').textContent = user.name;
        document.getElementById('welcome-name').textContent = user.name.split(' ')[0];
        if (user.avatar_url) document.getElementById('user-avatar').src = user.avatar_url;

        loadPages();

    } catch (e) {
        console.error("Auth Error:", e);
        // Check if admin is logged in (fallback)
        const adminAuth = localStorage.getItem('stackpages_auth');
        if (adminAuth) {
            document.getElementById('user-name').textContent = 'Admin';
            document.getElementById('welcome-name').textContent = 'Admin';
            loadPages();
            return;
        }
        window.location.href = '/';
    }
}

async function loadPages() {
    // For now, loading from localStorage as per current architecture
    // In a real SaaS, this would fetch from /api/pages which would query D1 based on user ID
    const stored = localStorage.getItem('stackpages_custom_pages');
    const pages = stored ? JSON.parse(stored) : [];

    const tbody = document.getElementById('pages-table-body');
    document.getElementById('stats-pages').textContent = pages.length;

    if (pages.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-8 text-center text-slate-400">
                    Aucune page créée pour le moment.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = pages.map(page => `
        <tr class="hover:bg-slate-50 transition group">
            <td class="px-6 py-4 font-medium text-slate-900">${page.title || 'Sans titre'}</td>
            <td class="px-6 py-4 font-mono text-xs text-slate-500">/${page.slug}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 rounded-full text-xs font-medium ${page.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}">
                    ${page.status === 'published' ? 'Publié' : 'Brouillon'}
                </span>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                    <a href="/p/${page.slug}" target="_blank" class="p-2 text-slate-400 hover:text-blue-600 transition" title="Voir">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                    <a href="/visual-editor?page=${page.slug}" class="p-2 text-slate-400 hover:text-orange-500 transition" title="Éditer">
                        <i class="fas fa-pen"></i>
                    </a>
                </div>
            </td>
        </tr>
    `).join('');
}

async function logout() {
    await fetch('/api/logout');
    localStorage.removeItem('stackpages_auth'); // Clear admin auth too
    window.location.href = '/';
}

init();
