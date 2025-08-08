function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
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
      return found ? found[1].trim() : "";
    };
    const title = getTag('title');
    const link = getTag('link');
    const pubDate = getTag('pubDate');
    const description = getTag('description');
    const slug = slugify(title);
    items.push({ title, link, pubDate, description, slug });
  }
  return items;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    const FEED = env.FEED_URL;

    // API: /api/posts
    if (path === "/api/posts") {
      if (!FEED) {
        return new Response("Erreur : FEED_URL non configurée", { status: 500 });
      }
      const posts = await fetchAndParseRSS(FEED);
      return Response.json(posts);
    }

    // API: /api/post/:slug
    if (path.startsWith("/api/post/")) {
      if (!FEED) {
        return new Response("Erreur : FEED_URL non configurée", { status: 500 });
      }
      const slug = path.split("/").pop();
      const posts = await fetchAndParseRSS(FEED);
      const post = posts.find(p => p.slug === slug);
      if (!post) return new Response("Not found", { status: 404 });
      return Response.json(post);
    }

    // Laisser passer toutes les autres requêtes (site statique)
    return env.ASSETS.fetch(req);
  }
}
