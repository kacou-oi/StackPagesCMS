export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const FEED = env.FEED_URL;
    if (!FEED) {
      return new Response("Erreur : FEED_URL non configurée", { status: 500 });
    }

    // API liste articles
    if (path === "/api/posts") {
      const posts = await fetchAndParseRSS(FEED);
      return Response.json(posts);
    }

    // API article unique par slug
    if (path.startsWith("/api/post/")) {
      const slug = path.split("/").pop();
      const posts = await fetchAndParseRSS(FEED);
      const post = posts.find(p => p.slug === slug);
      if (!post) return new Response("Not found", { status: 404 });
      return Response.json(post);
    }

    // Gestion des routes dynamiques /posts/slug
    if (path.startsWith("/posts/")) {
      // S'il s'agit précisément de /posts/ ou /posts/view.html, on sert normalement
      if (path === "/posts/" || path === "/posts/view.html") {
        return env.ASSETS.fetch(req);
      }
      // Sinon, pour toutes les URLs /posts/slug, on sert /posts/view.html
      const newReq = new Request(new URL("/posts/view.html", req.url), req);
      return env.ASSETS.fetch(newReq);
    }

    // Toutes les autres requêtes, fichiers statiques
    return env.ASSETS.fetch(req);
  }
};
