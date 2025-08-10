import config from './config.json';

// Les fonctions utilitaires sont définies ici pour être utilisées par le worker
// Cette fonction nettoie une chaîne de caractères pour en faire un slug d'URL
function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .trim();
}

// Cette fonction décode les entités HTML (ex: & en &) dans une chaîne
function decodeHTMLEntities(str) {
    if (!str) return "";
    const map = {
        "nbsp": " ",
        "amp": "&",
        "quot": "\"",
        "lt": "<",
        "gt": ">",
        "#39": "'"
    };
    return str.replace(/&(#?\w+);/g, (match, entity) => {
        if (entity.startsWith('#')) {
            const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
            return String.fromCharCode(code);
        }
        return map[entity] || match;
    });
}

// Cette fonction extrait l'URL de la première image dans un contenu HTML
function extractFirstImage(html) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/i;
    const match = html.match(imgRe);
    return match ? match[1] : null;
}

// Fonction principale pour aller chercher et analyser le flux RSS de Substack
async function fetchAndParseRSS(feedUrl) {
    const res = await fetch(feedUrl);
    const xml = await res.text();
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

        let contentFull = "";
        const contentEncodedRe = /<content:encoded[^>]*>((.|[\r\n])*?)<\/content:encoded>/i;
        const contentEncodedMatch = block.match(contentEncodedRe);
        if (contentEncodedMatch) {
            contentFull = contentEncodedMatch[1].trim();
            if (contentFull.startsWith('<![CDATA[')) {
                contentFull = contentFull.slice(9, -3).trim();
            }
            contentFull = decodeHTMLEntities(contentFull);
        } else {
            contentFull = description;
        }

        const image = extractFirstImage(contentFull);
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
    return items;
}

// Nouvelle fonction pour le flux RSS de YouTube
async function fetchAndParseYouTubeRSS(feedUrl) {
    const res = await fetch(feedUrl);
    const xml = await res.text();
    const items = [];
    const entryRe = /<entry[^>]*>((.|[\r\n])*?)<\/entry>/gi;
    let m;

    while ((m = entryRe.exec(xml)) !== null) {
        const block = m[1];
        const getTag = (tag, namespace = '') => {
            const re = namespace
                ? new RegExp(`<${namespace}:${tag}[^>]*>((.|[\r\n])*?)<\/${namespace}:${tag}>`, 'i')
                : new RegExp(`<${tag}[^>]*>((.|[\r\n])*?)<\/${tag}>`, 'i');
            const found = block.match(re);
            if (!found) return "";
            let content = found[1].trim();
            return decodeHTMLEntities(content);
        };

        const getAttr = (tag, attr, namespace = '') => {
            const re = namespace
                ? new RegExp(`<${namespace}:${tag}[^>]*${attr}=["']([^"']+)["']`, 'i')
                : new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i');
            const found = block.match(re);
            return found ? found[1] : "";
        };

        const id = getTag('videoId', 'yt');
        const title = getTag('title');
        const pubDate = getTag('published');
        const description = getTag('description', 'media');
        const thumbnail = getAttr('thumbnail', 'url', 'media');

        items.push({
            id,
            title,
            pubDate,
            description,
            thumbnail
        });
    }
    return items;
}

// Le gestionnaire principal du worker
export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        const path = url.pathname;

        const SUBSTACK_FEED = config.substackRssUrl;
        const YOUTUBE_FEED = config.youtubeRssUrl;

        // Gère l'API pour les articles de blog
        if (path === "/api/posts") {
            if (!SUBSTACK_FEED) return new Response("Erreur : substackRssUrl non configuré dans config.json", { status: 500 });
            try {
                const posts = await fetchAndParseRSS(SUBSTACK_FEED);
                return Response.json(posts);
            } catch (error) {
                return new Response(`Erreur lors du traitement des articles: ${error.message}`, { status: 500 });
            }
        }

        if (path.startsWith("/api/post/")) {
            if (!SUBSTACK_FEED) return new Response("Erreur : substackRssUrl non configuré dans config.json", { status: 500 });
            const slug = path.split("/").pop();
            try {
                const posts = await fetchAndParseRSS(SUBSTACK_FEED);
                const post = posts.find(p => p.slug === slug);
                if (!post) return new Response("Article non trouvé", { status: 404 });
                return Response.json(post);
            } catch (error) {
                return new Response(`Erreur lors du traitement de l'article: ${error.message}`, { status: 500 });
            }
        }

        // Gère l'API pour les vidéos YouTube
        if (path === "/api/videos") {
            if (!YOUTUBE_FEED) return new Response("Erreur : youtubeRssUrl non configuré dans config.json", { status: 500 });
            try {
                const videos = await fetchAndParseYouTubeRSS(YOUTUBE_FEED);
                return Response.json(videos);
            } catch (error) {
                return new Response(`Erreur lors du traitement des vidéos: ${error.message}`, { status: 500 });
            }
        }

        if (path.startsWith("/api/video/")) {
            if (!YOUTUBE_FEED) return new Response("Erreur : youtubeRssUrl non configuré dans config.json", { status: 500 });
            const videoId = path.split("/").pop();
            try {
                const videos = await fetchAndParseYouTubeRSS(YOUTUBE_FEED);
                const video = videos.find(v => v.id === videoId);
                if (!video) return new Response("Vidéo non trouvée", { status: 404 });
                return Response.json(video);
            } catch (error) {
                return new Response(`Erreur lors du traitement de la vidéo: ${error.message}`, { status: 500 });
            }
        }

        // Gère les requêtes pour les fichiers statiques
        return env.ASSETS.fetch(req);
    }
};
