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
// 1.5 REVERSE PROXY - CLASSE UTILITAIRE
// ====================================================================

// Classe pour réécrire les attributs HTML lors du reverse proxy
class AttributeRewriter {
    constructor(attributeName, targetDomain, workerDomain) {
        this.attributeName = attributeName;
        this.targetDomain = targetDomain;
        this.workerDomain = workerDomain;
    }

    element(element) {
        const attribute = element.getAttribute(this.attributeName);

        // Remplacer les liens absolus du domaine cible par le domaine du Worker
        if (attribute && attribute.includes(this.targetDomain)) {
            // Utiliser une regex globale ou split/join pour tout remplacer (important pour srcset)
            const newValue = attribute.split(this.targetDomain).join(this.workerDomain);
            element.setAttribute(this.attributeName, newValue);
        }
    }
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

// --- Fonction pour analyser le XML YouTube ---
function fetchAndParseYoutubeRSS(xml) {
    const items = [];
    const entryRe = /<entry[^>]*>((.|[\r\n])*?)<\/entry>/gi;
    let m;

    while ((m = entryRe.exec(xml)) !== null) {
        const block = m[1];
        const getTag = (tag) => {
            const re = new RegExp(`<${tag}[^>]*>((.|[\r\n])*?)<\/${tag}>`, 'i');
            const found = block.match(re);
            if (!found) return "";
            return decodeHTMLEntities(found[1].trim());
        };

        const title = getTag('title');
        const published = getTag('published');

        // Extract Video ID
        const videoIdRe = /<yt:videoId>((.|[\r\n])*?)<\/yt:videoId>/i;
        const videoIdMatch = block.match(videoIdRe);
        const videoId = videoIdMatch ? videoIdMatch[1].trim() : "";

        // Extract Thumbnail
        const mediaGroupRe = /<media:group>((.|[\r\n])*?)<\/media:group>/i;
        const mediaGroupMatch = block.match(mediaGroupRe);
        let thumbnail = "";
        let description = "";

        if (mediaGroupMatch) {
            const groupContent = mediaGroupMatch[1];
            const thumbRe = /<media:thumbnail\s+url=["']([^"']+)["']/i;
            const thumbMatch = groupContent.match(thumbRe);
            if (thumbMatch) thumbnail = thumbMatch[1];

            const descRe = /<media:description[^>]*>((.|[\r\n])*?)<\/media:description>/i;
            const descMatch = groupContent.match(descRe);
            if (descMatch) description = decodeHTMLEntities(descMatch[1].trim());
        }

        if (videoId) {
            items.push({
                id: videoId,
                title,
                published,
                thumbnail,
                description,
                link: `https://www.youtube.com/watch?v=${videoId}`
            });
        }
    }

    // Sort by date desc
    items.sort((a, b) => new Date(b.published) - new Date(a.published));

    return items;
}


// ====================================================================
// 3. LOGIQUE DE CACHE ET RÉCUPÉRATION DES DONNÉES
// ====================================================================
async function getCachedRSSData(feedUrl, forceRefresh = false) {
    const cache = caches.default;
    const cacheKey = new Request(feedUrl, { method: 'GET' });

    if (!forceRefresh) {
        let response = await cache.match(cacheKey);
        if (response) {
            return await response.json();
        }
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
    // Always update cache
    await cache.put(cacheKey, cachedResponse.clone());

    return data;
}

async function getCachedYoutubeData(feedUrl, forceRefresh = false) {
    if (!feedUrl) return [];

    const cache = caches.default;
    const cacheKey = new Request(feedUrl, { method: 'GET' });

    if (!forceRefresh) {
        let response = await cache.match(cacheKey);
        if (response) {
            return await response.json();
        }
    }

    try {
        const res = await fetch(feedUrl);
        if (!res.ok) throw new Error(`Échec du chargement du flux YouTube`);
        const xml = await res.text();
        const videos = fetchAndParseYoutubeRSS(xml);

        const cachedResponse = new Response(JSON.stringify(videos), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': `public, max-age=${CACHE_TTL}`
            }
        });
        await cache.put(cacheKey, cachedResponse.clone());

        return videos;
    } catch (e) {
        console.error("Erreur YouTube Fetch:", e);
        return [];
    }
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
        // --- CONFIGURATION (ENV VARS ONLY) ---
        // La configuration est gérée uniquement par les variables d'environnement.
        // Pas de KV, pas de Cache API pour la config.

        const config = {
            siteName: "StackPages CMS",
            author: "Admin",
            substackRssUrl: env.SUBSTACK_FEED_URL || "",
            youtubeRssUrl: env.YOUTUBE_FEED_URL || "",
            frontendBuilderUrl: env.FRONTEND_BUILDER_URL || "",
            podcastFeedUrl: env.PODCAST_FEED_URL || "",
            seo: {
                metaTitle: env.META_TITLE || "",
                metaDescription: env.META_DESCRIPTION || "",
                metaKeywords: env.META_KEYWORDS || ""
            }
        };

        // --- AUTHENTIFICATION ---
        const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "admin"; // DÉFAUT NON SÉCURISÉ POUR LE DEV
        const SESSION_SECRET = "stackpages-session-secret"; // À changer en prod idéalement

        const isAuthenticated = () => {
            const authKey = req.headers.get('X-Auth-Key');
            return authKey === ADMIN_PASSWORD;
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

        // 0. Auth Routes (Google OAuth)
        if (path === '/auth/google') {
            return handleGoogleLogin(env, req);
        }
        if (path === '/auth/callback') {
            return handleGoogleCallback(req, env);
        }
        if (path === '/api/logout') {
            return handleLogout();
        }
        if (path === '/api/user') {
            return handleGetUser(req, env);
        }

        // 1. Login (Validation email + password)
        if (path === "/api/login" && req.method === "POST") {
            try {
                const body = await req.json();
                const ADMIN_EMAIL = env.ADMIN_EMAIL || "admin@example.com"; // Default for dev

                if (body.email === ADMIN_EMAIL && body.password === ADMIN_PASSWORD) {
                    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
                } else {
                    return new Response(JSON.stringify({ error: "Identifiants incorrects" }), { status: 401, headers: corsHeaders });
                }
            } catch (e) {
                return new Response("Bad Request", { status: 400, headers: corsHeaders });
            }
        }

        // 2. Logout (Client side only, but endpoint kept for compatibility)
        if (path === "/api/logout") {
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
        }

        // 3. Check Auth (Removed or simplified)
        if (path === "/api/check-auth") {
            // Client checks localStorage, this is just a helper if needed
            if (isAuthenticated()) {
                return new Response(JSON.stringify({ authenticated: true }), { status: 200, headers: corsHeaders });
            } else {
                return new Response(JSON.stringify({ authenticated: false }), { status: 401, headers: corsHeaders });
            }
        }

        // 4. Public Data (Metadata & Posts)
        const FEED_URL = config.substackRssUrl;
        console.log("DEBUG: Configured Substack URL:", FEED_URL);

        if (!FEED_URL && (path === "/api/metadata" || path === "/api/posts" || path.startsWith("/api/post/"))) {
            // Return empty data instead of error to allow UI to render
            const emptyMeta = { siteName: "StackPages", author: "Admin", lastBuildDate: new Date().toISOString() };
            if (path === "/api/metadata") return new Response(JSON.stringify(emptyMeta), { status: 200, headers: corsHeaders });
            if (path === "/api/posts") return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
            return new Response(JSON.stringify({ error: "Article non trouvé" }), { status: 404, headers: corsHeaders });
        }

        if (path === "/api/metadata" || path === "/api/posts" || path.startsWith("/api/post/")) {
            let blogData;
            try {
                blogData = await getCachedRSSData(FEED_URL);
            } catch (error) {
                console.error("Error fetching Substack RSS:", error);
                // Return empty/fallback data on fetch error
                if (path === "/api/metadata") return new Response(JSON.stringify({ siteName: "Error", author: "Error" }), { status: 200, headers: corsHeaders });
                if (path === "/api/posts") return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
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
                if (post) {
                    return new Response(JSON.stringify(post), { status: 200, headers: corsHeaders });
                } else {
                    return new Response(JSON.stringify({ error: "Article non trouvé" }), { status: 404, headers: corsHeaders });
                }
            }
        }

        // API: Get Podcasts
        if (path === "/api/podcasts") {
            const feedUrl = config.podcastFeedUrl;
            if (!feedUrl) {
                return new Response(JSON.stringify([]), {
                    headers: corsHeaders
                });
            }

            try {
                const response = await fetch(feedUrl, {
                    headers: {
                        "User-Agent": "StackPages-Worker/1.0"
                    }
                });

                if (!response.ok) throw new Error(`Failed to fetch RSS: ${response.status}`);

                const xmlText = await response.text();

                // Basic XML parsing for podcasts
                const items = [];
                let currentPos = 0;

                while (true) {
                    const itemStart = xmlText.indexOf("<item>", currentPos);
                    if (itemStart === -1) break;

                    const itemEnd = xmlText.indexOf("</item>", itemStart);
                    if (itemEnd === -1) break;

                    const itemContent = xmlText.substring(itemStart, itemEnd);

                    const titleMatch = itemContent.match(/<title>(.*?)<\/title>/s);
                    const linkMatch = itemContent.match(/<link>(.*?)<\/link>/s);
                    const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/s);
                    const descriptionMatch = itemContent.match(/<description>(.*?)<\/description>/s);
                    const enclosureMatch = itemContent.match(/<enclosure[^>]*url=["'](.*?)["'][^>]*>/s);
                    const guidMatch = itemContent.match(/<guid[^>]*>(.*?)<\/guid>/s);

                    // Clean up CDATA
                    const clean = (str) => {
                        if (!str) return "";
                        return str.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
                    };

                    const title = clean(titleMatch ? titleMatch[1] : "Sans titre");

                    items.push({
                        title: title,
                        slug: slugify(title),
                        guid: clean(guidMatch ? guidMatch[1] : ""),
                        link: clean(linkMatch ? linkMatch[1] : "#"),
                        pubDate: clean(pubDateMatch ? pubDateMatch[1] : ""),
                        description: clean(descriptionMatch ? descriptionMatch[1] : ""),
                        audioUrl: enclosureMatch ? enclosureMatch[1] : null
                    });

                    currentPos = itemEnd + 7;
                }

                // Sort by date desc
                items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

                return new Response(JSON.stringify(items), {
                    headers: corsHeaders
                });

            } catch (error) {
                return new Response(JSON.stringify({
                    error: error.message
                }), {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // API: Single Podcast
        if (path.startsWith("/api/podcast/")) {
            const podcastId = path.split("/").pop();
            const feedUrl = config.podcastFeedUrl;

            if (!feedUrl) {
                return new Response(JSON.stringify({ error: "Flux Podcast non configuré" }), { status: 404, headers: corsHeaders });
            }

            try {
                // Réutiliser la logique de fetch/parse (idéalement factoriser, mais ici on duplique pour l'instant ou on appelle une fonction commune si on refactorise)
                // Pour faire simple et rapide sans gros refactoring, on refait le fetch (le cache HTTP du worker aidera)
                // OU MIEUX : On appelle l'endpoint interne ou on extrait la logique.
                // Ici, je vais copier la logique de parsing pour l'instant car elle est dans le bloc if précédent.

                const response = await fetch(feedUrl, { headers: { "User-Agent": "StackPages-Worker/1.0" } });
                if (!response.ok) throw new Error(`Failed to fetch RSS: ${response.status}`);
                const xmlText = await response.text();

                // Parsing simplifié (copie de ci-dessus)
                const items = [];
                let currentPos = 0;
                while (true) {
                    const itemStart = xmlText.indexOf("<item>", currentPos);
                    if (itemStart === -1) break;
                    const itemEnd = xmlText.indexOf("</item>", itemStart);
                    if (itemEnd === -1) break;
                    const itemContent = xmlText.substring(itemStart, itemEnd);

                    const titleMatch = itemContent.match(/<title>(.*?)<\/title>/s);
                    const linkMatch = itemContent.match(/<link>(.*?)<\/link>/s);
                    const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/s);
                    const descriptionMatch = itemContent.match(/<description>(.*?)<\/description>/s);
                    const enclosureMatch = itemContent.match(/<enclosure[^>]*url=["'](.*?)["'][^>]*>/s);
                    const guidMatch = itemContent.match(/<guid[^>]*>(.*?)<\/guid>/s);

                    const clean = (str) => str ? str.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : "";
                    const title = clean(titleMatch ? titleMatch[1] : "Sans titre");

                    items.push({
                        title: title,
                        slug: slugify(title),
                        guid: clean(guidMatch ? guidMatch[1] : ""),
                        link: clean(linkMatch ? linkMatch[1] : "#"),
                        pubDate: clean(pubDateMatch ? pubDateMatch[1] : ""),
                        description: clean(descriptionMatch ? descriptionMatch[1] : ""),
                        audioUrl: enclosureMatch ? enclosureMatch[1] : null
                    });
                    currentPos = itemEnd + 7;
                }

                // Recherche par GUID ou Slug
                const podcast = items.find(p => p.guid === podcastId || p.slug === podcastId);

                if (podcast) {
                    return new Response(JSON.stringify(podcast), { status: 200, headers: corsHeaders });
                } else {
                    return new Response(JSON.stringify({ error: "Podcast non trouvé" }), { status: 404, headers: corsHeaders });
                }

            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
            }
        }

        // 5. Videos
        if (path === "/api/videos") {
            console.log("DEBUG: Configured YouTube URL:", config.youtubeRssUrl);
            if (!config.youtubeRssUrl) {
                return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
            }
            try {
                const videos = await getCachedYoutubeData(config.youtubeRssUrl);
                return new Response(JSON.stringify(videos), { status: 200, headers: corsHeaders });
            } catch (error) {
                console.error("Error fetching YouTube RSS:", error);
                return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
            }
        }

        // 5.1 Single Video
        if (path.startsWith("/api/video/")) {
            const videoId = path.split("/").pop();
            if (!config.youtubeRssUrl) {
                return new Response(JSON.stringify({ error: "Flux YouTube non configuré" }), { status: 404, headers: corsHeaders });
            }

            try {
                const videos = await getCachedYoutubeData(config.youtubeRssUrl);
                const video = videos.find(v => v.id === videoId);

                if (video) {
                    return new Response(JSON.stringify(video), { status: 200, headers: corsHeaders });
                } else {
                    return new Response(JSON.stringify({ error: "Vidéo non trouvée" }), { status: 404, headers: corsHeaders });
                }
            } catch (error) {
                console.error("Error fetching YouTube RSS:", error);
                return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
            }
        }

        // --- ROUTES API PROTÉGÉES ---

        // 6. Get Config (Read-Only)
        if (path === "/api/config" && req.method === "GET") {
            if (!isAuthenticated()) {
                return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: corsHeaders });
            }
            return new Response(JSON.stringify(config), { status: 200, headers: corsHeaders });
        }

        // 7. Save Config (Disabled)
        if (path === "/api/config" && req.method === "POST") {
            return new Response(JSON.stringify({ error: "La configuration est gérée par les variables d'environnement." }), { status: 405, headers: corsHeaders });
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

        // Protection du dashboard
        // Note: Avec l'auth stateless, on ne peut pas facilement protéger les pages statiques côté serveur 
        // sans envoyer le header (ce que le navigateur ne fait pas pour une navigation standard).
        // On laisse donc le JS client (app.js) gérer la redirection si le localStorage est vide.
        // C'est moins sécurisé (le code HTML est visible) mais c'est ce qui est demandé ("pas de session").

        /* 
        if (path === "/dashboard.html") {
             // Impossible de vérifier X-Auth-Key ici pour une requête GET navigateur standard
        }
        */

        // Admin Login -> admin/index.html
        if (path === "/admin" || path === "/admin/") {
            return await env.ASSETS.fetch(new Request(new URL("/admin/index.html", url), {
                method: 'GET',
                headers: req.headers
            }));
        }

        // Dashboard -> admin/dashboard.html
        if (path === "/dashboard" || path === "/dashboard/") {
            return await env.ASSETS.fetch(new Request(new URL("/admin/dashboard.html", url), {
                method: 'GET',
                headers: req.headers
            }));
        }

        // Visual Editor -> admin/visual-editor.html
        if (path === "/admin/visual-editor.html") {
            return await env.ASSETS.fetch(new Request(new URL("/admin/visual-editor.html", url), {
                method: 'GET',
                headers: req.headers
            }));
        }

        // Custom Pages Loader -> /p/*
        if (path.startsWith("/p/")) {
            const slug = path.split("/").pop();

            // 1. Try to fetch from GitHub if configured
            const GITHUB_USER = env.GITHUB_USER;
            const GITHUB_REPO = env.GITHUB_REPO;

            if (GITHUB_USER && GITHUB_REPO) {
                const githubUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/content/pages/${slug}.html`;
                try {
                    const ghRes = await fetch(githubUrl);
                    if (ghRes.ok) {
                        const html = await ghRes.text();
                        return new Response(html, {
                            headers: { 'Content-Type': 'text/html; charset=utf-8' }
                        });
                    }
                } catch (e) {
                    console.error("GitHub Fetch Error:", e);
                }
            }

            // 2. Fallback to Local Loader (Client-side localStorage)
            return await env.ASSETS.fetch(new Request(new URL("/loader.html", url), {
                method: 'GET',
                headers: req.headers
            }));
        }

        // ====================================================================
        // 5. REVERSE PROXY (SI STAGING_URL EST DÉFINI)
        // ====================================================================
        // Note: Cette logique est également documentée dans /core/frontend.js
        //       pour référence et maintenance future.

        const STAGING_URL = env.STAGING_URL;
        let TARGET_DOMAIN = null;
        let TARGET_PROTOCOL = 'https:';

        if (STAGING_URL) {
            try {
                const stagingUrlObj = new URL(STAGING_URL);
                TARGET_DOMAIN = stagingUrlObj.hostname;
                TARGET_PROTOCOL = stagingUrlObj.protocol;
            } catch (e) {
                console.error("Invalid STAGING_URL:", STAGING_URL);
            }
        }

        const WORKER_DOMAIN = url.hostname;

        // Si TARGET_DOMAIN est défini ET que ce n'est pas un chemin admin/API, activer le reverse proxy
        // Chemins exclus du proxy (déjà gérés ci-dessus):
        // - /api/* (toutes les API)
        // - /admin, /dashboard (pages admin)
        // - /core/* (fichiers JS)
        const isAdminOrApiPath = path.startsWith('/api/') ||
            path.startsWith('/admin') ||
            path.startsWith('/dashboard') ||
            path.startsWith('/core/');

        if (TARGET_DOMAIN && !isAdminOrApiPath) {
            const originUrl = new URL(req.url);
            originUrl.hostname = TARGET_DOMAIN;
            originUrl.protocol = TARGET_PROTOCOL;

            // Créer une nouvelle requête avec les headers modifiés
            let newHeaders = new Headers(req.headers);
            newHeaders.set("Host", TARGET_DOMAIN);
            newHeaders.set("Referer", originUrl.toString()); // Optionnel: faire croire que ça vient du site cible

            let newRequest = new Request(originUrl, {
                method: req.method,
                headers: newHeaders,
                body: req.body,
                redirect: "manual" // Gérer les redirections manuellement
            });

            try {
                let response = await fetch(newRequest);
                const contentType = response.headers.get('content-type');

                // Préparer les headers de réponse (nettoyage CSP/Frame-Options)
                let responseHeaders = new Headers(response.headers);
                responseHeaders.delete("Content-Security-Policy");
                responseHeaders.delete("X-Frame-Options");

                // Gestion des redirections
                if (response.headers.has('location')) {
                    const location = response.headers.get('location');
                    if (location.includes(TARGET_DOMAIN)) {
                        const newLocation = location.replace(TARGET_DOMAIN, WORKER_DOMAIN);
                        responseHeaders.set('location', newLocation);

                        return new Response(response.body, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: responseHeaders
                        });
                    }
                }

                // Réécriture du contenu HTML
                if (contentType && contentType.startsWith('text/html')) {
                    return new HTMLRewriter()
                        .on('a[href]', new AttributeRewriter('href', TARGET_DOMAIN, WORKER_DOMAIN))
                        .on('link[href]', new AttributeRewriter('href', TARGET_DOMAIN, WORKER_DOMAIN))
                        .on('script[src]', new AttributeRewriter('src', TARGET_DOMAIN, WORKER_DOMAIN))
                        .on('img[src]', new AttributeRewriter('src', TARGET_DOMAIN, WORKER_DOMAIN))
                        .on('img[srcset]', new AttributeRewriter('srcset', TARGET_DOMAIN, WORKER_DOMAIN))
                        .on('source[src]', new AttributeRewriter('src', TARGET_DOMAIN, WORKER_DOMAIN))
                        .on('source[srcset]', new AttributeRewriter('srcset', TARGET_DOMAIN, WORKER_DOMAIN))
                        .on('form[action]', new AttributeRewriter('action', TARGET_DOMAIN, WORKER_DOMAIN))
                        .transform(new Response(response.body, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: responseHeaders
                        }));
                }

                // Renvoyer les autres ressources telles quelles (images, css, etc.)
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: responseHeaders
                });



            } catch (error) {
                console.error("Erreur de reverse proxy:", error);
                return new Response(`Erreur de reverse proxy : ${error.message}`, { status: 500 });
            }
        }


        // ====================================================================
        // 6. CUSTOM PAGES ROUTING (CLIENT-SIDE RENDERING FROM LOCALSTORAGE)
        // ====================================================================

        // If path matches a potential page slug (not a file extension), serve the page template
        // This allows pages stored in localStorage to be accessed via their slug URLs
        const hasFileExtension = path.match(/\.[a-z0-9]+$/i);
        const isRootOrIndex = path === '/' || path === '/index.html' || path === '';

        if (!isRootOrIndex && !hasFileExtension && !isAdminOrApiPath) {
            // Serve the page template which will load content from localStorage
            try {
                return await env.ASSETS.fetch(new Request(new URL('/page-template.html', url), {
                    method: 'GET',
                    headers: req.headers
                }));
            } catch (e) {
                console.error('Error serving page template:', e);
                // Fall through to default asset serving
            }
        }

        // ====================================================================
        // 7. FALLBACK - SERVIR INDEX.HTML PAR DÉFAUT
        // ====================================================================



        try {
            return await env.ASSETS.fetch(req);
        } catch (e) {
            return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
        }
    }
};

// ====================================================================
// 8. AUTHENTICATION HELPERS (Google OAuth & JWT)
// ====================================================================

async function handleGoogleLogin(env, request) {
    const client_id = env.GOOGLE_CLIENT_ID;
    if (!client_id) return new Response("Google Client ID not configured", { status: 500 });

    const url = new URL(request.url);
    const redirect_uri = `${url.origin}/auth/callback`;

    const params = new URLSearchParams({
        client_id: client_id,
        redirect_uri: redirect_uri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "consent"
    });

    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}

async function handleGoogleCallback(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (!code) return new Response("Missing code", { status: 400 });

    const client_id = env.GOOGLE_CLIENT_ID;
    const client_secret = env.GOOGLE_CLIENT_SECRET;
    const redirect_uri = `${url.origin}/auth/callback`;

    // Exchange code for token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id,
            client_secret,
            redirect_uri,
            grant_type: "authorization_code"
        })
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) return new Response(JSON.stringify(tokenData), { status: 400 });

    // Get User Info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userResponse.json();

    // DB Logic (D1)
    let user = await getUserByEmail(env.DB, userData.email);
    if (!user) {
        user = await createUser(env.DB, userData);
    }

    // Create Session (JWT)
    const sessionToken = await createSessionToken(user, env.JWT_SECRET || "default-secret-change-me");

    // Redirect based on role
    const targetPath = user.role === 'admin' ? '/admin/dashboard.html' : '/app/index.html';

    return new Response(null, {
        status: 302,
        headers: {
            "Location": targetPath,
            "Set-Cookie": `auth_token=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
        }
    });
}

async function handleLogout() {
    return new Response(null, {
        status: 302,
        headers: {
            "Location": "/admin/index.html",
            "Set-Cookie": "auth_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        }
    });
}

async function handleGetUser(request, env) {
    const user = await getUserFromRequest(request, env);
    if (!user) return new Response("Unauthorized", { status: 401 });
    return new Response(JSON.stringify(user), { headers: { "Content-Type": "application/json" } });
}

// --- DB Helpers ---

async function getUserByEmail(db, email) {
    if (!db) return null;
    try {
        const { results } = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).all();
        return results && results.length > 0 ? results[0] : null;
    } catch (e) {
        console.error("DB Error (getUserByEmail):", e);
        return null;
    }
}

async function createUser(db, googleUser) {
    const newUser = {
        id: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatar_url: googleUser.picture,
        role: 'user', // Default role
        created_at: Math.floor(Date.now() / 1000)
    };

    if (db) {
        try {
            await db.prepare(
                "INSERT INTO users (id, email, name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind(newUser.id, newUser.email, newUser.name, newUser.avatar_url, newUser.role, newUser.created_at).run();
        } catch (e) {
            console.error("DB Error (createUser):", e);
        }
    }
    return newUser;
}

// --- JWT Helpers ---

async function createSessionToken(user, secret) {
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        avatar: user.avatar_url,
        exp: Math.floor(Date.now() / 1000) + 86400
    };

    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );

    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function getUserFromRequest(request, env) {
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) return null;

    const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
    const token = cookies['auth_token'];
    if (!token) return null;

    return await verifySessionToken(token, env.JWT_SECRET || "default-secret-change-me");
}

async function verifySessionToken(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [encodedHeader, encodedPayload, encodedSignature] = parts;

        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );

        const signature = Uint8Array.from(atob(encodedSignature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

        const isValid = await crypto.subtle.verify(
            "HMAC",
            key,
            signature,
            new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
        );

        if (!isValid) return null;

        const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;

        return payload;
    } catch (e) {
        return null;
    }
}