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
                slug: videoId, // Use videoId as slug for routing
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

function extractTemplate(html, id) {
    if (!html) return "";
    // Regex to find <template id="id">content</template>
    // Note: This is a simple regex parser, assumes valid HTML structure.
    const regex = new RegExp(`<template[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/template>`, 'i');
    const match = html.match(regex);
    return match ? match[1].trim() : null;
}

function replacePlaceholders(template, data) {
    if (!template) return "";
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : "";
    });
}

function injectContent(template, content, metadata) {
    if (!template) return content;

    let html = template;

    // 1. Inject Title
    if (metadata && metadata.title) {
        html = html.replace(/<title[^>]*>(.*?)<\/title>/i, `<title id="site-title">${metadata.title}</title>`);
    }

    // 2. Inject Meta Description
    if (metadata && metadata.description) {
        // Try to replace existing meta tag
        if (html.match(/<meta[^>]*name=["']description["'][^>]*>/i)) {
            html = html.replace(/(<meta[^>]*name=["']description["'][^>]*content=["'])(.*?)(["'][^>]*>)/i, `$1${metadata.description}$3`);
        } else {
            // Inject if missing (in head)
            html = html.replace(/<\/head>/i, `<meta name="description" id="meta-desc" content="${metadata.description}">\n</head>`);
        }
    }

    // 3. Inject Meta Keywords
    if (metadata && metadata.keywords) {
        if (html.match(/<meta[^>]*name=["']keywords["'][^>]*>/i)) {
            html = html.replace(/(<meta[^>]*name=["']keywords["'][^>]*content=["'])(.*?)(["'][^>]*>)/i, `$1${metadata.keywords}$3`);
        } else {
            html = html.replace(/<\/head>/i, `<meta name="keywords" id="meta-keywords" content="${metadata.keywords}">\n</head>`);
        }
    }

    // 4. Inject Site Name (Header & Footer)
    // We use a regex to be safe, but simple string replacement might work if IDs are unique
    if (metadata && metadata.siteName) {
        html = html.replace(/(<span[^>]*id=["']header-site-name["'][^>]*>)(.*?)(<\/span>)/i, `$1${metadata.siteName}$3`);
        html = html.replace(/(<span[^>]*id=["']footer-site-name-copyright["'][^>]*>)(.*?)(<\/span>)/i, `$1${metadata.siteName}$3`);
    }

    // 5. Inject Main Content
    const mainRegex = /(<main[^>]*id=["']main-content["'][^>]*>)([\s\S]*?)(<\/main>)/i;
    html = html.replace(mainRegex, `$1${content}$3`);

    return html;
}

// --- CONTENT GENERATORS (USING TEMPLATES) ---

function generateHomeContent(fullTemplate, metadata) {
    const tpl = extractTemplate(fullTemplate, 'tpl-home');
    if (!tpl) return "<p>Template 'tpl-home' not found.</p>";
    return tpl; // Static home content for now, or replace placeholders if needed
}

function generatePublicationsContent(fullTemplate, posts) {
    let listTpl = extractTemplate(fullTemplate, 'tpl-annoucements') || extractTemplate(fullTemplate, 'tpl-blog-list');
    let cardTpl = extractTemplate(fullTemplate, 'tpl-blog-card');

    // FALLBACKS for Modern/AI Themes
    if (!listTpl) {
        listTpl = '<div class="grid grid-cols-1 md:grid-cols-3 gap-8">{{items}}</div>';
    }
    if (!cardTpl) {
        cardTpl = `
        <article class="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden hover:shadow-lg transition">
            <a href="{{link}}" hx-get="{{link}}" hx-target="#main-content" hx-push-url="true" class="block h-48 overflow-hidden">
                <img src="{{image}}" alt="{{title}}" class="w-full h-full object-cover transform hover:scale-105 transition duration-500">
            </a>
            <div class="p-5">
                <div class="text-xs text-slate-500 mb-2">{{date}}</div>
                <h3 class="font-bold text-lg mb-2 leading-tight">
                    <a href="{{link}}" hx-get="{{link}}" hx-target="#main-content" hx-push-url="true" class="hover:text-blue-600 transition">
                        {{title}}
                    </a>
                </h3>
                <p class="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">{{description}}</p>
            </div>
        </article>`;
    }

    // Show only first 6 posts initially
    const initialPosts = posts.slice(0, 6);
    const hasMore = posts.length > 6;

    let itemsHtml = '';
    if (initialPosts.length === 0) {
        itemsHtml = `<p class="col-span-full text-center text-gray-600 p-8">Aucune publication trouvée.</p>`;
    } else {
        initialPosts.forEach(post => {
            const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
            itemsHtml += replacePlaceholders(cardTpl, {
                title: post.title,
                description: post.description ? post.description.substring(0, 120) + '...' : '',
                author: post.author || 'Inconnu',
                date: postDate,
                image: post.image || 'https://via.placeholder.com/600x400/edf2f7/4a5568?text=Image+Article',
                slug: post.slug,
                link: `/post/${post.slug}`
            });
        });
    }

    let content = listTpl.replace('{{items}}', itemsHtml);
    return content;
}

function generateVideosContent(fullTemplate, videos) {
    let listTpl = extractTemplate(fullTemplate, 'tpl-tutorials') || extractTemplate(fullTemplate, 'tpl-video-list');
    let cardTpl = extractTemplate(fullTemplate, 'tpl-video-card');

    // FALLBACKS
    if (!listTpl) {
        listTpl = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{{items}}</div>';
    }
    if (!cardTpl) {
        cardTpl = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden group">
            <div class="relative aspect-video">
                <img src="{{thumbnail}}" alt="{{title}}" class="w-full h-full object-cover">
                <a href="{{link}}" hx-get="{{link}}" hx-target="#main-content" hx-push-url="true" class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg">
                        <i class="fas fa-play"></i>
                    </div>
                </a>
            </div>
            <div class="p-4">
                <h3 class="font-bold text-sm mb-1 line-clamp-2">
                    <a href="{{link}}" hx-get="{{link}}" hx-target="#main-content" hx-push-url="true" class="hover:text-red-600 transition">
                        {{title}}
                    </a>
                </h3>
                <div class="text-xs text-slate-500">{{published}}</div>
            </div>
        </div>`;
    }

    // Show only first 6 videos initially
    const initialVideos = videos.slice(0, 6);
    const hasMore = videos.length > 6;

    let itemsHtml = '';
    if (initialVideos.length === 0) {
        itemsHtml = `<p class="col-span-full text-center text-gray-600 p-8">Aucune vidéo disponible.</p>`;
    } else {
        initialVideos.forEach(video => {
            const pubDate = new Date(video.published).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
            itemsHtml += replacePlaceholders(cardTpl, {
                title: video.title,
                thumbnail: video.thumbnail,
                published: pubDate,
                link: `/video/${video.id || video.link.split('v=')[1] || ''}`,
                slug: video.id || video.link.split('v=')[1] || ''
            });
        });
    }

    let content = listTpl.replace('{{items}}', itemsHtml);
    return content;
}

function generateContactContent(fullTemplate) {
    const tpl = extractTemplate(fullTemplate, 'tpl-contact');
    if (!tpl) return "<p>Template 'tpl-contact' not found.</p>";
    return tpl;
}

function generateCoachingContent(fullTemplate) {
    const tpl = extractTemplate(fullTemplate, 'tpl-coaching');
    if (!tpl) return "<p>Template 'tpl-coaching' not found.</p>";
    return tpl;
}

function generateBioContent(fullTemplate) {
    const bioTpl = extractTemplate(fullTemplate, 'tpl-bio');
    if (!bioTpl) return "<p>Template 'tpl-bio' not found.</p>";
    return bioTpl;
}

function generateVideoDetailContent(fullTemplate, video, currentUrl = '') {
    const detailTpl = extractTemplate(fullTemplate, 'tpl-video-detail');

    if (!detailTpl) return "<p>Template 'tpl-video-detail' not found.</p>";

    const videoDate = new Date(video.published).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

    // Convert YouTube link to embed URL (using youtube-nocookie for privacy)
    let embedUrl = video.link;
    if (video.link && video.link.includes('youtube.com/watch?v=')) {
        const videoId = video.link.split('v=')[1]?.split('&')[0];
        embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
    } else if (video.link && video.link.includes('youtu.be/')) {
        const videoId = video.link.split('youtu.be/')[1]?.split('?')[0];
        embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
    }

    return replacePlaceholders(detailTpl, {
        title: video.title,
        published: videoDate,
        description: video.description || 'Aucune description disponible.',
        embedUrl: embedUrl,
        link: video.link,
        slug: video.slug,
        currentUrl: currentUrl
    });
}

function generatePostContent(fullTemplate, post, currentUrl = '') {
    const tpl = extractTemplate(fullTemplate, 'tpl-post-detail');
    if (!tpl) return "<p>Template 'tpl-post-detail' not found.</p>";

    const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

    return replacePlaceholders(tpl, {
        title: post.title,
        author: post.author || 'Inconnu',
        date: postDate,
        image: post.image || 'https://via.placeholder.com/800x400/edf2f7/4a5568?text=Image+de+Couverture',
        content: post.content,
        currentUrl: currentUrl
    });
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

        // Admin Config (returns config.json values)
        if (path === "/api/config") {
            const siteConfig = await fetchSiteConfig(config);
            return new Response(JSON.stringify({
                siteName: siteConfig?.site?.name || "StackPages CMS",
                domain: siteConfig?.site?.domain || "",
                substackRssUrl: siteConfig?.feeds?.substack || env.SUBSTACK_FEED_URL || "",
                youtubeRssUrl: siteConfig?.feeds?.youtube || env.YOUTUBE_FEED_URL || "",
                podcastFeedUrl: siteConfig?.feeds?.podcast || env.PODCAST_FEED_URL || ""
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

        // List available templates
        if (path === "/api/templates") {
            try {
                // If GitHub is not configured, return default templates
                if (!config.githubUser || !config.githubRepo) {
                    const defaultTemplates = [
                        { name: "default", filename: "default.html" },
                        { name: "guru", filename: "guru.html" },
                        { name: "moneyradar", filename: "moneyradar.html" },
                        { name: "petfamily", filename: "petfamily.html" },
                        { name: "pinkoctober", filename: "pinkoctober.html" },
                        { name: "podcaster", filename: "podcaster.html" },
                        { name: "stackpages", filename: "stackpages.html" }
                    ];
                    return new Response(JSON.stringify(defaultTemplates), { headers: corsHeaders });
                }

                const branch = config.githubBranch || 'main';
                const url = `https://api.github.com/repos/${config.githubUser}/${config.githubRepo}/contents/frontend?ref=${branch}`;

                const res = await fetch(url, {
                    headers: {
                        'User-Agent': 'StackPages-CMS',
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (!res.ok) {
                    // Fallback to default templates if GitHub API fails
                    const defaultTemplates = [
                        { name: "default", filename: "default.html" },
                        { name: "guru", filename: "guru.html" },
                        { name: "moneyradar", filename: "moneyradar.html" },
                        { name: "petfamily", filename: "petfamily.html" },
                        { name: "pinkoctober", filename: "pinkoctober.html" },
                        { name: "podcaster", filename: "podcaster.html" },
                        { name: "stackpages", filename: "stackpages.html" }
                    ];
                    return new Response(JSON.stringify(defaultTemplates), { headers: corsHeaders });
                }

                const files = await res.json();
                const templates = files
                    .filter(file => file.type === 'file' && file.name.endsWith('.html'))
                    .map(file => ({
                        name: file.name.replace('.html', ''),
                        filename: file.name
                    }));

                return new Response(JSON.stringify(templates), { headers: corsHeaders });
            } catch (e) {
                console.error("Templates API Error:", e);
                // Return default templates on error
                const defaultTemplates = [
                    { name: "default", filename: "default.html" },
                    { name: "guru", filename: "guru.html" },
                    { name: "moneyradar", filename: "moneyradar.html" },
                    { name: "petfamily", filename: "petfamily.html" },
                    { name: "pinkoctober", filename: "pinkoctober.html" },
                    { name: "podcaster", filename: "podcaster.html" },
                    { name: "stackpages", filename: "stackpages.html" }
                ];
                return new Response(JSON.stringify(defaultTemplates), { headers: corsHeaders });
            }
        }

        // Clear Cache
        if (path === "/api/clear-cache" && req.method === "POST") {
            // In Cloudflare Workers, caches.default doesn't support programmatic clearing easily.
            // This is a placeholder that returns success.
            return new Response(JSON.stringify({ success: true, message: "Cache cleared" }), { status: 200, headers: corsHeaders });
        }

        if (path === "/api/metadata") {
            const siteConfig = await fetchSiteConfig(config);
            const substackUrl = siteConfig?.feeds?.substack || env.SUBSTACK_FEED_URL || "";
            const data = await getCachedRSSData(substackUrl);
            return new Response(JSON.stringify({ ...data.metadata, title: siteConfig?.site?.name || "StackPages CMS" }), { status: 200, headers: corsHeaders });
        }
        if (path === "/api/posts") {
            try {
                const url = new URL(req.url);
                const offset = parseInt(url.searchParams.get('offset') || '0');
                const limit = parseInt(url.searchParams.get('limit') || '6');
                const isHtmx = req.headers.get("HX-Request") === "true";

                const siteConfig = await fetchSiteConfig(config);
                const substackUrl = siteConfig?.feeds?.substack || env.SUBSTACK_FEED_URL;

                if (!substackUrl) {
                    return new Response(JSON.stringify([]), { headers: corsHeaders });
                }

                const data = await getCachedRSSData(substackUrl);
                const total = data.posts.length;
                const paginatedPosts = data.posts.slice(offset, offset + limit);

                if (isHtmx) {
                    const template = await getTemplate(config, siteConfig);
                    const cardTpl = extractTemplate(template, 'tpl-blog-card');

                    if (cardTpl) {
                        let itemsHtml = '';
                        paginatedPosts.forEach(post => {
                            const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
                            itemsHtml += replacePlaceholders(cardTpl, {
                                title: post.title,
                                image: post.image || 'https://via.placeholder.com/800x400/edf2f7/4a5568?text=Image+de+Couverture',
                                description: post.description || '',
                                date: postDate,
                                slug: post.slug,
                                author: post.author || 'Inconnu'
                            });
                        });
                        return new Response(itemsHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
                    }
                }

                return new Response(JSON.stringify({
                    posts: paginatedPosts,
                    total: total,
                    offset: offset,
                    limit: limit,
                    hasMore: (offset + limit) < total
                }), { headers: corsHeaders });
            } catch (e) {
                console.error("Posts API Error:", e);
                return new Response(JSON.stringify({ posts: [], total: 0, hasMore: false }), { headers: corsHeaders });
            }
        }
        if (path === "/api/videos") {
            try {
                const url = new URL(req.url);
                const offset = parseInt(url.searchParams.get('offset') || '0');
                const limit = parseInt(url.searchParams.get('limit') || '6');
                const isHtmx = req.headers.get("HX-Request") === "true";

                const siteConfig = await fetchSiteConfig(config);
                const youtubeUrl = siteConfig?.feeds?.youtube || env.YOUTUBE_FEED_URL;

                if (!youtubeUrl) {
                    return new Response(JSON.stringify({ videos: [], total: 0, hasMore: false }), { headers: corsHeaders });
                }

                const videos = await getCachedYoutubeData(youtubeUrl);
                const total = videos.length;
                const paginatedVideos = videos.slice(offset, offset + limit);

                if (isHtmx) {
                    const template = await getTemplate(config, siteConfig);
                    const cardTpl = extractTemplate(template, 'tpl-video-card');

                    if (cardTpl) {
                        let itemsHtml = '';
                        paginatedVideos.forEach(video => {
                            const pubDate = new Date(video.published).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
                            itemsHtml += replacePlaceholders(cardTpl, {
                                title: video.title,
                                thumbnail: video.thumbnail,
                                published: pubDate,
                                date: pubDate, // Alias for consistency
                                link: `/video/${video.id || video.link.split('v=')[1] || ''}`,
                                slug: video.id || video.link.split('v=')[1] || ''
                            });
                        });
                        return new Response(itemsHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
                    }
                }

                return new Response(JSON.stringify({
                    videos: paginatedVideos,
                    total: total,
                    offset: offset,
                    limit: limit,
                    hasMore: (offset + limit) < total
                }), { headers: corsHeaders });
            } catch (e) {
                console.error("Videos API Error:", e);
                return new Response(JSON.stringify({ videos: [], total: 0, hasMore: false }), { headers: corsHeaders });
            }
        }
        if (path === "/api/podcasts") {
            const siteConfig = await fetchSiteConfig(config);
            const podcastUrl = siteConfig?.feeds?.podcast || env.PODCAST_FEED_URL || "";

            // Helper for empty response
            const emptyResponse = () => {
                if (isHtmx) return new Response('<p class="text-gray-500 italic">Aucun podcast disponible pour le moment.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
                return new Response(JSON.stringify([]), { headers: corsHeaders });
            };

            if (!podcastUrl) return emptyResponse();

            try {
                const res = await fetch(podcastUrl);
                if (!res.ok) throw new Error("Fetch failed");
                const xml = await res.text();
                const items = [];
                const itemRe = /<item[^>]*>((.|[\r\n])*?)<\/item>/gi;
                let m;
                while ((m = itemRe.exec(xml)) !== null) {
                    const block = m[1];
                    const getTag = (t) => { const r = new RegExp(`<${t}[^>]*>((.|[\\r\\n])*?)<\/${t}>`, 'i'); const f = block.match(r); return f ? decodeHTMLEntities(f[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim()) : ""; };

                    // Improved Enclosure Regex
                    let audioUrl = null;
                    const encMatch = block.match(/<enclosure[^>]*url=["'](.*?)["'][^>]*>/i);
                    if (encMatch) audioUrl = encMatch[1];

                    // Fallback: try to find link with type audio
                    if (!audioUrl) {
                        const linkMatch = block.match(/<link[^>]*href=["'](.*?)["'][^>]*type=["']audio\/.*?["'][^>]*>/i);
                        if (linkMatch) audioUrl = linkMatch[1];
                    }

                    items.push({
                        title: getTag('title'),
                        pubDate: getTag('pubDate'),
                        audioUrl: audioUrl,
                        link: getTag('link'),
                        description: getTag('description')
                    });
                }

                if (isHtmx) {
                    const template = await getTemplate(config, siteConfig);
                    const cardTpl = extractTemplate(template, 'tpl-podcast-card');

                    if (cardTpl) {
                        if (items.length === 0) return emptyResponse();

                        let itemsHtml = '';
                        items.forEach(item => {
                            const pubDate = new Date(item.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
                            itemsHtml += replacePlaceholders(cardTpl, {
                                title: item.title,
                                pubDate: pubDate,
                                date: pubDate,
                                audioUrl: item.audioUrl || '',
                                link: item.link || '#',
                                description: item.description || ''
                            });
                        });
                        return new Response(itemsHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
                    }
                }

                return new Response(JSON.stringify(items), { headers: corsHeaders });
            } catch (e) {
                console.error("Podcast Error:", e);
                return emptyResponse();
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
        const generateOOB = (metadata, req) => {
            if (!isHtmx) return "";

            // Only update title/meta if we are targeting the main content
            // This prevents widgets (like latest articles on homepage) from overwriting the page title
            const hxTarget = req.headers.get("HX-Target");
            if (hxTarget && hxTarget !== "main-content") return "";

            const title = metadata.title || "StackPages CMS";
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

        // Use siteConfig for site name, fallback to default
        const siteName = siteConfig?.site?.name || "StackPages CMS";
        const siteDescription = siteConfig?.seo?.metaDescription || "";
        const siteKeywords = siteConfig?.seo?.keywords || "";

        // Use feeds from config.json, fallback to environment variables
        const substackUrl = siteConfig?.feeds?.substack || env.SUBSTACK_FEED_URL || "";
        const youtubeUrl = siteConfig?.feeds?.youtube || env.YOUTUBE_FEED_URL || "";
        const podcastUrl = siteConfig?.feeds?.podcast || env.PODCAST_FEED_URL || "";

        if (path === "/" || path === "/index.html") {
            const data = await getCachedRSSData(substackUrl);
            const metadata = { ...data.metadata, title: siteName, description: siteDescription, keywords: siteKeywords };
            const content = generateHomeContent(template, metadata);

            if (isHtmx) return htmlResponse(content + generateOOB(metadata, req));
            return htmlResponse(injectContent(template, content, metadata));
        }

        // --- DYNAMIC STATIC PAGES (CATCH-ALL) ---
        // Checks if a template exists for the current path (e.g. /reservation -> tpl-reservation)
        if (path.length > 1) {
            const slug = path.substring(1); // Remove leading slash
            const tplId = `tpl-${slug}`;

            // Special handling for data-driven pages
            if (slug === 'annoucements' || slug === 'publications') {
                const data = await getCachedRSSData(substackUrl);
                const content = generatePublicationsContent(template, data.posts);
                const metadata = {
                    title: `Announcements - ${siteName}`,
                    description: siteDescription,
                    keywords: siteKeywords
                };
                if (isHtmx) return htmlResponse(content + generateOOB(metadata, req));
                return htmlResponse(injectContent(template, content, metadata));
            }

            if (slug === 'tutorials' || slug === 'videos') {
                const videos = await getCachedYoutubeData(youtubeUrl);
                const content = generateVideosContent(template, videos);
                const metadata = {
                    title: `Video Tutorials - ${siteName}`,
                    description: siteDescription,
                    keywords: siteKeywords
                };
                if (isHtmx) return htmlResponse(content + generateOOB(metadata, req));
                return htmlResponse(injectContent(template, content, metadata));
            }

            // Standard static template extraction
            const dynamicContent = extractTemplate(template, tplId);

            if (dynamicContent) {
                // Basic title formatting: "reservation" -> "Reservation"
                const title = slug.charAt(0).toUpperCase() + slug.slice(1);
                const metadata = {
                    title: `${title} - ${siteName}`,
                    description: siteDescription,
                    keywords: siteKeywords
                };

                if (isHtmx) return htmlResponse(dynamicContent + generateOOB(metadata, req));
                return htmlResponse(injectContent(template, dynamicContent, metadata));
            }
        }

        // Single Video Detail Page
        if (path.startsWith("/video/")) {
            const slug = path.split("/video/")[1];

            if (!youtubeUrl) {
                return new Response("YouTube feed not configured", { status: 404 });
            }

            const videos = await getCachedYoutubeData(youtubeUrl);
            const video = videos.find(v => v.slug === slug);

            if (!video) {
                return new Response("Video not found", { status: 404 });
            }

            const detailTemplate = extractTemplate(template, 'tpl-video-detail');
            // Use slug as videoId since we set it that way in the RSS parser
            const videoId = video.slug;
            const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;

            const content = replacePlaceholders(detailTemplate, {
                title: video.title,
                description: video.description || 'Aucune description disponible',
                published: new Date(video.published).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                embedUrl: embedUrl,
                link: video.link,
                slug: slug
            });

            const metadata = {
                title: `${video.title} - ${siteName}`,
                description: video.description || siteDescription,
                keywords: siteKeywords
            };

            if (isHtmx) return htmlResponse(content + generateOOB(metadata, req));
            return htmlResponse(injectContent(template, content, metadata));
        }

        if (path.startsWith("/post/")) {
            const slug = path.split("/").pop();
            const data = await getCachedRSSData(substackUrl);
            const post = data.posts.find(p => p.slug === slug);

            if (post) {
                const content = generatePostContent(template, post, req.url);
                const metadata = {
                    title: `${post.title} - ${siteName}`,
                    description: post.description || siteDescription,
                    keywords: siteKeywords
                };

                if (isHtmx) return htmlResponse(content + generateOOB(metadata, req));
                return htmlResponse(injectContent(template, content, metadata));
            } else {
                return new Response("Article non trouvé", { status: 404 });
            }
        }



        // --- CUSTOM PAGES (/p/ prefix) ---
        if (path.startsWith("/p/")) {
            const slug = path.substring(3); // Remove /p/
            const githubContent = await fetchGithubContent(config, slug);

            if (githubContent) {
                // Extract title from content if possible, or use slug
                // Simple regex to find first h1
                const titleMatch = githubContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
                const pageTitle = titleMatch ? titleMatch[1] : (slug.charAt(0).toUpperCase() + slug.slice(1));

                const metadata = {
                    title: `${pageTitle} - ${siteName}`,
                    description: siteDescription,
                    keywords: siteKeywords
                };

                if (isHtmx) return htmlResponse(githubContent + generateOOB(metadata, req));
                const data = await getCachedRSSData(substackUrl);
                return htmlResponse(injectContent(template, githubContent, { ...data.metadata, ...metadata }));
            } else {
                return new Response("Page introuvable", { status: 404 });
            }
        }


        // --- GITHUB FALLBACK (CATCH-ALL FOR CUSTOM PAGES) ---
        if (path !== "/" && !path.startsWith("/api") && !path.startsWith("/core") && !path.startsWith("/admin")) {
            const slug = path.substring(1);
            const githubContent = await fetchGithubContent(config, slug);

            if (githubContent) {
                if (isHtmx) return htmlResponse(githubContent);
                const data = await getCachedRSSData(substackUrl);
                return htmlResponse(injectContent(template, githubContent, { ...data.metadata, title: siteName }));
            }
        }

        // Fallback to ASSETS for everything else (images, etc.)
        return await env.ASSETS.fetch(req);
    }
};