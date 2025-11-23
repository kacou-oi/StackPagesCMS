# 1.1 Flux de Données et Composants

Le flux de données est simple et hautement performant grâce à la mise en cache agressive de Cloudflare.

### Le Cycle de Vie des Données

1.  **Requête du Frontend :** Webstudio appelle l'un des endpoints du Worker (ex: `/api/posts`).
2.  **Vérification du Cache :** Le Worker vérifie si les données du flux RSS sont en cache et encore valides (TTL de 180 secondes).
3.  **Mise à Jour (si cache expiré) :** Si le cache est expiré, le Worker télécharge le flux RSS, le parse, nettoie le HTML (suppression des balises `image-link-expand`, etc.), extrait les images d'enclosure, et reconstruit l'objet JSON complet.
4.  **Stockage :** Le Worker stocke ce nouvel objet JSON dans le cache Cloudflare (avec le `Cache-Control` approprié).
5.  **Réponse :** Le Worker renvoie les données JSON au Frontend.



### Composants Clés

* **`fetchAndParseRSS(xml)` :** Fonction JavaScript responsable de l'extraction des champs (`title`, `pubDate`, `description`, `slug`).
* **`extractEnclosureImage(block)` :** Assure la fiabilité de la récupération de l'image principale.
* **`cleanHtmlContent(html)` :** Assure la propreté du contenu de l'article en supprimant les éléments UI indésirables.
