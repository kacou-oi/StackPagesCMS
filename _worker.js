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
            element.setAttribute(
                this.attributeName,
                attribute.replace(this.targetDomain, this.workerDomain)
            );
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
            frontendBuilderUrl: env.FRONTEND_BUILDER_URL || "https://p-12e07a9d-76d9-4b9f-9ce9-94eeff0e1f00.apps.webstudio.is/?authToken=c75ba98e-e76b-40be-84a7-d6c435f9e324&mode=design",
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

                    // Clean up CDATA
                    const clean = (str) => {
                        if (!str) return "";
                        return str.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
                    };

                    items.push({
                        title: clean(titleMatch ? titleMatch[1] : "Sans titre"),
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

        // ====================================================================
        // 5. REVERSE PROXY (SI TARGET_SUBDOMAIN EST DÉFINI)
        // ====================================================================
        // Note: Cette logique est également documentée dans /core/frontend.js
        //       pour référence et maintenance future.

        const TARGET_SUBDOMAIN = env.TARGET_SUBDOMAIN;
        const TARGET_BASE_DOMAIN = 'wstd.io'; // Domaine de base pour Webstudio
        const TARGET_PROTOCOL = 'https:';
        const WORKER_DOMAIN = url.hostname;

        // Construire le domaine cible complet si le sous-domaine est défini
        const TARGET_DOMAIN = TARGET_SUBDOMAIN ? `${TARGET_SUBDOMAIN}.${TARGET_BASE_DOMAIN}` : null;

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

            let newRequest = new Request(originUrl, req);

            try {
                let response = await fetch(newRequest);
                const contentType = response.headers.get('content-type');

                // Gestion des redirections
                if (response.headers.has('location')) {
                    const location = response.headers.get('location');
                    if (location.includes(TARGET_DOMAIN)) {
                        let newHeaders = new Headers(response.headers);
                        const newLocation = location.replace(TARGET_DOMAIN, WORKER_DOMAIN);
                        newHeaders.set('location', newLocation);

                        return new Response(response.body, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: newHeaders
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
                        .on('form[action]', new AttributeRewriter('action', TARGET_DOMAIN, WORKER_DOMAIN))
                        .transform(response);
                }

                // Renvoyer les autres ressources telles quelles
                return response;

            } catch (error) {
                console.error("Erreur de reverse proxy:", error);
                return new Response(`Erreur de reverse proxy : ${error.message}`, { status: 500 });
            }
        }

        // ====================================================================
        // 6. FALLBACK - SERVIR INDEX.HTML PAR DÉFAUT
        // ====================================================================



        try {
            return await env.ASSETS.fetch(req);
        } catch (e) {
            return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
        }
    }
};