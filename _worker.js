// Les fonctions utilitaires sont conservées
function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .trim();
}

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

function extractFirstImage(html) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/i;
    const match = html.match(imgRe);
    return match ? match[1] : null;
}

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

// Nouveau gestionnaire principal pour la logique SSR
export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        const path = url.pathname;
        const FEED = env.FEED_URL;

        if (!FEED) {
            return new Response("Erreur : FEED_URL non configurée", { status: 500 });
        }

        // On cherche une route de type /blog/<slug>
        const articlePathMatch = path.match(/^\/blog\/(.*)$/);
        if (articlePathMatch) {
            const articleSlug = articlePathMatch[1];
            try {
                // Récupérer tous les articles depuis le flux RSS
                const posts = await fetchAndParseRSS(FEED);
                // Chercher l'article correspondant au slug
                const post = posts.find(p => p.slug === articleSlug);

                if (!post) {
                    return new Response("Article non trouvé", { status: 404 });
                }

                // Récupérer le fichier article.html depuis les assets du worker
                const templateResponse = await env.ASSETS.fetch(new URL('/article.html', req.url));
                let htmlContent = await templateResponse.text();

                // Formatter la date pour un affichage plus lisible
                const postDate = new Date(post.pubDate).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                // Remplacer les placeholders dans le modèle HTML par les données de l'article
                htmlContent = htmlContent.replace('{{title}}', post.title);
                htmlContent = htmlContent.replace('{{pubDate}}', postDate);
                htmlContent = htmlContent.replace('{{content}}', post.content);
                htmlContent = htmlContent.replace('{{currentYear}}', new Date().getFullYear());


                // Renvoyer la réponse HTML finale
                return new Response(htmlContent, {
                    headers: {
                        "Content-Type": "text/html; charset=utf-8",
                    },
                });

            } catch (error) {
                return new Response(`Erreur serveur : ${error.message}`, { status: 500 });
            }
        }

        // Si la requête ne correspond pas à un article, servir les assets statiques
        return env.ASSETS.fetch(req);
    }
};
