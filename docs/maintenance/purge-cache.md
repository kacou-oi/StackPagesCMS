# 3.1 Purge du Cache

Le cache Cloudflare est extrêmement efficace, mais il peut être nécessaire de le purger manuellement après avoir corrigé un bug dans le `worker.js` ou forcé une mise à jour immédiate du contenu.

### Étapes de Purge Manuelle

1.  **Accéder à Cloudflare :** Connectez-vous à votre tableau de bord Cloudflare.
2.  **Section Cache :** Allez à la section **Caching** (Mise en cache).
3.  **Configuration :** Allez à l'onglet **Configuration** ou **Purger le Cache**.
4.  **Action :** Cliquez sur **"Purger tout"** (Purge Everything) pour forcer le Worker à refaire un appel à votre flux RSS lors de la prochaine requête utilisateur.
