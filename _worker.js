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

// Le gestionnaire principal du worker
export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        const path = url.pathname;
        const FEED = env.FEED_URL;

        // Vérifie si la variable d'environnement FEED_URL est configurée
        if (!FEED) {
            return new Response("Erreur : FEED_URL non configurée", { status: 500 });
        }

        // Gère l'API pour récupérer tous les articles
        if (path === "/api/posts") {
            try {
                const posts = await fetchAndParseRSS(FEED);
                // Retourne la liste des articles au format JSON
                return Response.json(posts);
            } catch (error) {
                return new Response(`Erreur lors du traitement des articles: ${error.message}`, { status: 500 });
            }
        }

        // Gère l'API pour un article spécifique basé sur son slug
        if (path.startsWith("/api/post/")) {
            const slug = path.split("/").pop();
            try {
                const posts = await fetchAndParseRSS(FEED);
                // Cherche l'article correspondant au slug
                const post = posts.find(p => p.slug === slug);
                if (!post) {
                    return new Response("Article non trouvé", { status: 404 });
                }
                // Retourne l'article au format JSON
                return Response.json(post);
            } catch (error) {
                return new Response(`Erreur lors du traitement de l'article: ${error.message}`, { status: 500 });
            }
        }

        // Gère les requêtes pour les fichiers statiques (HTML, CSS, JS, etc.)
        // C'est ce qui permet de servir le reste du site
        return env.ASSETS.fetch(req);
    }
};
