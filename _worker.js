// On importe la logique complète du backend depuis son propre dossier
import api from './backend/index.js';

export default {
    async fetch(req, env) {
        // On délègue toute la gestion de la requête à notre module `backend/index.js`
        // C'est lui qui gère à la fois les API et le service des fichiers statiques
        return api.handleRequest(req, env);
    }
};
