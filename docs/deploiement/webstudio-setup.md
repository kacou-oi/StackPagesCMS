# 2.2 Configuration du Frontend Webstudio

Nous allons établir la connexion entre Webstudio et votre Worker d'API.

### A. Variable de Base (WorkerUrl)

Créez une variable statique globale qui stocke l'adresse de votre API :

1.  **Nom :** `WorkerUrl`
2.  **Type :** `String`
3.  **Valeur :** Collez l'URL de votre Worker (ex: `https://stackcms.workers.dev`).

### B. Configuration de la Liste d'Articles

1.  **Variable Resource `PostFeed` :** Créez une Variable Resource avec la méthode `GET`.
    * **URL :** Liez-la à l'expression : `WorkerUrl + "api/posts"`
2.  **Collection :** Liez votre élément **Collection** à la variable `PostFeed`.
3.  **Hyperlien (Href) :** Sur l'élément `<a>` (bouton/lien de lecture) à l'intérieur de la Collection, liez la propriété **Href** à :
    $$\text{"/post/"} + \text{collectionItem.slug}$$

### C. Configuration de la Page de Lecture

1.  **Modèle de Page :** Créez la page dynamique `/post/{slug}`.
2.  **Variable Resource `SinglePostData` :** Créez une ressource `GET` sur cette page :
    * **URL :** Liez-la à l'expression : $$\text{WorkerUrl} + \text{"api/post/"} + \text{\$slug}$$
3.  **Liaison du Contenu :** Liez l'élément `<div>` qui doit contenir le corps de l'article à :
    * **Text Content :** `SinglePostData.content`
    * **Option Importante :** Activez l'option **"Render as HTML"** pour que les balises HTML de l'article (paragraphes, gras, listes, images) soient affichées correctement et non comme du texte brut.
