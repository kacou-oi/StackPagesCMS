// ====================================================================
// 1. CONFIGURATION ET UTILITAIRES
// ====================================================================

const CACHE_TTL = 180;

// GitHub OAuth Configuration
const GITHUB_OAUTH_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_USER_URL = "https://api.github.com/user";

// Cookie helper functions
function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) cookies[name] = value;
    });
    return cookies;
}

function createAuthCookie(token, maxAge = 86400 * 7) {
    return `github_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearAuthCookie() {
    return `github_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function getGitHubUser(token) {
    try {
        const res = await fetch(GITHUB_API_USER_URL, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'StackPages-CMS',
                'Accept': 'application/json'
            }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

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

    // 2. Inject Main Content
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
    const listTpl = extractTemplate(fullTemplate, 'tpl-blog-list');
    const cardTpl = extractTemplate(fullTemplate, 'tpl-blog-card');

    if (!listTpl || !cardTpl) return "<p>Templates 'tpl-blog-list' or 'tpl-blog-card' not found.</p>";

    let itemsHtml = '';
    if (posts.length === 0) {
        itemsHtml = `<p class="col-span-full text-center text-gray-600 p-8">Aucune publication trouvée.</p>`;
    } else {
        posts.forEach(post => {
            const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
            itemsHtml += replacePlaceholders(cardTpl, {
                title: post.title,
                description: post.description ? post.description.substring(0, 120) + '...' : '',
                author: post.author || 'Inconnu',
                date: postDate,
                image: post.image || 'https://via.placeholder.com/600x400/edf2f7/4a5568?text=Image+Article',
                slug: post.slug
            });
        });
    }

    return replacePlaceholders(listTpl, { items: itemsHtml });
}

function generateVideosContent(fullTemplate, videos) {
    const listTpl = extractTemplate(fullTemplate, 'tpl-video-list');
    const cardTpl = extractTemplate(fullTemplate, 'tpl-video-card');

    if (!listTpl || !cardTpl) return "<p>Templates 'tpl-video-list' or 'tpl-video-card' not found.</p>";

    let itemsHtml = '';
    if (videos.length === 0) {
        itemsHtml = `<p class="col-span-full text-center text-gray-600 p-8">Aucune vidéo trouvée.</p>`;
    } else {
        videos.forEach(video => {
            const videoDate = new Date(video.published).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
            itemsHtml += replacePlaceholders(cardTpl, {
                title: video.title,
                date: videoDate,
                thumbnail: video.thumbnail || 'https://via.placeholder.com/600x338/edf2f7/4a5568?text=Vid%C3%A9o',
                link: video.link
            });
        });
    }

    return replacePlaceholders(listTpl, { items: itemsHtml });
}

function generateContactContent(fullTemplate) {
    const tpl = extractTemplate(fullTemplate, 'tpl-contact');
    if (!tpl) return "<p>Template 'tpl-contact' not found.</p>";
    return tpl;
}

function generatePostContent(fullTemplate, post) {
    const tpl = extractTemplate(fullTemplate, 'tpl-post-detail');
    if (!tpl) return "<p>Template 'tpl-post-detail' not found.</p>";

    const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

    return replacePlaceholders(tpl, {
        title: post.title,
        author: post.author || 'Inconnu',
        date: postDate,
        image: post.image || 'https://via.placeholder.com/800x400/edf2f7/4a5568?text=Image+de+Couverture',
        content: post.content
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

        // ====================================================================
        // GITHUB OAUTH ROUTES
        // ====================================================================

        // Start OAuth flow - redirect to GitHub
        if (path === "/auth/github") {
            const clientId = env.GITHUB_CLIENT_ID;
            if (!clientId) {
                return new Response("GitHub OAuth not configured (missing GITHUB_CLIENT_ID)", { status: 500 });
            }
            const redirectUri = `${url.origin}/auth/github/callback`;
            const scope = "read:user";
            const authUrl = `${GITHUB_OAUTH_AUTHORIZE_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
            return Response.redirect(authUrl, 302);
        }

        // OAuth callback - exchange code for token
        if (path === "/auth/github/callback") {
            const code = url.searchParams.get("code");
            if (!code) {
                return new Response("Missing authorization code", { status: 400 });
            }

            const clientId = env.GITHUB_CLIENT_ID;
            const clientSecret = env.GITHUB_CLIENT_SECRET;
            if (!clientId || !clientSecret) {
                return new Response("GitHub OAuth not configured", { status: 500 });
            }

            try {
                // Exchange code for access token
                const tokenRes = await fetch(GITHUB_OAUTH_TOKEN_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        client_id: clientId,
                        client_secret: clientSecret,
                        code: code
                    })
                });

                const tokenData = await tokenRes.json();
                if (tokenData.error || !tokenData.access_token) {
                    return new Response(`OAuth Error: ${tokenData.error_description || tokenData.error}`, { status: 400 });
                }

                // Set cookie and redirect to dashboard
                return new Response(null, {
                    status: 302,
                    headers: {
                        "Location": "/admin/dashboard.html",
                        "Set-Cookie": createAuthCookie(tokenData.access_token)
                    }
                });
            } catch (e) {
                return new Response(`OAuth Error: ${e.message}`, { status: 500 });
            }
        }

        // Get current authenticated user
        if (path === "/api/auth/user") {
            const cookies = parseCookies(req.headers.get("Cookie"));
            const token = cookies.github_token;

            if (!token) {
                return new Response(JSON.stringify({ authenticated: false }), { headers: corsHeaders });
            }

            const user = await getGitHubUser(token);
            if (!user) {
                return new Response(JSON.stringify({ authenticated: false }), {
                    headers: { ...corsHeaders, "Set-Cookie": clearAuthCookie() }
                });
            }

            return new Response(JSON.stringify({
                authenticated: true,
                user: {
                    login: user.login,
                    name: user.name,
                    avatar_url: user.avatar_url,
                    html_url: user.html_url
                }
            }), { headers: corsHeaders });
        }

        // Logout
        if (path === "/api/auth/logout") {
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Set-Cookie": clearAuthCookie() }
            });
        }

        // --- STATIC ASSETS (CORE) ---
        if (path.startsWith("/core/")) {
            return await env.ASSETS.fetch(req);
        }

        // --- API ROUTES ---
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

        // Load Site Config and Super Template
        const siteConfig = await fetchSiteConfig(config);
        const template = await getTemplate(config, siteConfig);
        if (!template) return new Response("Error: Template not found. Check config.json and templates/ folder.", { status: 500 });

        // Use siteConfig for site name, fallback to RSS metadata or default
        const siteName = siteConfig?.site?.name || config.siteName;
        const siteDescription = siteConfig?.seo?.metaDescription || "";

        // Use feeds from config.json if environment variables are not set
        const substackUrl = config.substackRssUrl || siteConfig?.feeds?.substack || "";
        const youtubeUrl = config.youtubeRssUrl || siteConfig?.feeds?.youtube || "";

        if (path === "/" || path === "/index.html") {
            const data = await getCachedRSSData(substackUrl);
            const content = generateHomeContent(template, { ...data.metadata, title: siteName });
            if (isHtmx) return htmlResponse(content);
            return htmlResponse(injectContent(template, content, { ...data.metadata, title: siteName, description: siteDescription }));
        }

        if (path === "/publications") {
            const data = await getCachedRSSData(substackUrl);
            const content = generatePublicationsContent(template, data.posts);
            if (isHtmx) return htmlResponse(content);
            return htmlResponse(injectContent(template, content, { ...data.metadata, title: siteName }));
        }

        if (path === "/videos") {
            const videos = await getCachedYoutubeData(youtubeUrl);
            const content = generateVideosContent(template, videos);
            if (isHtmx) return htmlResponse(content);

            const data = await getCachedRSSData(substackUrl);
            return htmlResponse(injectContent(template, content, { ...data.metadata, title: siteName }));
        }

        if (path === "/contact") {
            const content = generateContactContent(template);
            if (isHtmx) return htmlResponse(content);

            const data = await getCachedRSSData(substackUrl);
            return htmlResponse(injectContent(template, content, { ...data.metadata, title: siteName }));
        }

        if (path.startsWith("/post/")) {
            const slug = path.split("/").pop();
            const data = await getCachedRSSData(substackUrl);
            const post = data.posts.find(p => p.slug === slug);

            if (post) {
                const content = generatePostContent(template, post);
                if (isHtmx) return htmlResponse(content);
                return htmlResponse(injectContent(template, content, { ...data.metadata, title: siteName }));
            } else {
                return new Response("Article non trouvé", { status: 404 });
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

        // Fallback to ASSETS
        return await env.ASSETS.fetch(req);
    }
};