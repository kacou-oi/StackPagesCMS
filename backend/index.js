// Fonctions utilitaires pour le traitement des données du blog
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
            title, link, pubDate, description, slug, content: contentFull, image
        });
    }
    return items;
}

// Fonction principale qui gère toutes les requêtes (API et statiques)
async function handleRequest(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const FEED = env.FEED_URL;

    if (!FEED) {
        return new Response("Erreur : FEED_URL non configurée", { status: 500 });
    }

    // Gère la requête pour le formulaire de contact
    if (path === "/api/contact" && req.method === "POST") {
        try {
            const data = await req.json();
            const { name, email, message } = data;

            // Logique d'envoi d'email ici. Pour l'instant on simule le succès.
            console.log(`Nouveau message de ${name} (${email}): ${message}`);
            return new Response(JSON.stringify({ message: 'Message envoyé avec succès !' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });

        } catch (error) {
            console.error('Erreur lors de la soumission du formulaire de contact:', error);
            return new Response(JSON.stringify({ error: 'Erreur interne du serveur.' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 500
            });
        }
    }

    // Gère la requête pour obtenir tous les articles
    if (path === "/api/posts") {
        try {
            const posts = await fetchAndParseRSS(FEED);
            return Response.json(posts);
        } catch (error) {
            return new Response(`Erreur lors du traitement des articles: ${error.message}`, { status: 500 });
        }
    }

    // Gère la requête pour obtenir un article unique
    if (path.startsWith("/api/post/")) {
        const slug = path.split("/").pop();
        try {
            const posts = await fetchAndParseRSS(FEED);
            const post = posts.find(p => p.slug === slug);
            if (!post) {
                return new Response("Article non trouvé", { status: 404 });
            }
            return Response.json(post);
        } catch (error) {
            return new Response(`Erreur lors du traitement de l'article: ${error.message}`, { status: 500 });
        }
    }

    // Gère les requêtes pour les fichiers statiques (le frontend)
    const newRequest = new Request(`${url.origin}/frontend${path}`, req);
    return env.ASSETS.fetch(newRequest);
}

// On exporte la fonction pour qu'elle puisse être utilisée par le point d'entrée
export default {
    handleRequest
};
