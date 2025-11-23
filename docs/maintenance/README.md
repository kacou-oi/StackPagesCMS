# 3. Maintenance et Dépannage

Le système StackPages CMS est conçu pour être sans maintenance. La seule opération qui pourrait être nécessaire est la purge du cache Cloudflare.

## Problèmes Courants

* **Contenu non mis à jour :** Les données sont en cache pour 180 secondes (3 minutes). Si le contenu ne se met pas à jour immédiatement après une publication sur votre blog, vous pouvez purger le cache.
* **Les emojis ne s'affichent pas :** Cela est généralement un problème CSS/HTML côté Webstudio. Assurez-vous que l'encodage de la page est en **UTF-8** et que la `font-family` utilisée est capable d'afficher les glyphes d'emojis.
