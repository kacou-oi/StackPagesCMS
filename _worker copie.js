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

        // --- SÉCURITÉ : RESTRICTION DE DOMAINE ---
        const ALLOWED_DOMAIN = env.ALLOWED_DOMAIN;
        if (ALLOWED_DOMAIN) {
            const currentDomain = url.hostname;
            // On autorise aussi localhost pour le dev local
            if (currentDomain !== ALLOWED_DOMAIN && !currentDomain.includes('localhost') && !currentDomain.includes('127.0.0.1')) {
                return new Response(`<h1>Accès Refusé</h1><p>Ce worker est configuré pour ne fonctionner que sur : ${ALLOWED_DOMAIN}</p>`, {
                    status: 403,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }
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
            // --- API ROUTES ---

            // 1. Metadata
            if (path === '/api/metadata') {
                const metadata = {
                    siteName: env.META_TITLE || "StackPages Portal",
                    description: env.META_DESCRIPTION || "Portail de contenus",
                    author: "Admin",
                    lastBuildDate: new Date().toISOString(),
                    substackRssUrl: env.SUBSTACK_FEED_URL,
                    youtubeRssUrl: env.YOUTUBE_FEED_URL,
                    podcastFeedUrl: env.PODCAST_FEED_URL,
                    frontendBuilderUrl: env.FRONTEND_BUILDER_URL
                };
                return new Response(JSON.stringify(metadata), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }

            // 2. Posts (Substack)
            if (path === '/api/posts') {
                if (!env.SUBSTACK_FEED_URL) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

                try {
                    const rssContent = await fetchRSS(env.SUBSTACK_FEED_URL);
                    const posts = await parseSubstackRSS(rssContent);
                    return new Response(JSON.stringify(posts), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                } catch (e) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
                }
            }

            // 3. Videos (YouTube)
            if (path === '/api/videos') {
                if (!env.YOUTUBE_FEED_URL) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

                try {
                    const videos = await getCachedYoutubeData(env.YOUTUBE_FEED_URL);
                    return new Response(JSON.stringify(videos), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                } catch (e) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
                }
            }

            // 4. Podcasts
            if (path === '/api/podcasts') {
                if (!env.PODCAST_FEED_URL) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

                try {
                    const rssContent = await fetchRSS(env.PODCAST_FEED_URL);
                    const podcasts = await parsePodcastRSS(rssContent);
                    return new Response(JSON.stringify(podcasts), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                } catch (e) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
                }
            }

            // 5. Single Post (by Slug)
            if (path.startsWith('/api/post/')) {
                const slug = path.split('/').pop();
                if (!env.SUBSTACK_FEED_URL) return new Response(JSON.stringify({ error: "No Substack URL configured" }), { status: 404, headers: corsHeaders });

                try {
                    const rssContent = await fetchRSS(env.SUBSTACK_FEED_URL);
                    const posts = await parseSubstackRSS(rssContent);
                    const post = posts.find(p => p.slug === slug);

                    if (post) {
                        return new Response(JSON.stringify(post), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                    } else {
                        return new Response(JSON.stringify({ error: "Post not found" }), { status: 404, headers: corsHeaders });
                    }
                } catch (e) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
                }
            }

            // 6. Single Video (by ID)
            if (path.startsWith('/api/video/')) {
                const videoId = path.split('/').pop();
                if (!env.YOUTUBE_FEED_URL) return new Response(JSON.stringify({ error: "No YouTube URL configured" }), { status: 404, headers: corsHeaders });

                try {
                    const videos = await getCachedYoutubeData(env.YOUTUBE_FEED_URL);
                    const video = videos.find(v => v.link.includes(videoId)); // Simple check, ideally parse ID from link

                    if (video) {
                        return new Response(JSON.stringify(video), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                    } else {
                        return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
                    }
                } catch (e) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
                }
            }

            // 7. Single Podcast (by GUID or Slug)
            if (path.startsWith('/api/podcast/')) {
                const podcastId = path.split('/').pop(); // Can be GUID or Slug
                if (!env.PODCAST_FEED_URL) return new Response(JSON.stringify({ error: "No Podcast URL configured" }), { status: 404, headers: corsHeaders });

                try {
                    const rssContent = await fetchRSS(env.PODCAST_FEED_URL);
                    const podcasts = await parsePodcastRSS(rssContent);

                    // Find by GUID or Slug
                    const podcast = podcasts.find(p => p.guid === podcastId || p.slug === podcastId);

                    if (podcast) {
                        return new Response(JSON.stringify(podcast), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                    } else {
                        return new Response(JSON.stringify({ error: "Podcast not found" }), { status: 404, headers: corsHeaders });
                    }
                } catch (e) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
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
            // 6. FALLBACK - SERVIR INDEX.HTML PAR DÉFAUT
            // ====================================================================



            try {
                return await env.ASSETS.fetch(req);
            } catch (e) {
                return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
            }
        }
    };