// ====================================================================
// REVERSE PROXY - VERSION DE RÉFÉRENCE
// ====================================================================
// Ce fichier contient la logique de reverse proxy sous forme standalone.
// La version intégrée et fonctionnelle se trouve dans _worker.js (section 5).
// 
// Ce fichier sert de:
// - Documentation de la logique proxy
// - Référence pour les modifications futures
// - Template pour d'autres implémentations
// ====================================================================

// Classe utilitaire pour réécrire les attributs HTML
class AttributeRewriter {
    constructor(attributeName, targetDomain, workerDomain) {
        this.attributeName = attributeName;
        this.targetDomain = targetDomain;
        this.workerDomain = workerDomain;
    }

    element(element) {
        const attribute = element.getAttribute(this.attributeName);

        // Remplacez les liens absolus du domaine cible par le domaine du Worker
        if (attribute && attribute.includes(this.targetDomain)) {
            element.setAttribute(
                this.attributeName,
                attribute.replace(this.targetDomain, this.workerDomain)
            );
        }
    }
}

// Gestionnaire principal (Module Worker)
export default {
    async fetch(request, env, ctx) {
        // 1. Définition des domaines
        // TARGET_SUBDOMAIN doit être défini comme variable d'environnement (ex: mon-site)
        // Le domaine complet sera construit automatiquement: mon-site.wstd.io
        const TARGET_SUBDOMAIN = env.TARGET_SUBDOMAIN;
        const TARGET_BASE_DOMAIN = 'wstd.io';
        const TARGET_DOMAIN = TARGET_SUBDOMAIN ? `${TARGET_SUBDOMAIN}.${TARGET_BASE_DOMAIN}` : null;
        const TARGET_PROTOCOL = 'https:';

        const url = new URL(request.url);
        const WORKER_DOMAIN = url.hostname;

        if (!TARGET_SUBDOMAIN) {
            return new Response("Erreur de configuration : TARGET_SUBDOMAIN n'est pas défini dans les variables d'environnement.", { status: 500 });
        }

        // 2. Proxification de la requête
        const originUrl = new URL(request.url);
        originUrl.hostname = TARGET_DOMAIN;
        originUrl.protocol = TARGET_PROTOCOL;

        let newRequest = new Request(originUrl, request);

        try {
            let response = await fetch(newRequest);
            const contentType = response.headers.get('content-type');

            // 3. Gestion des redirections
            // S'assurer que les redirections restent sur le domaine du Worker
            if (response.headers.has('location')) {
                const location = response.headers.get('location');
                if (location.includes(TARGET_DOMAIN)) {
                    let newHeaders = new Headers(response.headers);
                    const newLocation = location.replace(TARGET_DOMAIN, WORKER_DOMAIN);
                    newHeaders.set('location', newLocation);

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                }
            }

            // 4. Réécriture du contenu HTML (Le point clé pour les liens absolus)
            if (contentType && contentType.startsWith('text/html')) {

                // Initialiser l'instance de réécriture
                const rewriter = new AttributeRewriter(null, TARGET_DOMAIN, WORKER_DOMAIN);

                // Cibler les attributs qui contiennent des URLs absolues
                return new HTMLRewriter()
                    .on('a[href]', new AttributeRewriter('href', TARGET_DOMAIN, WORKER_DOMAIN))
                    .on('link[href]', new AttributeRewriter('href', TARGET_DOMAIN, WORKER_DOMAIN))
                    .on('script[src]', new AttributeRewriter('src', TARGET_DOMAIN, WORKER_DOMAIN))
                    .on('img[src]', new AttributeRewriter('src', TARGET_DOMAIN, WORKER_DOMAIN))
                    .on('form[action]', new AttributeRewriter('action', TARGET_DOMAIN, WORKER_DOMAIN))
                    .transform(response);
            }

            // 5. Renvoyer les autres ressources (images, CSS, JS) telles quelles
            return response;

        } catch (error) {
            console.error("Erreur de reverse proxy:", error);
            return new Response(`Erreur de reverse proxy : ${error.message}`, { status: 500 });
        }
    }
}