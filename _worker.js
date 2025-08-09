// _worker.js

// Les fonctions utilitaires sont définies ici pour être utilisées par le worker
// Cette fonction nettoie une chaîne de caractères pour en faire un slug d'URL
function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .trim();
}

// Cette fonction décode les entités HTML (ex: &amp; en &) dans une chaîne
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

// Fonction principale pour aller chercher et analyser le flux RSS
async function fetchAndParseRSS(feedUrl) {
    // Fait une requête au flux RSS
    const res = await fetch(feedUrl);
    // Convertit la réponse en texte XML
    const xml = await res.text();
    const items = [];
    // Expression régulière pour trouver chaque <item> dans le XML
    const itemRe = /<item[^>]*>((.|[\r\n])*?)<\/item>/gi;
    let m;

    // Boucle à travers chaque article trouvé
    while ((m = itemRe.exec(xml)) !== null) {
        const block = m[1];
        // Fonction utilitaire pour trouver le contenu d'une balise spécifique
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

        // Récupère le contenu complet depuis <content:encoded> si disponible
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
            // Sinon, utilise la description comme solution de secours
            contentFull = description;
        }

        // Extrait la première image du contenu complet pour l'affichage
        const image = extractFirstImage(contentFull);

        // Crée un slug à partir du titre pour les URL d'articles
        const slug = slugify(title);
        
        // Extrait un résumé à partir de la description ou du contenu
        const summary = description || contentFull.split('.')[0] + '.';

        items.push({
            title,
            link,
            published: pubDate, // Utilisez "published" pour correspondre au script client
            description,
            slug,
            content: contentFull,
            image,
            summary
        });
    }
    return items;
}

// Le gestionnaire principal du worker
export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        const path = url.pathname;
        const FEED = env.FEED_URL;

        if (!FEED) {
            return new Response("Erreur : FEED_URL non configurée", { status: 500 });
        }

        // ---------- NOUVELLE LOGIQUE POUR L'API JSON (API endpoints) ----------
        // Cette logique supporte le rendu côté client de vos scripts JS
        if (path === "/api/posts") {
            try {
                const posts = await fetchAndParseRSS(FEED);
                // On retourne la liste de tous les articles au format JSON
                return new Response(JSON.stringify(posts), {
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                });
            } catch (error) {
                console.error("Erreur API /api/posts:", error);
                return new Response("Erreur lors de la récupération des articles.", { status: 500 });
            }
        }
        
        if (path.startsWith("/api/post/")) {
            try {
                const slug = path.split("/").pop();
                const posts = await fetchAndParseRSS(FEED);
                const post = posts.find(p => p.slug === slug);

                if (!post) {
                    return new Response("Article non trouvé", { status: 404 });
                }

                // On retourne l'article unique au format JSON
                return new Response(JSON.stringify(post), {
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                });
            } catch (error) {
                console.error("Erreur API /api/post/:slug:", error);
                return new Response("Erreur lors de la récupération de l'article.", { status: 500 });
            }
        }
        // ---------------------------------------------------------------------

        // LOGIQUE ORIGINALE DE VOS SCRIPTS POUR LE SSR
        // Ce bloc de code prend le dessus sur le client JS pour fournir
        // directement une page HTML complète d'article.
        if (path.startsWith("/blog/") && path !== "/blog/index.html") {
            const slug = path.split("/").pop();
            try {
                const posts = await fetchAndParseRSS(FEED);
                const post = posts.find(p => p.slug === slug);
                if (!post) {
                    return new Response("Article non trouvé", { status: 404 });
                }

                const articleTemplate = await env.ASSETS.get('article.html', 'text');
                if (!articleTemplate) {
                    return new Response('Modèle d\'article non trouvé', { status: 500 });
                }
                
                let html = articleTemplate
                    .replace('{{title}}', post.title)
                    .replace('{{pubDate}}', post.published)
                    .replace('{{content}}', post.content)
                    .replace('{{image}}', post.image ? `<img src="${post.image}" alt="${post.title}" class="w-full h-auto object-cover rounded-lg mb-6">` : '')
                    .replace('{{currentYear}}', new Date().getFullYear());
                
                return new Response(html, {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
            } catch (error) {
                console.error(error);
                return new Response(`Erreur lors du rendu de l'article: ${error.message}`, { status: 500 });
            }
        }

        // Si la route ne correspond pas à notre logique, on laisse Cloudflare Pages servir le reste
        // C'est la ligne qui gère tous les autres fichiers (index.html, CSS, JS, etc.)
        return env.ASSETS.fetch(req);
    }
};
