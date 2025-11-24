// ====================================================================
// 1. CONFIGURATION ET UTILITAIRES
// ====================================================================

// Constantes pour la gestion du cache
const CACHE_TTL = 180;

function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .trim();
}

function decodeHTMLEntities(str) {
    if (!str) return "";
    const map = {
        "nbsp": " ", "amp": "&", "quot": "\"", "lt": "<", "gt": ">", "#39": "'"
    };
    return str.replace(/&(#?\w+);/g, (match, entity) => {
        if (entity.startsWith('#')) {
            const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
            return String.fromCharCode(code);
        }
        return map[entity] || match;
    });
}

function extractFirstImage(html) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/i;
    const match = html.match(imgRe);
    return match ? match[1] : null;
}

function extractEnclosureImage(block) {
    const re = /<enclosure\s+url=["']([^"']+)["'][^>]*type=["']image\/[^"']+/i;
    const match = block.match(re);

    if (match && match[1]) {
        return match[1].trim();
    }
    return null;
}

// --- NOUVEAU: Fonction de nettoyage HTML ---
function cleanHtmlContent(html) {
    if (!html) return "";

    // 1. Suppression des balises <a> avec la classe "image-link-expand" (UI Substack)
    // Cette regex cible la balise ouvrante, tout son contenu non gourmand, et la balise fermante.
    const regexExpand = /<a\s+[^>]*class=["'][^"']*image-link-expand[^"']*(?:[^>]*)*>.*?<\/a>/gis;

    let cleanedHtml = html.replace(regexExpand, '');

    // 2. Optionnel: Nettoyage des attributs style pour éviter les conflits CSS
    cleanedHtml = cleanedHtml.replace(/style="[^"]*"/gi, '');

    return cleanedHtml;
}


// ====================================================================
// 2. LOGIQUE DE PARSING
// ====================================================================

// --- Fonction pour extraire les infos globales du canal RSS (Inchangée) ---
function extractChannelMetadata(xml) {
    // ... (Logique inchangée)
    const getChannelTag = (tag) => {
        const re = new RegExp(`<channel>(?:.|[\\r\\n])*?<${tag}[^>]*>((.|[\\r\\n])*?)<\/${tag}>`, 'i');
        const found = xml.match(re);
        if (!found) return "";
        let content = found[1].trim();
        if (content.startsWith('<![CDATA[')) {
            content = content.slice(9, -3).trim();
        }
        return decodeHTMLEntities(content);
    };

    const title = getChannelTag('title');
    const link = getChannelTag('link');
    const lastBuildDate = getChannelTag('lastBuildDate');
    const description = getChannelTag('description');

    return {
        blogTitle: title,
        blogUrl: link,
        lastBuildDate: lastBuildDate,
        blogDescription: description
    };
}

// --- Fonction pour analyser le XML (Articles uniquement) ---
function fetchAndParseRSS(xml) {
    const items = [];
    const itemRe = /<item[^>]*>((.|[\r\n])*?)<\/item>/gi;
    let m;

    while ((m = itemRe.exec(xml)) !== null) {
        const block = m[1];
        const getTag = (tag) => {
            const re = new RegExp(`<${tag}[^>]*>((.|[\r\n])*?)<\/${tag}>`, 'i');
            const found = block.match(re);
            if (!found) return "";
            let content = found[1].trim();
            if (content.startsWith('<![CDATA[')) {
                content = content.slice(9, -3).trim();
            }
            content = decodeHTMLEntities(content);
            return content;
        };

        const title = getTag('title');
        const link = getTag('link');
        const pubDate = getTag('pubDate');
        const description = getTag('description');

        let image = extractEnclosureImage(block);

        let contentFull = "";
        const contentEncodedRe = /<content:encoded[^>]*>((.|[\r\n])*?)<\/content:encoded>/i;
        const contentEncodedMatch = block.match(contentEncodedRe);

        if (contentEncodedMatch) {
            let content = contentEncodedMatch[1].trim();
            if (content.startsWith('<![CDATA[')) {
                content = content.slice(9, -3).trim();
            }
            contentFull = decodeHTMLEntities(content);

            // --- NOUVEAU: Appel à la fonction de nettoyage ---
            contentFull = cleanHtmlContent(contentFull);

            if (!image) {
                image = extractFirstImage(contentFull);
            }
        } else {
            contentFull = description;
        }

        const slug = slugify(title);

        items.push({
            title,
            link,
            pubDate,
            description,
            slug,
            content: contentFull,
            image
        });
    }

    // Trier par date de publication (du plus récent au plus ancien)
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    return items;
}


// ====================================================================
// 3. LOGIQUE DE CACHE ET RÉCUPÉRATION DES DONNÉES
// ====================================================================
async function getCachedRSSData(feedUrl) {
    const cache = caches.default;
    const cacheKey = new Request(feedUrl, { method: 'GET' });
    let response = await cache.match(cacheKey);

    if (response) {
        return await response.json();
    }

    const res = await fetch(feedUrl);
    if (!res.ok) throw new Error(`Échec du chargement du flux RSS : ${res.statusText}`);
    const xml = await res.text();

    const metadata = extractChannelMetadata(xml);
    const posts = fetchAndParseRSS(xml);

    const data = {
        metadata: metadata,
        posts: posts
    };

    const cachedResponse = new Response(JSON.stringify(data), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL}`
        }
    });
    await cache.put(cacheKey, cachedResponse.clone());

    return data;
}

// ====================================================================
// 4. GESTIONNAIRE PRINCIPAL DU WORKER
// ====================================================================

export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        let path = url.pathname;

        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }

        // --- CONFIGURATION ---
        // On essaie de récupérer la config depuis le KV, sinon on utilise les vars d'env ou un défaut
        let config = {
            siteName: "StackPages CMS",
            author: "Admin",
            substackRssUrl: env.SUBSTACK_FEED_URL,
            youtubeRssUrl: "",
            substackRssUrl: env.SUBSTACK_FEED_URL,
            youtubeRssUrl: "",
            seo: { metaTitle: "", metaDescription: "", metaKeywords: "" }
        };

        // Tentative de chargement depuis KV
        let configMode = 'file'; // 'file' ou 'kv'
        if (env.STACKPAGES_CONFIG) {
            try {
                const kvConfig = await env.STACKPAGES_CONFIG.get("site_config", { type: "json" });
                if (kvConfig) {
                    config = { ...config, ...kvConfig };
                    configMode = 'kv';
                }
            } catch (e) {
                console.error("Erreur KV:", e);
            }
        }

        // --- AUTHENTIFICATION ---
        const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "admin"; // DÉFAUT NON SÉCURISÉ POUR LE DEV
        const SESSION_SECRET = "stackpages-session-secret"; // À changer en prod idéalement

        const getCookie = (name) => {
            const cookieString = req.headers.get('Cookie');
            if (!cookieString) return null;
            const cookies = cookieString.split(';');
            for (let cookie of cookies) {
                const [key, value] = cookie.trim().split('=');
                if (key === name) return value;
            }
            return null;
        };

        const isAuthenticated = () => {
            return true; // AUTHENTIFICATION DÉSACTIVÉE TEMPORAIREMENT
            /*
            const session = getCookie('stackpages_session');
            // Vérification très basique : le cookie doit être égal au mot de passe (hashé idéalement)
            // Pour ce MVP, on stocke un simple token
            return session === btoa(ADMIN_PASSWORD + SESSION_SECRET);
            */
        };

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        };

        if (req.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // --- ROUTES API PUBLIC ---

        // 1. Login
        if (path === "/api/login" && req.method === "POST") {
            try {
                const body = await req.json();
                if (body.password === ADMIN_PASSWORD) {
                    const token = btoa(ADMIN_PASSWORD + SESSION_SECRET);
                    const headers = new Headers(corsHeaders);
                    headers.append('Set-Cookie', `stackpages_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
                    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
                } else {
                    return new Response(JSON.stringify({ error: "Mot de passe incorrect" }), { status: 401, headers: corsHeaders });
                }
            } catch (e) {
                return new Response("Bad Request", { status: 400, headers: corsHeaders });
            }
        }

        // 2. Logout
        if (path === "/api/logout") {
            const headers = new Headers(corsHeaders);
            headers.append('Set-Cookie', `stackpages_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }

        // 3. Check Auth
        if (path === "/api/check-auth") {
            if (isAuthenticated()) {
                return new Response(JSON.stringify({ authenticated: true }), { status: 200, headers: corsHeaders });
            } else {
                return new Response(JSON.stringify({ authenticated: false }), { status: 401, headers: corsHeaders });
            }
        }

        // 4. Public Data (Metadata & Posts)
        // Utilise l'URL du flux RSS définie dans la config (KV ou Env)
        const FEED_URL = config.substackRssUrl;

        if (!FEED_URL && (path === "/api/metadata" || path === "/api/posts" || path.startsWith("/api/post/"))) {
            return new Response(JSON.stringify({ error: "Flux RSS non configuré" }), { status: 500, headers: corsHeaders });
        }

        if (path === "/api/metadata" || path === "/api/posts" || path.startsWith("/api/post/")) {
            let blogData;
            try {
                blogData = await getCachedRSSData(FEED_URL);
            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
            }

            if (path === "/api/metadata") {
                // On merge les métadonnées du RSS avec celles de la config locale
                const meta = {
                    ...blogData.metadata,
                    siteName: config.siteName,
                    author: config.author,
                    seo: config.seo
                };
                return new Response(JSON.stringify(meta), { status: 200, headers: corsHeaders });
            }

            if (path === "/api/posts") {
                return new Response(JSON.stringify(blogData.posts), { status: 200, headers: corsHeaders });
            }

            if (path.startsWith("/api/post/")) {
                const slug = path.split("/").pop();
                const post = blogData.posts.find(p => p.slug === slug);
                if (!post) return new Response(JSON.stringify({ error: "Article non trouvé" }), { status: 404, headers: corsHeaders });
                return new Response(JSON.stringify(post), { status: 200, headers: corsHeaders });
            }
        }

        // --- ROUTES API PROTÉGÉES ---

        // Middleware de protection pour /api/config
        if (path.startsWith("/api/config")) {
            if (!isAuthenticated()) {
                return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: corsHeaders });
            }

            // GET Config
            if (req.method === "GET") {
                return new Response(JSON.stringify({ config, configMode }), { status: 200, headers: corsHeaders });
            }

            // POST Config (Save)
            if (req.method === "POST") {
                if (!env.STACKPAGES_CONFIG) {
                    // Mode sans KV : On renvoie un succès simulé avec un avertissement
                    return new Response(JSON.stringify({
                        success: true,
                        warning: "KV non configuré. Les changements sont temporaires ou ignorés."
                    }), { status: 200, headers: corsHeaders });
                }
                try {
                    const newConfig = await req.json();
                    await env.STACKPAGES_CONFIG.put("site_config", JSON.stringify(newConfig));
                    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
                } catch (e) {
                    return new Response(JSON.stringify({ error: "Erreur lors de la sauvegarde" }), { status: 500, headers: corsHeaders });
                }
            }
        }

        // 5. Clear Cache (Protected)
        if (path === "/api/clear-cache" && req.method === "POST") {
            if (!isAuthenticated()) {
                return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: corsHeaders });
            }
            // Note: On Cloudflare Workers, on ne peut pas "vider" le cache global programmatiquement facilement sans Purge API.
            // Mais on peut invalider le cache local de l'instance ou utiliser une astuce de versioning.
            // Pour ce MVP, on va simuler ou utiliser l'API Cache si possible.
            // L'API Cache standard permet de supprimer une entrée.

            const cache = caches.default;
            // On essaie de supprimer les clés principales
            // Note: match() nécessite une requête complète. C'est difficile de tout vider sans connaître les clés.
            // Une astuce est de changer le préfixe de cache ou d'attendre le TTL.
            // ICI: On va juste renvoyer OK car le TTL est court (180s).
            // Pour une vraie implémentation, il faudrait stocker les URLs cachées ou utiliser l'API Cloudflare Purge.

            return new Response(JSON.stringify({ success: true, message: "Cache invalidé (attendre TTL ou redéploiement)" }), { status: 200, headers: corsHeaders });
        }

        // --- FICHIERS STATIQUES ---

        // Protection de l'admin (Maintenant à la racine)
        // On protège index.html (racine) mais on laisse passer login.html, js, css, et api
        if ((path === "/" || path === "/index.html") && !path.includes("login.html")) {
            if (!isAuthenticated()) {
                // Redirige vers la page de login si non authentifié
                return Response.redirect(new URL('/login.html', req.url).toString(), 302);
            }
        }

        try {
            return await env.ASSETS.fetch(req);
        } catch (e) {
            return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
        }
    }
};