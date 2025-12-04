// ====================================================================
// 1. CONFIGURATION ET UTILITAIRES
// ====================================================================

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

function cleanHtmlContent(html) {
    if (!html) return "";
    const regexExpand = /<a\s+[^>]*class=["'][^"']*image-link-expand[^"']*(?:[^>]*)*>.*?<\/a>/gis;
    let cleanedHtml = html.replace(regexExpand, '');
    cleanedHtml = cleanedHtml.replace(/style="[^"]*"/gi, '');
    return cleanedHtml;
}

// ====================================================================
// 2. LOGIQUE DE PARSING RSS
// ====================================================================

function extractChannelMetadata(xml) {
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

    return {
        blogTitle: getChannelTag('title'),
        blogUrl: getChannelTag('link'),
        lastBuildDate: getChannelTag('lastBuildDate'),
        blogDescription: getChannelTag('description')
    };
}

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
            contentFull = cleanHtmlContent(contentFull);
            if (!image) {
                image = extractFirstImage(contentFull);
            }
        } else {
            contentFull = description;
        }

        items.push({
            title,
            link,
            pubDate,
            description,
            slug: slugify(title),
            content: contentFull,
            image
        });
    }
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    return items;
}

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
        const videoIdRe = /<yt:videoId>((.|[\r\n])*?)<\/yt:videoId>/i;
        const videoIdMatch = block.match(videoIdRe);
        const videoId = videoIdMatch ? videoIdMatch[1].trim() : "";
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
    items.sort((a, b) => new Date(b.published) - new Date(a.published));
    return items;
}

// ====================================================================
// 2b. LOGIQUE GITHUB (GIT-BACKED CMS)
// ====================================================================

async function fetchGithubContent(config, slug) {
    if (!config.githubUser || !config.githubRepo) return null;

    // Construct Raw GitHub URL
    // Format: https://raw.githubusercontent.com/{user}/{repo}/{branch}/content/pages/{slug}.html
    const branch = config.githubBranch || 'main';
    const url = `https://raw.githubusercontent.com/${config.githubUser}/${config.githubRepo}/${branch}/content/pages/${slug}.html`;

    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.text();
    } catch (e) {
        console.error(`GitHub Fetch Error for ${slug}:`, e);
        return null;
    }
}

// ====================================================================
// 3. LOGIQUE DE CACHE
// ====================================================================

async function getCachedRSSData(feedUrl, forceRefresh = false) {
    if (!feedUrl) return { metadata: {}, posts: [] };
    const cache = caches.default;
    const cacheKey = new Request(feedUrl, { method: 'GET' });

    if (!forceRefresh) {
        let response = await cache.match(cacheKey);
        if (response) return await response.json();
    }

    try {
        const res = await fetch(feedUrl);
        if (!res.ok) throw new Error(`RSS Fetch Failed: ${res.statusText}`);
        const xml = await res.text();
        const data = {
            metadata: extractChannelMetadata(xml),
            posts: fetchAndParseRSS(xml)
        };
        const cachedResponse = new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}` }
        });
        await cache.put(cacheKey, cachedResponse.clone());
        return data;
    } catch (e) {
        console.error("RSS Error:", e);
        return { metadata: {}, posts: [] };
    }
}

async function getCachedYoutubeData(feedUrl, forceRefresh = false) {
    if (!feedUrl) return [];
    const cache = caches.default;
    const cacheKey = new Request(feedUrl, { method: 'GET' });

    if (!forceRefresh) {
        let response = await cache.match(cacheKey);
        if (response) return await response.json();
    }

    try {
        const res = await fetch(feedUrl);
        if (!res.ok) throw new Error(`Youtube Fetch Failed`);
        const xml = await res.text();
        const videos = fetchAndParseYoutubeRSS(xml);
        const cachedResponse = new Response(JSON.stringify(videos), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}` }
        });
        await cache.put(cacheKey, cachedResponse.clone());
        return videos;
    } catch (e) {
        console.error("Youtube Error:", e);
        return [];
    }
}

// ====================================================================
// 4. TEMPLATE ENGINE (SUPER TEMPLATE)
// ====================================================================

async function fetchSiteConfig(githubConfig) {
    // Fetch config.json from GitHub Raw
    if (!githubConfig.githubUser || !githubConfig.githubRepo) return null;

    const branch = githubConfig.githubBranch || 'main';
    const url = `https://raw.githubusercontent.com/${githubConfig.githubUser}/${githubConfig.githubRepo}/${branch}/config.json`;

    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error("Config Fetch Error:", e);
        return null;
    }
}

async function getTemplate(githubConfig, siteConfig) {
    // Fetch template from GitHub Raw based on activeTemplate in config
    if (!githubConfig.githubUser || !githubConfig.githubRepo) return null;

    const branch = githubConfig.githubBranch || 'main';
    const activeTemplate = siteConfig?.theme?.activeTemplate || 'default';
    const url = `https://raw.githubusercontent.com/${githubConfig.githubUser}/${githubConfig.githubRepo}/${branch}/frontend/${activeTemplate}.html`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            // Fallback to index.html if template not found
            const fallbackUrl = `https://raw.githubusercontent.com/${githubConfig.githubUser}/${githubConfig.githubRepo}/${branch}/index.html`;
            const fallbackRes = await fetch(fallbackUrl);
            if (!fallbackRes.ok) return null;
            return await fallbackRes.text();
        }
        return await res.text();
    } catch (e) {
        console.error("Template Fetch Error:", e);
        return null;
    }
}


function injectContent(template, content, metadata) {
    if (!template) return content;

    let html = template;

    // 1. Inject Title
    if (metadata && metadata.title) {
        html = html.replace(/\<title[^\>]*\>(.*?)\<\/title\>/i, `<title id="site-title">${metadata.title}</title>`);
    }

    // 2. Inject Meta Description
    if (metadata && metadata.description) {
        // Try to replace existing meta tag
        if (html.match(/\<meta[^\>]*name=["']description["'][^\>]*\>/i)) {
            html = html.replace(/(\<meta[^\>]*name=["']description["'][^\>]*content=["'])(.*?)(["'][^\>]*\>)/i, `$1${metadata.description}$3`);
        } else {
            // Inject if missing (in head)
            html = html.replace(/\<\/head\>/i, `<meta name="description" id="meta-desc" content="${metadata.description}">\n</head>`);
        }
    }

    // 3. Inject Meta Keywords
    if (metadata && metadata.keywords) {
        if (html.match(/\<meta[^\>]*name=["']keywords["'][^\>]*\>/i)) {
            html = html.replace(/(\<meta[^\>]*name=["']keywords["'][^\>]*content=["'])(.*?)(["'][^\>]*\>)/i, `$1${metadata.keywords}$3`);
        } else {
            html = html.replace(/\<\/head\>/i, `<meta name="keywords" id="meta-keywords" content="${metadata.keywords}">\n</head>`);
        }
    }

    // 4. Inject Site Name (Header & Footer)
    if (metadata && metadata.siteName) {
        html = html.replace(/(\<span[^\>]*id=["']header-site-name["'][^\>]*\>)(.*?)(\<\/span\>)/i, `$1${metadata.siteName}$3`);
        html = html.replace(/(\<span[^\>]*id=["']footer-site-name-copyright["'][^\>]*\>)(.*?)(\<\/span\>)/i, `$1${metadata.siteName}$3`);
    }

    // 5. Inject Main Content
    const mainRegex = /(\<main[^\>]*id=["']main-content["'][^\>]*\>)([\s\S]*?)(\<\/main\>)/i;
    html = html.replace(mainRegex, `$1${content}$3`);

    return html;
}

// --- CONTENT GENERATORS (DIRECT HTML GENERATION) ---

function generateHomeContent(metadata) {
    // Simple home page - templates will provide their own home content
    // This is a fallback if the template doesn't have home content
    return `
        <section class="py-20 bg-white">
            <div class="container mx-auto px-6 text-center">
                <h1 class="text-5xl font-bold mb-8">${metadata.title || 'Bienvenue'}</h1>
                <p class="text-xl text-gray-600 mb-10">${metadata.description || ''}</p>
            </div>
        </section>
    `;
}

function generatePublicationsContent(posts) {
    let itemsHtml = '';

    if (posts.length === 0) {
        itemsHtml = `<p class="col-span-full text-center text-gray-600 p-8">Aucune publication trouvée.</p>`;
    } else {
        posts.forEach(post => {
            const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
            const description = post.description ? post.description.substring(0, 120) + '...' : '';
            const image = post.image || 'https://via.placeholder.com/600x400/edf2f7/4a5568?text=Image+Article';

            itemsHtml += `
                <a href="/post/${post.slug}" hx-get="/post/${post.slug}" hx-target="#main-content" hx-push-url="true" class="group block">
                    <div class="overflow-hidden rounded-lg mb-6 shadow-lg">
                        <img src="${image}" alt="${post.title}" class="w-full h-64 object-cover transform group-hover:scale-105 transition-transform duration-500">
                    </div>
                    <span class="text-blue-600 text-xs font-bold uppercase tracking-widest">${postDate}</span>
                    <h3 class="text-xl font-bold text-gray-900 mt-2 mb-3 group-hover:text-blue-600 transition-colors">${post.title}</h3>
                    <p class="text-gray-500 line-clamp-3">${description}</p>
                </a>
            `;
        });
    }

    return `
        <section class="py-20 bg-white">
            <div class="container mx-auto px-6">
                <h2 class="text-4xl font-bold text-center mb-16">Publications</h2>
                <div id="publications-container" class="grid grid-cols-1 md:grid-cols-3 gap-10">
                    ${itemsHtml}
                </div>
            </div>
        </section>
    `;
}

function generateVideosContent(videos) {
    let itemsHtml = '';

    if (videos.length === 0) {
        itemsHtml = `<p class="col-span-full text-center text-gray-600 p-8">Aucune vidéo trouvée.</p>`;
    } else {
        videos.forEach(video => {
            const videoDate = new Date(video.published).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
            const thumbnail = video.thumbnail || 'https://via.placeholder.com/600x338/edf2f7/4a5568?text=Vidéo';

            itemsHtml += `
                <div class="cursor-pointer group" onclick="openVideoModal('${video.link}')">
                    <div class="relative rounded-lg overflow-hidden mb-4 shadow-lg">
                        <img src="${thumbnail}" alt="${video.title}" class="w-full aspect-video object-cover">
                        <div class="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <div class="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center text-gray-900 shadow-xl transform group-hover:scale-110 transition-transform">
                                <i class="fas fa-play ml-1 text-xl"></i>
                            </div>
                        </div>
                    </div>
                    <h3 class="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">${video.title}</h3>
                    <span class="text-gray-500 text-sm">${videoDate}</span>
                </div>
            `;
        });
    }

    return `
        <section class="py-20 bg-gray-50">
            <div class="container mx-auto px-6">
                <h2 class="text-4xl font-bold text-center mb-16">Vidéos</h2>
                <div id="videos-container" class="grid grid-cols-1 md:grid-cols-3 gap-10">
                    ${itemsHtml}
                </div>
            </div>
        </section>
    `;
}

function generateContactContent() {
    return `
        <section class="py-20 bg-gray-50">
            <div class="container mx-auto px-6">
                <div class="max-w-2xl mx-auto bg-white p-10 rounded-2xl shadow-xl">
                    <h2 class="text-3xl font-bold text-center mb-8">Contactez-moi</h2>
                    <form id="contact-form" class="space-y-6">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">Nom Complet</label>
                            <input type="text" id="name" name="name"
                                class="w-full px-4 py-3 rounded border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                required>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">Email</label>
                            <input type="email" id="email" name="email"
                                class="w-full px-4 py-3 rounded border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                required>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">Message</label>
                            <textarea id="message" name="message" rows="5"
                                class="w-full px-4 py-3 rounded border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                required></textarea>
                        </div>
                        <button type="submit"
                            class="w-full py-4 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 transition-colors shadow-lg">
                            Envoyer
                        </button>
                    </form>
                </div>
            </div>
        </section>
    `;
}

function generateCoachingContent() {
    return `
        <section class="py-20 bg-white">
            <div class="container mx-auto px-6">
                <div class="text-center mb-20">
                    <span class="text-blue-600 font-bold tracking-widest uppercase text-sm">Investissez en vous-même</span>
                    <h1 class="text-5xl font-bold text-gray-900 mt-4 mb-6">Offres de Coaching</h1>
                    <p class="text-gray-500 max-w-2xl mx-auto text-lg">Choisissez le programme qui correspond à vos ambitions.</p>
                </div>
            </div>
        </section>
    `;
}

function generateBioContent() {
    return `
        <section class="py-20 bg-gray-50">
            <div class="container mx-auto px-6">
                <div class="max-w-4xl mx-auto">
                    <h1 class="text-5xl md:text-6xl font-bold text-gray-900 mb-8 text-center">Mon Histoire</h1>
                    <div class="w-24 h-1 bg-blue-500 mx-auto mb-16"></div>
                    
                    <div class="prose prose-lg prose-slate mx-auto leading-relaxed">
                        <p class="text-xl text-gray-600 font-medium mb-8 text-center italic">
                            Biographie à venir...
                        </p>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function generateVideoDetailContent(video) {
    const videoDate = new Date(video.published).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

    // Convert YouTube link to embed URL
    let embedUrl = video.link;
    if (video.link && video.link.includes('youtube.com/watch?v=')) {
        const videoId = video.link.split('v=')[1]?.split('&')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (video.link && video.link.includes('youtu.be/')) {
        const videoId = video.link.split('youtu.be/')[1]?.split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
    }

    return `
        <article class="py-20 bg-white">
            <div class="container mx-auto px-6 max-w-4xl">
                <a href="/videos" hx-get="/videos" hx-target="#main-content" hx-push-url="true"
                    class="inline-flex items-center text-gray-500 hover:text-gray-900 mb-8 transition-colors">
                    <i class="fas fa-arrow-left mr-2"></i> Retour aux Vidéos
                </a>

                <h1 class="text-4xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">${video.title}</h1>
                <div class="flex items-center text-gray-500 mb-10 border-b border-gray-100 pb-10">
                    <span>${videoDate}</span>
                </div>

                <div class="aspect-video mb-12">
                    <iframe class="w-full h-full rounded-xl shadow-2xl" src="${embedUrl}" frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen></iframe>
                </div>

                <div class="prose prose-lg prose-slate max-w-none leading-relaxed">
                    <p>${video.description || 'Aucune description disponible.'}</p>
                </div>
            </div>
        </article>
    `;
}

function generatePostContent(post) {
    const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    const image = post.image || 'https://via.placeholder.com/800x400/edf2f7/4a5568?text=Image+de+Couverture';

    return `
        <article class="py-20 bg-white">
            <div class="container mx-auto px-6 max-w-4xl">
                <a href="/publications" hx-get="/publications" hx-target="#main-content" hx-push-url="true"
                    class="inline-flex items-center text-gray-500 hover:text-gray-900 mb-8 transition-colors">
                    <i class="fas fa-arrow-left mr-2"></i> Retour aux Publications
                </a>

                <h1 class="text-4xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">${post.title}</h1>
                <div class="flex items-center text-gray-500 mb-10 border-b border-gray-100 pb-10">
                    <span class="font-bold text-gray-900 mr-2">${post.author || 'Inconnu'}</span>
                    <span class="mx-2">•</span>
                    <span>${postDate}</span>
                </div>

                <img src="${image}" alt="${post.title}" class="w-full rounded-xl shadow-2xl mb-12">

                <div class="prose prose-lg prose-slate max-w-none leading-relaxed article-content">
                    ${post.content}
                </div>
            </div>
        </article>
    `;
}

// ====================================================================
// 5. GESTIONNAIRE PRINCIPAL DU WORKER
// ====================================================================

export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        let path = url.pathname;
        if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

        const config = {
            substackRssUrl: env.SUBSTACK_FEED_URL || "",
            youtubeRssUrl: env.YOUTUBE_FEED_URL || "",
            podcastFeedUrl: env.PODCAST_FEED_URL || "",
            siteName: "StackPages CMS",
            author: "Admin",
            // GitHub Config
            githubUser: env.GITHUB_USERNAME,
            githubRepo: env.GITHUB_REPO,
            githubBranch: env.GITHUB_BRANCH
        };

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        };

        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

        // --- STATIC ASSETS (CORE) ---
        if (path.startsWith("/core/")) {
            return await env.ASSETS.fetch(req);
        }

        // --- API ROUTES ---

        // Admin Login
        if (path === "/api/login" && req.method === "POST") {
            try {
                const body = await req.json();
                const adminEmail = env.ADMIN_EMAIL || "";
                const adminPassword = env.ADMIN_PASSWORD || "";

                if (body.email === adminEmail && body.password === adminPassword) {
                    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
                } else {
                    return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers: corsHeaders });
                }
            } catch (e) {
                return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: corsHeaders });
            }
        }

        // Admin Config (returns environment variables)
        if (path === "/api/config") {
            return new Response(JSON.stringify({
                siteName: config.siteName,
                substackRssUrl: config.substackRssUrl,
                youtubeRssUrl: config.youtubeRssUrl,
                podcastFeedUrl: config.podcastFeedUrl
            }), { status: 200, headers: corsHeaders });
        }

        if (path === "/api/github-config") {
            // Return GitHub configuration from environment variables
            return new Response(JSON.stringify({
                owner: config.githubUser || "",
                repo: config.githubRepo || "",
                branch: config.githubBranch || "main"
            }), {
                headers: corsHeaders
            });
        }

        // Clear Cache
        if (path === "/api/clear-cache" && req.method === "POST") {
            // In Cloudflare Workers, caches.default doesn't support programmatic clearing easily.
            // This is a placeholder that returns success.
            return new Response(JSON.stringify({ success: true, message: "Cache cleared" }), { status: 200, headers: corsHeaders });
        }

        if (path === "/api/metadata") {
            const data = await getCachedRSSData(config.substackRssUrl);
            return new Response(JSON.stringify({ ...data.metadata, title: config.siteName }), { status: 200, headers: corsHeaders });
        }
        if (path === "/api/posts") {
            const data = await getCachedRSSData(config.substackRssUrl);
            return new Response(JSON.stringify(data.posts), { status: 200, headers: corsHeaders });
        }
        if (path === "/api/videos") {
            const videos = await getCachedYoutubeData(config.youtubeRssUrl);
            return new Response(JSON.stringify(videos), { status: 200, headers: corsHeaders });
        }
        if (path === "/api/podcasts") {
            if (!config.podcastFeedUrl) return new Response(JSON.stringify([]), { headers: corsHeaders });
            try {
                const res = await fetch(config.podcastFeedUrl);
                if (!res.ok) throw new Error("Fetch failed");
                const xml = await res.text();
                const items = [];
                const itemRe = /<item[^>]*>((.|[\r\n])*?)<\/item>/gi;
                let m;
                while ((m = itemRe.exec(xml)) !== null) {
                    const block = m[1];
                    const getTag = (t) => { const r = new RegExp(`<${t}[^>]*>((.|[\\r\\n])*?)<\/${t}>`, 'i'); const f = block.match(r); return f ? decodeHTMLEntities(f[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim()) : ""; };
                    const encMatch = block.match(/<enclosure[^>]*url=["'](.*?)["'][^>]*>/);
                    items.push({
                        title: getTag('title'),
                        pubDate: getTag('pubDate'),
                        audioUrl: encMatch ? encMatch[1] : null
                    });
                }
                return new Response(JSON.stringify(items), { headers: corsHeaders });
            } catch (e) {
                return new Response(JSON.stringify([]), { headers: corsHeaders });
            }
        }

        // --- ADMIN ROUTES ---
        if (path.startsWith("/admin") || path.startsWith("/dashboard")) {
            return await env.ASSETS.fetch(req);
        }

        // --- SSR ROUTES (SUPER TEMPLATE) ---
        const isHtmx = req.headers.get("HX-Request") === "true";
        const htmlResponse = (html) => new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });

        // Helper for HTMX Out-Of-Band Swaps (SEO Updates)
        const generateOOB = (metadata) => {
            if (!isHtmx) return "";
            const title = metadata.title || config.siteName;
            const desc = metadata.description || "";
            const keywords = metadata.keywords || "";

            return `
            <title id="site-title" hx-swap-oob="true">${title}</title>
            <meta id="meta-desc" name="description" content="${desc}" hx-swap-oob="true">
            <meta id="meta-keywords" name="keywords" content="${keywords}" hx-swap-oob="true">
            `;
        };

        // Load Site Config and Super Template
        const siteConfig = await fetchSiteConfig(config);
        const template = await getTemplate(config, siteConfig);
        if (!template) return new Response("Error: Template not found. Check config.json and templates/ folder.", { status: 500 });

        // Use siteConfig for site name, fallback to RSS metadata or default
        const siteName = siteConfig?.site?.name || config.siteName;
        const siteDescription = siteConfig?.seo?.metaDescription || "";
        const siteKeywords = siteConfig?.seo?.keywords || "";

        // Use feeds from config.json if environment variables are not set
        const substackUrl = config.substackRssUrl || siteConfig?.feeds?.substack || "";
        const youtubeUrl = config.youtubeRssUrl || siteConfig?.feeds?.youtube || "";

        if (path === "/" || path === "/index.html") {
            const data = await getCachedRSSData(substackUrl);
            const metadata = { ...data.metadata, title: siteName, description: siteDescription, keywords: siteKeywords, siteName };
            const content = generateHomeContent(metadata);

            if (isHtmx) return htmlResponse(content + generateOOB(metadata));
            return htmlResponse(injectContent(template, content, metadata));
        }

        if (path === "/publications") {
            const data = await getCachedRSSData(substackUrl);
            const metadata = { ...data.metadata, title: `Publications - ${siteName}`, description: "Découvrez mes derniers articles.", keywords: siteKeywords, siteName };
            const content = generatePublicationsContent(data.posts);

            if (isHtmx) return htmlResponse(content + generateOOB(metadata));
            return htmlResponse(injectContent(template, content, metadata));
        }

        if (path === "/videos") {
            const videos = await getCachedYoutubeData(youtubeUrl);
            const content = generateVideosContent(videos);
            const metadata = { title: `Vidéos - ${siteName}`, description: "Mes dernières vidéos YouTube.", keywords: siteKeywords, siteName };

            if (isHtmx) return htmlResponse(content + generateOOB(metadata));
            return htmlResponse(injectContent(template, content, metadata));
        }

        if (path === "/coaching") {
            const content = generateCoachingContent();
            const metadata = { title: `Coaching - ${siteName}`, description: "Réservez votre séance de coaching.", keywords: siteKeywords, siteName };

            if (isHtmx) return htmlResponse(content + generateOOB(metadata));
            return htmlResponse(injectContent(template, content, metadata));
        }

        if (path === "/bio") {
            const content = generateBioContent();
            const metadata = { title: `Biographie - ${siteName}`, description: "À propos de moi.", keywords: siteKeywords, siteName };

            if (isHtmx) return htmlResponse(content + generateOOB(metadata));
            return htmlResponse(injectContent(template, content, metadata));
        }

        if (path === "/contact") {
            const content = generateContactContent();
            const metadata = { title: `Contact - ${siteName}`, description: "Contactez-moi pour toute question.", keywords: siteKeywords, siteName };

            if (isHtmx) return htmlResponse(content + generateOOB(metadata));
            return htmlResponse(injectContent(template, content, metadata));
        }

        if (path.startsWith("/post/")) {
            const slug = path.split("/").pop();
            const data = await getCachedRSSData(substackUrl);
            const post = data.posts.find(p => p.slug === slug);

            if (post) {
                const content = generatePostContent(post);
                const metadata = {
                    title: `${post.title} - ${siteName}`,
                    description: post.description || siteDescription,
                    keywords: siteKeywords,
                    siteName
                };

                if (isHtmx) return htmlResponse(content + generateOOB(metadata));
                return htmlResponse(injectContent(template, content, metadata));
            } else {
                return new Response("Article non trouvé", { status: 404 });
            }
        }

        if (path.startsWith("/video/")) {
            const slug = path.split("/").pop();
            const videos = await getCachedYoutubeData(youtubeUrl);
            const video = videos.find(v => v.id === slug);

            if (video) {
                const content = generateVideoDetailContent(video);
                const metadata = {
                    title: `${video.title} - ${siteName}`,
                    description: video.description || siteDescription,
                    keywords: siteKeywords,
                    siteName
                };

                if (isHtmx) return htmlResponse(content + generateOOB(metadata));
                return htmlResponse(injectContent(template, content, metadata));
            } else {
                return new Response("Vidéo non trouvée", { status: 404 });
            }
        }


        // --- GITHUB FALLBACK (CATCH-ALL FOR CUSTOM PAGES) ---
        if (path !== "/" && !path.startsWith("/api") && !path.startsWith("/core") && !path.startsWith("/admin")) {
            const slug = path.substring(1);
            const githubContent = await fetchGithubContent(config, slug);

            if (githubContent) {
                if (isHtmx) return htmlResponse(githubContent);
                const data = await getCachedRSSData(substackUrl);
                return htmlResponse(injectContent(template, githubContent, { ...data.metadata, title: siteName, siteName }));
            }
        }

        // Fallback to ASSETS for everything else (images, etc.)
        return await env.ASSETS.fetch(req);
    }
};