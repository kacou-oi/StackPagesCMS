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
// 4. HTML RENDERING (SSR)
// ====================================================================

function renderLayout(content, metadata, activePath) {
    const title = metadata.title || "StackPages";
    const logo = metadata.logo || "";

    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title id="site-title">${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <link href="/core/style.css" rel="stylesheet">
</head>
<body class="font-sans antialiased text-gray-800 bg-gray-50 flex flex-col min-h-screen">

    <!-- Header -->
    <header class="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md shadow-sm">
        <nav class="container mx-auto px-4 py-3 flex items-center justify-between relative">
            <!-- Left Group: Logo and Podcast Player -->
            <div class="flex items-center space-x-4 md:space-x-6">
                <a href="/" hx-get="/" hx-target="#main-content" hx-push-url="true"
                    class="flex items-center text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
                    id="header-logo-link">
                    <img id="header-logo" src="${logo}" alt="Logo" class="h-8 mr-2 transition-transform hover:scale-105"
                        onerror="this.style.display='none';" style="${logo ? '' : 'display: none;'}">
                    <span id="header-site-name" class="">${title}</span>
                </a>
                <!-- Podcast Player in Header -->
                <div id="header-podcast-player-container"
                    class="hidden md:flex items-center space-x-2 rounded-full shadow-sm px-2 py-1">
                    <!-- Player rendered by client.js -->
                </div>
            </div>

            <!-- Main Navigation (Desktop) -->
            <div class="hidden md:flex space-x-8 absolute left-1/2 -translate-x-1/2 z-20">
                <a href="/" hx-get="/" hx-target="#main-content" hx-push-url="true"
                    class="header-nav-link hover:text-blue-600 transition-colors relative group py-2 ${activePath === '/' ? 'text-blue-600 font-semibold' : 'text-gray-600'}">
                    Accueil
                    <span class="absolute bottom-0 left-0 h-0.5 bg-blue-600 group-hover:w-full transition-all duration-300" style="width: ${activePath === '/' ? '100%' : '0px'};"></span>
                </a>
                <a href="/publications" hx-get="/publications" hx-target="#main-content" hx-push-url="true"
                    class="header-nav-link hover:text-blue-600 transition-colors relative group py-2 ${activePath === '/publications' ? 'text-blue-600 font-semibold' : 'text-gray-600'}">
                    Publications
                    <span class="absolute bottom-0 left-0 h-0.5 bg-blue-600 group-hover:w-full transition-all duration-300" style="width: ${activePath === '/publications' ? '100%' : '0px'};"></span>
                </a>
                <a href="/videos" hx-get="/videos" hx-target="#main-content" hx-push-url="true"
                    class="header-nav-link hover:text-blue-600 transition-colors relative group py-2 ${activePath === '/videos' ? 'text-blue-600 font-semibold' : 'text-gray-600'}">
                    Vidéos
                    <span class="absolute bottom-0 left-0 h-0.5 bg-blue-600 group-hover:w-full transition-all duration-300" style="width: ${activePath === '/videos' ? '100%' : '0px'};"></span>
                </a>
                <a href="/contact" hx-get="/contact" hx-target="#main-content" hx-push-url="true"
                    class="header-nav-link hover:text-blue-600 transition-colors relative group py-2 ${activePath === '/contact' ? 'text-blue-600 font-semibold' : 'text-gray-600'}">
                    Contact
                    <span class="absolute bottom-0 left-0 h-0.5 bg-blue-600 group-hover:w-full transition-all duration-300" style="width: ${activePath === '/contact' ? '100%' : '0px'};"></span>
                </a>
            </div>

            <!-- Right Group -->
            <div class="flex items-center space-x-4">
                <button class="md:hidden p-2 text-gray-600 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md" id="mobile-menu-button">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
                <a href="/contact" hx-get="/contact" hx-target="#main-content" hx-push-url="true"
                    class="hidden md:block bg-blue-600 text-white px-5 py-2 rounded-full shadow-lg hover:bg-blue-700 transition-all duration-300 transform hover:scale-105">
                    Me Contacter
                </a>
            </div>
        </nav>
        
        <!-- Mobile Menu -->
        <div id="mobile-menu-overlay" class="fixed inset-0 bg-black/50 z-40 hidden md:hidden"></div>
        <div id="mobile-menu" class="fixed top-0 right-0 h-full w-64 bg-white shadow-xl transform translate-x-full transition-transform duration-300 ease-in-out z-50 md:hidden">
            <div class="p-6">
                <button class="absolute top-4 right-4 text-gray-500 hover:text-gray-700" id="close-mobile-menu">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <div class="mt-8 flex flex-col space-y-4">
                    <a href="/" hx-get="/" hx-target="#main-content" hx-push-url="true" class="text-lg hover:text-blue-600 transition-colors block py-2 px-3 rounded-md hover:bg-gray-100">Accueil</a>
                    <a href="/publications" hx-get="/publications" hx-target="#main-content" hx-push-url="true" class="text-lg hover:text-blue-600 transition-colors block py-2 px-3 rounded-md hover:bg-gray-100">Publications</a>
                    <a href="/videos" hx-get="/videos" hx-target="#main-content" hx-push-url="true" class="text-lg hover:text-blue-600 transition-colors block py-2 px-3 rounded-md hover:bg-gray-100">Vidéos</a>
                    <a href="/contact" hx-get="/contact" hx-target="#main-content" hx-push-url="true" class="text-lg hover:text-blue-600 transition-colors block py-2 px-3 rounded-md hover:bg-gray-100">Contact</a>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content Area -->
    <main id="main-content" class="flex-grow pt-20">
        ${content}
    </main>

    <!-- Modals (Hidden by default) -->
    <div id="article-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto hidden">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative transform transition-all duration-300">
            <button class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors z-10" id="close-article-modal">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <div id="article-modal-content" class="relative">
                <img id="modal-article-image" src="" alt="Image de Couverture" class="w-full h-64 object-cover rounded-t-lg mb-6">
                <div class="p-6 md:p-8 lg:p-10">
                    <h2 id="modal-article-title" class="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4 leading-tight"></h2>
                    <p class="text-gray-500 text-sm mb-6">Par <span id="modal-article-author" class="font-medium"></span> le <span id="modal-article-pubdate"></span></p>
                    <div id="modal-article-body" class="max-w-none text-gray-700 leading-relaxed article-content"></div>
                    <div class="mt-8 pt-6 border-t border-gray-200 flex flex-wrap gap-4 items-center justify-center">
                        <span class="text-gray-600 text-lg font-semibold mr-2">Partager:</span>
                        <a id="share-facebook" href="#" target="_blank" class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"><svg fill="currentColor" viewBox="0 0 24 24" class="w-5 h-5"><path d="M14 13.5h2.001l.4-2.001H14v-1.144c0-.573.284-.856.856-.856h1.145V8.001h-2.001c-2.4 0-3.145 1.745-3.145 3.145V13.5H9.5V15.5h2.501V22h3.999V15.5H18L17 13.5h-3z"></path></svg></a>
                        <a id="share-twitter" href="#" target="_blank" class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-400 text-white hover:bg-blue-500 transition-colors"><svg fill="currentColor" viewBox="0 0 24 24" class="w-5 h-5"><path d="M18.244 2.25h3.308l-7.227 8.26L21.602 22H15.6L10.957 13.992L4.397 22H0L7.735 13.143L0.99 2.25h7.227L12.987 9.847L18.244 2.25Zm-2.349 1.4L7.404 21.006h2.842L17.595 3.65H15.895Z"></path></svg></a>
                        <a id="share-linkedin" href="#" target="_blank" class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors"><svg fill="currentColor" viewBox="0 0 24 24" class="w-5 h-5"><path d="M20.447 20.452h-3.518v-5.595c0-1.332-.51-2.247-1.684-2.247-1.282 0-2.007.868-2.333 1.708-.12.302-.15.725-.15 1.157v4.977h-3.519s.047-9.664 0-10.648h3.519v1.503c-.027.051-.054.09-.08.13-.393-.683-.872-1.397-2.185-1.397-2.668 0-4.665 1.789-4.665 5.595v5.807H3.882V9.804h3.519v1.503a3.52 3.52 0 0 0 .15-.13c.42-.69.878-1.397 2.277-1.397 2.916 0 5.105 2.156 5.105 6.777v5.807h3.518V14.15c0-2.31-.01-3.6-0.01-3.6zM6.92 5.275a2.27 2.27 0 1 1-4.54 0 2.27 2.27 0 0 1 4.54 0z"></path></svg></a>
                        <a id="share-mail" href="#" target="_blank" class="flex items-center justify-center w-10 h-10 rounded-full bg-gray-600 text-white hover:bg-gray-700 transition-colors"><svg fill="currentColor" viewBox="0 0 24 24" class="w-5 h-5"><path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"></path></svg></a>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="video-modal" class="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 hidden">
        <div class="relative w-full max-w-4xl aspect-video bg-gray-900 rounded-lg shadow-xl transform transition-all duration-300">
            <button class="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors z-10" id="close-video-modal">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <iframe id="video-player" class="w-full h-full rounded-lg" src="" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
    </div>

    <!-- Footer -->
    <footer class="bg-gray-800 text-white py-8 mt-auto">
        <div class="container mx-auto px-4 text-center">
            <div class="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4">
                <a href="/" hx-get="/" hx-target="#main-content" hx-push-url="true" class="footer-nav-link hover:text-white transition-colors text-white">Accueil</a>
                <a href="/publications" hx-get="/publications" hx-target="#main-content" hx-push-url="true" class="footer-nav-link text-gray-300 hover:text-white transition-colors">Publications</a>
                <a href="/videos" hx-get="/videos" hx-target="#main-content" hx-push-url="true" class="footer-nav-link text-gray-300 hover:text-white transition-colors">Vidéos</a>
                <a href="/contact" hx-get="/contact" hx-target="#main-content" hx-push-url="true" class="footer-nav-link text-gray-300 hover:text-white transition-colors">Contact</a>
            </div>
            <p class="text-gray-400">© 2025 <span id="footer-site-name-copyright">${title}</span>. Tous droits réservés.</p>
        </div>
    </footer>

    <script src="/core/client.js"></script>
</body>
</html>`;
}

function renderHome(metadata) {
    // Note: Ideally, we should fetch some latest posts/videos for the home page too, 
    // but to keep it simple and matching the SPA, we'll keep the static sections and links.
    return `
    <section class="relative bg-gradient-to-br from-blue-500 to-blue-700 text-white py-20 md:py-32 overflow-hidden shadow-xl">
        <div class="absolute inset-0 bg-blue-800/20 opacity-10"></div>
        <div class="container mx-auto px-6 relative z-10 text-center">
            <img src="https://raw.githubusercontent.com/kacou-oi/StackPagesCMS/main/content/images/1764728284077-photo-de-profil-pro.jpg" alt="Photo de profil" class="w-28 h-28 rounded-full object-cover mx-auto mb-6 border-4 border-white shadow-lg animate-fade-in transform hover:scale-110 transition-transform duration-500 delay-100">
            <h1 class="text-4xl md:text-6xl font-extrabold leading-tight mb-6 animate-fade-in delay-200">
                Bienvenue sur mon univers digital
            </h1>
            <p class="text-lg md:text-xl mb-10 max-w-3xl mx-auto opacity-90 animate-fade-in delay-300">
                Explorez mes publications, découvrez mes projets et connectons-nous.
            </p>
            <a href="/publications" hx-get="/publications" hx-target="#main-content" hx-push-url="true" class="bg-white text-blue-600 px-8 py-3 rounded-full text-lg font-semibold shadow-lg hover:bg-gray-100 hover:scale-105 transition-all duration-300 inline-block animate-fade-in delay-400">
                Découvrir les Publications
            </a>
        </div>
    </section>

    <section class="py-16 md:py-24 bg-gray-50">
        <div class="container mx-auto px-6 flex flex-col md:flex-row items-center gap-12">
            <div class="md:w-1/2">
                <img src="https://images.pexels.com/photos/5384448/pexels-photo-5384448.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" alt="À propos de moi" class="rounded-xl shadow-2xl transform hover:scale-105 transition-transform duration-500 ease-in-out border-4 border-white">
            </div>
            <div class="md:w-1/2 text-center md:text-left">
                <h2 class="text-4xl font-extrabold text-gray-900 mb-6">À Propos de Moi</h2>
                <p class="text-lg text-gray-700 leading-relaxed mb-6">
                    Passionné par le développement web dynamique et l'innovation technologique, je mets mon expertise au service de projets ambitieux. Mon parcours est jalonné de succès dans la création de solutions digitales performantes et esthétiques, toujours à la pointe des dernières tendances.
                </p>
                <p class="text-lg text-gray-700 leading-relaxed">
                    J'aime transformer des idées complexes en expériences utilisateur fluides et intuitives. Chaque projet est une opportunité de repousser les limites et de créer de la valeur durable pour mes clients et utilisateurs.
                </p>
            </div>
        </div>
    </section>

    <section class="py-16 md:py-24 bg-white">
        <div class="container mx-auto px-6">
            <h2 class="text-4xl font-extrabold text-gray-900 text-center mb-12">Mes Domaines d'Expertise</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <!-- Expertise Cards (Static) -->
                <div class="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 group">
                    <div class="flex items-center justify-center w-16 h-16 bg-blue-500 text-white rounded-full mb-6 mx-auto group-hover:rotate-6 transition-transform duration-300">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-3 1h2m0-11V9a2 2 0 00-2-2L6 5V4c0-1.105.895-2 2-2h4c1.105 0 2 .895 2 2v2l-1-1h-2a2 2 0 00-2 2v2m0 0a2 2 0 012 2v2a2 2 0 01-2 2H9a2 2 0 01-2-2v-2a2 2 0 012-2m-1 9L6 20"></path></svg>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-900 mb-4 text-center">Développement Front-end</h3>
                    <p class="text-gray-700 text-center leading-relaxed">Création d'interfaces utilisateur réactives et intuitives.</p>
                </div>
                <!-- Add more cards as needed, keeping it brief for the worker file -->
            </div>
        </div>
    </section>

    <section class="py-16 md:py-24 bg-gradient-to-tr from-blue-500 to-blue-700 text-white shadow-inner">
        <div class="container mx-auto px-6 text-center">
            <h2 class="text-4xl font-extrabold mb-8">Prêt à explorer davantage ?</h2>
            <div class="flex flex-col md:flex-row justify-center gap-6">
                <a href="/publications" hx-get="/publications" hx-target="#main-content" hx-push-url="true" class="bg-white text-blue-600 px-8 py-4 rounded-full text-lg font-semibold shadow-xl hover:bg-gray-100 hover:scale-105 transition-all duration-300">
                    Voir mes Publications
                </a>
                <a href="/videos" hx-get="/videos" hx-target="#main-content" hx-push-url="true" class="bg-blue-800 text-white px-8 py-4 rounded-full text-lg font-semibold shadow-xl hover:bg-blue-700 hover:scale-105 transition-all duration-300">
                    Découvrir mes Vidéos
                </a>
            </div>
        </div>
    </section>
    `;
}

function renderPublications(posts) {
    let postsHtml = '';
    if (posts.length === 0) {
        postsHtml = `<p class="col-span-full text-center text-gray-600 p-8">Aucune publication trouvée pour le moment.</p>`;
    } else {
        posts.forEach(post => {
            const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
            // Escape JSON for the onclick handler
            const postJson = JSON.stringify(post).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

            postsHtml += `
            <div class="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden cursor-pointer group"
                 onclick="openArticleModal(${postJson.replace(/"/g, "'")})"> <!-- Note: Simple inline JSON passing, careful with quotes -->
                <img src="${post.image || 'https://via.placeholder.com/600x400/edf2f7/4a5568?text=Image+Article'}" alt="${post.title}" class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500 ease-in-out">
                <div class="p-6">
                    <h3 class="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">${post.title}</h3>
                    <p class="text-gray-600 text-sm mb-4">${post.description ? post.description.substring(0, 120) + '...' : ''}</p>
                    <div class="flex justify-between items-center text-gray-500 text-xs">
                        <span>Par ${post.author || 'Inconnu'}</span>
                        <span>${postDate}</span>
                    </div>
                </div>
            </div>`;
        });
    }

    return `
    <section class="container mx-auto px-6 py-10 md:py-16">
        <h2 class="text-4xl font-extrabold text-gray-900 text-center mb-12">Mes Dernières Publications</h2>
        <div id="publications-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${postsHtml}
        </div>
        <!-- Pagination is omitted for MVP SSR, can be added later -->
    </section>
    `;
}

function renderVideos(videos) {
    let videosHtml = '';
    if (videos.length === 0) {
        videosHtml = `<p class="col-span-full text-center text-gray-600 p-8">Aucune vidéo trouvée pour le moment.</p>`;
    } else {
        videos.forEach(video => {
            const videoDate = new Date(video.published).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
            videosHtml += `
            <div class="bg-transparent rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden cursor-pointer group relative aspect-video"
                 onclick="openVideoModal('${video.link}')">
                <img src="${video.thumbnail || 'https://via.placeholder.com/600x338/edf2f7/4a5568?text=Vid%C3%A9o'}" alt="${video.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-in-out absolute inset-0">
                <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                    <div class="p-4 bg-blue-600 rounded-full shadow-xl transform group-hover:scale-110 transition-transform duration-300">
                        <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
                <div class="p-4 absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent z-10">
                    <h3 class="text-lg font-semibold text-white mb-1 leading-tight group-hover:text-blue-400 transition-colors">${video.title}</h3>
                    <p class="text-gray-200 text-xs">${videoDate}</p>
                </div>
            </div>`;
        });
    }

    return `
    <section class="container mx-auto px-6 py-10 md:py-16">
        <h2 class="text-4xl font-extrabold text-gray-900 text-center mb-12">Mes Dernières Vidéos</h2>
        <div id="videos-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${videosHtml}
        </div>
    </section>
    `;
}

function renderContact() {
    return `
    <section class="container mx-auto px-6 py-10 md:py-16">
        <h2 class="text-4xl font-extrabold text-gray-900 text-center mb-12">Me Contacter</h2>
        <div class="max-w-xl mx-auto bg-white rounded-xl shadow-lg p-8 md:p-10">
            <form id="contact-form" class="space-y-6">
                <div>
                    <label for="name" class="block text-sm font-medium text-gray-700 mb-2">Nom Complet</label>
                    <input type="text" id="name" name="name" class="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required>
                </div>
                <div>
                    <label for="email" class="block text-sm font-medium text-gray-700 mb-2">Adresse E-mail</label>
                    <input type="email" id="email" name="email" class="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required>
                </div>
                <div>
                    <label for="subject" class="block text-sm font-medium text-gray-700 mb-2">Sujet</label>
                    <input type="text" id="subject" name="subject" class="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required>
                </div>
                <div>
                    <label for="message" class="block text-sm font-medium text-gray-700 mb-2">Message</label>
                    <textarea id="message" name="message" rows="5" class="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required></textarea>
                </div>
                <button type="submit" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-300 transform hover:scale-105">
                    Envoyer le Message
                </button>
                <div id="form-status" class="mt-4 text-center text-sm font-medium"></div>
            </form>
        </div>
    </section>
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
            author: "Admin"
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

        // --- API ROUTES (Keep existing API for client-side hydration/modals if needed) ---
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
            // Basic proxy for podcasts to avoid CORS if needed, or just return empty if not implemented fully in SSR yet
            // Reusing logic from previous worker for API compatibility
            if (!config.podcastFeedUrl) return new Response(JSON.stringify([]), { headers: corsHeaders });
            try {
                const res = await fetch(config.podcastFeedUrl);
                if (!res.ok) throw new Error("Fetch failed");
                const xml = await res.text();
                // Simple parse (simplified for brevity, ideally share logic)
                // For now, let's just return the raw XML or implement the parser if the client needs JSON.
                // The client.js expects JSON.
                // We can implement a quick parser or just return empty for now to focus on SSR.
                // Let's implement the parser quickly to keep the player working.
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

        // --- SSR ROUTES ---
        const isHtmx = req.headers.get("HX-Request") === "true";

        // Helper to return HTML response
        const htmlResponse = (html) => new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });

        if (path === "/" || path === "/index.html") {
            const data = await getCachedRSSData(config.substackRssUrl);
            const content = renderHome({ ...data.metadata, title: config.siteName });
            if (isHtmx) return htmlResponse(content);
            return htmlResponse(renderLayout(content, { ...data.metadata, title: config.siteName }, '/'));
        }

        if (path === "/publications") {
            const data = await getCachedRSSData(config.substackRssUrl);
            const content = renderPublications(data.posts);
            if (isHtmx) return htmlResponse(content);
            return htmlResponse(renderLayout(content, { ...data.metadata, title: config.siteName }, '/publications'));
        }

        if (path === "/videos") {
            const videos = await getCachedYoutubeData(config.youtubeRssUrl);
            const content = renderVideos(videos);
            if (isHtmx) return htmlResponse(content);
            // Need metadata for layout, fetch it or use defaults
            const data = await getCachedRSSData(config.substackRssUrl);
            return htmlResponse(renderLayout(content, { ...data.metadata, title: config.siteName }, '/videos'));
        }

        if (path === "/contact") {
            const content = renderContact();
            if (isHtmx) return htmlResponse(content);
            const data = await getCachedRSSData(config.substackRssUrl);
            return htmlResponse(renderLayout(content, { ...data.metadata, title: config.siteName }, '/contact'));
        }

        // Fallback to ASSETS for everything else (images, etc.)
        return await env.ASSETS.fetch(req);
    }
};