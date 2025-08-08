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
      const code = entity.startsWith('#x')
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return String.fromCharCode(code);
    }
    return map[entity] || match;
  });
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
    const slug = slugify(title);
    items.push({ title, link, pubDate, description, slug });
  }
  return items;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const FEED = env.FEED_URL;

    if (!FEED) {
      return new Response("Erreur : FEED_URL non configurée", { status: 500 });
    }

    // API: /api/posts
    if (path === "/api/posts") {
      const posts = await fetchAndParseRSS(FEED);
      return Response.json(posts);
    }

    // API: /api/post/:slug
    if (path.startsWith("/api/post/")) {
      const slug = path.split("/").pop();
      const posts = await fetchAndParseRSS(FEED);
      const post = posts.find(p => p.slug === slug);
      if (!post) return new Response("Not found", { status: 404 });
      return Response.json(post);
    }

    // 👉 Serve view.html for /posts/:slug
    if (/^\/posts\/[^\/]+$/.test(path)) {
      return env.ASSETS.fetch(new Request(`${url.origin}/posts/view.html`, req));
    }

    // Default static asset
    return env.ASSETS.fetch(req);
  }
};
