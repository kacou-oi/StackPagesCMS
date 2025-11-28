var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-ECyb65/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// _worker.js
var CACHE_TTL = 180;
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").trim();
}
__name(slugify, "slugify");
function decodeHTMLEntities(str) {
  if (!str) return "";
  const map = {
    "nbsp": " ",
    "amp": "&",
    "quot": '"',
    "lt": "<",
    "gt": ">",
    "#39": "'"
  };
  return str.replace(/&(#?\w+);/g, (match, entity) => {
    if (entity.startsWith("#")) {
      const code = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return String.fromCharCode(code);
    }
    return map[entity] || match;
  });
}
__name(decodeHTMLEntities, "decodeHTMLEntities");
function extractFirstImage(html) {
  const imgRe = /<img[^>]+src=["']([^"']+)["']/i;
  const match = html.match(imgRe);
  return match ? match[1] : null;
}
__name(extractFirstImage, "extractFirstImage");
function extractEnclosureImage(block) {
  const re = /<enclosure\s+url=["']([^"']+)["'][^>]*type=["']image\/[^"']+/i;
  const match = block.match(re);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}
__name(extractEnclosureImage, "extractEnclosureImage");
function cleanHtmlContent(html) {
  if (!html) return "";
  const regexExpand = /<a\s+[^>]*class=["'][^"']*image-link-expand[^"']*(?:[^>]*)*>.*?<\/a>/gis;
  let cleanedHtml = html.replace(regexExpand, "");
  cleanedHtml = cleanedHtml.replace(/style="[^"]*"/gi, "");
  return cleanedHtml;
}
__name(cleanHtmlContent, "cleanHtmlContent");
var AttributeRewriter = class {
  static {
    __name(this, "AttributeRewriter");
  }
  constructor(attributeName, targetDomain, workerDomain) {
    this.attributeName = attributeName;
    this.targetDomain = targetDomain;
    this.workerDomain = workerDomain;
  }
  element(element) {
    const attribute = element.getAttribute(this.attributeName);
    if (attribute && attribute.includes(this.targetDomain)) {
      const newValue = attribute.split(this.targetDomain).join(this.workerDomain);
      element.setAttribute(this.attributeName, newValue);
    }
  }
};
function extractChannelMetadata(xml) {
  const getChannelTag = /* @__PURE__ */ __name((tag) => {
    const re = new RegExp(`<channel>(?:.|[\\r\\n])*?<${tag}[^>]*>((.|[\\r\\n])*?)</${tag}>`, "i");
    const found = xml.match(re);
    if (!found) return "";
    let content = found[1].trim();
    if (content.startsWith("<![CDATA[")) {
      content = content.slice(9, -3).trim();
    }
    return decodeHTMLEntities(content);
  }, "getChannelTag");
  const title = getChannelTag("title");
  const link = getChannelTag("link");
  const lastBuildDate = getChannelTag("lastBuildDate");
  const description = getChannelTag("description");
  return {
    blogTitle: title,
    blogUrl: link,
    lastBuildDate,
    blogDescription: description
  };
}
__name(extractChannelMetadata, "extractChannelMetadata");
function fetchAndParseRSS(xml) {
  const items = [];
  const itemRe = /<item[^>]*>((.|[\r\n])*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const getTag = /* @__PURE__ */ __name((tag) => {
      const re = new RegExp(`<${tag}[^>]*>((.|[\r
])*?)</${tag}>`, "i");
      const found = block.match(re);
      if (!found) return "";
      let content = found[1].trim();
      if (content.startsWith("<![CDATA[")) {
        content = content.slice(9, -3).trim();
      }
      content = decodeHTMLEntities(content);
      return content;
    }, "getTag");
    const title = getTag("title");
    const link = getTag("link");
    const pubDate = getTag("pubDate");
    const description = getTag("description");
    let image = extractEnclosureImage(block);
    let contentFull = "";
    const contentEncodedRe = /<content:encoded[^>]*>((.|[\r\n])*?)<\/content:encoded>/i;
    const contentEncodedMatch = block.match(contentEncodedRe);
    if (contentEncodedMatch) {
      let content = contentEncodedMatch[1].trim();
      if (content.startsWith("<![CDATA[")) {
        content = content.slice(9, -3).trim();
      }
      contentFull = decodeHTMLEntities(content);
      contentFull = cleanHtmlContent(contentFull);
      if (!image) {
        image = extractFirstImage(contentFull);
      }
    } else {
      contentFull = description;
    }
    const slug = slugify(title);
    items.push({
      title,
      link,
      pubDate,
      description,
      slug,
      content: contentFull,
      image
    });
  }
  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return items;
}
__name(fetchAndParseRSS, "fetchAndParseRSS");
function fetchAndParseYoutubeRSS(xml) {
  const items = [];
  const entryRe = /<entry[^>]*>((.|[\r\n])*?)<\/entry>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const getTag = /* @__PURE__ */ __name((tag) => {
      const re = new RegExp(`<${tag}[^>]*>((.|[\r
])*?)</${tag}>`, "i");
      const found = block.match(re);
      if (!found) return "";
      return decodeHTMLEntities(found[1].trim());
    }, "getTag");
    const title = getTag("title");
    const published = getTag("published");
    const videoIdRe = /<yt:videoId>((.|[\r\n])*?)<\/yt:videoId>/i;
    const videoIdMatch = block.match(videoIdRe);
    const videoId = videoIdMatch ? videoIdMatch[1].trim() : "";
    const mediaGroupRe = /<media:group>((.|[\r\n])*?)<\/media:group>/i;
    const mediaGroupMatch = block.match(mediaGroupRe);
    let thumbnail = "";
    let description = "";
    if (mediaGroupMatch) {
      const groupContent = mediaGroupMatch[1];
      const thumbRe = /<media:thumbnail\s+url=["']([^"']+)["']/i;
      const thumbMatch = groupContent.match(thumbRe);
      if (thumbMatch) thumbnail = thumbMatch[1];
      const descRe = /<media:description[^>]*>((.|[\r\n])*?)<\/media:description>/i;
      const descMatch = groupContent.match(descRe);
      if (descMatch) description = decodeHTMLEntities(descMatch[1].trim());
    }
    if (videoId) {
      items.push({
        id: videoId,
        title,
        published,
        thumbnail,
        description,
        link: `https://www.youtube.com/watch?v=${videoId}`
      });
    }
  }
  items.sort((a, b) => new Date(b.published) - new Date(a.published));
  return items;
}
__name(fetchAndParseYoutubeRSS, "fetchAndParseYoutubeRSS");
async function getCachedRSSData(feedUrl, forceRefresh = false) {
  const cache = caches.default;
  const cacheKey = new Request(feedUrl, { method: "GET" });
  if (!forceRefresh) {
    let response = await cache.match(cacheKey);
    if (response) {
      return await response.json();
    }
  }
  const res = await fetch(feedUrl);
  if (!res.ok) throw new Error(`\xC9chec du chargement du flux RSS : ${res.statusText}`);
  const xml = await res.text();
  const metadata = extractChannelMetadata(xml);
  const posts = fetchAndParseRSS(xml);
  const data = {
    metadata,
    posts
  };
  const cachedResponse = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_TTL}`
    }
  });
  await cache.put(cacheKey, cachedResponse.clone());
  return data;
}
__name(getCachedRSSData, "getCachedRSSData");
async function getCachedYoutubeData(feedUrl, forceRefresh = false) {
  if (!feedUrl) return [];
  const cache = caches.default;
  const cacheKey = new Request(feedUrl, { method: "GET" });
  if (!forceRefresh) {
    let response = await cache.match(cacheKey);
    if (response) {
      return await response.json();
    }
  }
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) throw new Error(`\xC9chec du chargement du flux YouTube`);
    const xml = await res.text();
    const videos = fetchAndParseYoutubeRSS(xml);
    const cachedResponse = new Response(JSON.stringify(videos), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL}`
      }
    });
    await cache.put(cacheKey, cachedResponse.clone());
    return videos;
  } catch (e) {
    console.error("Erreur YouTube Fetch:", e);
    return [];
  }
}
__name(getCachedYoutubeData, "getCachedYoutubeData");
var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    const config = {
      siteName: "StackPages CMS",
      author: "Admin",
      substackRssUrl: env.SUBSTACK_FEED_URL || "",
      youtubeRssUrl: env.YOUTUBE_FEED_URL || "",
      frontendBuilderUrl: env.FRONTEND_BUILDER_URL || "",
      podcastFeedUrl: env.PODCAST_FEED_URL || "",
      seo: {
        metaTitle: env.META_TITLE || "",
        metaDescription: env.META_DESCRIPTION || "",
        metaKeywords: env.META_KEYWORDS || ""
      }
    };
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "admin";
    const SESSION_SECRET = "stackpages-session-secret";
    const isAuthenticated = /* @__PURE__ */ __name(() => {
      const authKey = req.headers.get("X-Auth-Key");
      return authKey === ADMIN_PASSWORD;
    }, "isAuthenticated");
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (path === "/api/login" && req.method === "POST") {
      try {
        const body = await req.json();
        const ADMIN_EMAIL = env.ADMIN_EMAIL || "admin@example.com";
        if (body.email === ADMIN_EMAIL && body.password === ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ error: "Identifiants incorrects" }), { status: 401, headers: corsHeaders });
        }
      } catch (e) {
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }
    }
    if (path === "/api/logout") {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    if (path === "/api/check-auth") {
      if (isAuthenticated()) {
        return new Response(JSON.stringify({ authenticated: true }), { status: 200, headers: corsHeaders });
      } else {
        return new Response(JSON.stringify({ authenticated: false }), { status: 401, headers: corsHeaders });
      }
    }
    const FEED_URL = config.substackRssUrl;
    console.log("DEBUG: Configured Substack URL:", FEED_URL);
    if (!FEED_URL && (path === "/api/metadata" || path === "/api/posts" || path.startsWith("/api/post/"))) {
      const emptyMeta = { siteName: "StackPages", author: "Admin", lastBuildDate: (/* @__PURE__ */ new Date()).toISOString() };
      if (path === "/api/metadata") return new Response(JSON.stringify(emptyMeta), { status: 200, headers: corsHeaders });
      if (path === "/api/posts") return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
      return new Response(JSON.stringify({ error: "Article non trouv\xE9" }), { status: 404, headers: corsHeaders });
    }
    if (path === "/api/metadata" || path === "/api/posts" || path.startsWith("/api/post/")) {
      let blogData;
      try {
        blogData = await getCachedRSSData(FEED_URL);
      } catch (error) {
        console.error("Error fetching Substack RSS:", error);
        if (path === "/api/metadata") return new Response(JSON.stringify({ siteName: "Error", author: "Error" }), { status: 200, headers: corsHeaders });
        if (path === "/api/posts") return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
      if (path === "/api/metadata") {
        const meta = {
          ...blogData.metadata,
          siteName: config.siteName,
          author: config.author,
          seo: config.seo
        };
        return new Response(JSON.stringify(meta), { status: 200, headers: corsHeaders });
      }
      if (path === "/api/posts") {
        return new Response(JSON.stringify(blogData.posts), { status: 200, headers: corsHeaders });
      }
      if (path.startsWith("/api/post/")) {
        const slug = path.split("/").pop();
        const post = blogData.posts.find((p) => p.slug === slug);
        if (post) {
          return new Response(JSON.stringify(post), { status: 200, headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ error: "Article non trouv\xE9" }), { status: 404, headers: corsHeaders });
        }
      }
    }
    if (path === "/api/podcasts") {
      const feedUrl = config.podcastFeedUrl;
      if (!feedUrl) {
        return new Response(JSON.stringify([]), {
          headers: corsHeaders
        });
      }
      try {
        const response = await fetch(feedUrl, {
          headers: {
            "User-Agent": "StackPages-Worker/1.0"
          }
        });
        if (!response.ok) throw new Error(`Failed to fetch RSS: ${response.status}`);
        const xmlText = await response.text();
        const items = [];
        let currentPos = 0;
        while (true) {
          const itemStart = xmlText.indexOf("<item>", currentPos);
          if (itemStart === -1) break;
          const itemEnd = xmlText.indexOf("</item>", itemStart);
          if (itemEnd === -1) break;
          const itemContent = xmlText.substring(itemStart, itemEnd);
          const titleMatch = itemContent.match(/<title>(.*?)<\/title>/s);
          const linkMatch = itemContent.match(/<link>(.*?)<\/link>/s);
          const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/s);
          const descriptionMatch = itemContent.match(/<description>(.*?)<\/description>/s);
          const enclosureMatch = itemContent.match(/<enclosure[^>]*url=["'](.*?)["'][^>]*>/s);
          const guidMatch = itemContent.match(/<guid[^>]*>(.*?)<\/guid>/s);
          const clean = /* @__PURE__ */ __name((str) => {
            if (!str) return "";
            return str.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
          }, "clean");
          const title = clean(titleMatch ? titleMatch[1] : "Sans titre");
          items.push({
            title,
            slug: slugify(title),
            guid: clean(guidMatch ? guidMatch[1] : ""),
            link: clean(linkMatch ? linkMatch[1] : "#"),
            pubDate: clean(pubDateMatch ? pubDateMatch[1] : ""),
            description: clean(descriptionMatch ? descriptionMatch[1] : ""),
            audioUrl: enclosureMatch ? enclosureMatch[1] : null
          });
          currentPos = itemEnd + 7;
        }
        items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        return new Response(JSON.stringify(items), {
          headers: corsHeaders
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: error.message
        }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }
    if (path.startsWith("/api/podcast/")) {
      const podcastId = path.split("/").pop();
      const feedUrl = config.podcastFeedUrl;
      if (!feedUrl) {
        return new Response(JSON.stringify({ error: "Flux Podcast non configur\xE9" }), { status: 404, headers: corsHeaders });
      }
      try {
        const response = await fetch(feedUrl, { headers: { "User-Agent": "StackPages-Worker/1.0" } });
        if (!response.ok) throw new Error(`Failed to fetch RSS: ${response.status}`);
        const xmlText = await response.text();
        const items = [];
        let currentPos = 0;
        while (true) {
          const itemStart = xmlText.indexOf("<item>", currentPos);
          if (itemStart === -1) break;
          const itemEnd = xmlText.indexOf("</item>", itemStart);
          if (itemEnd === -1) break;
          const itemContent = xmlText.substring(itemStart, itemEnd);
          const titleMatch = itemContent.match(/<title>(.*?)<\/title>/s);
          const linkMatch = itemContent.match(/<link>(.*?)<\/link>/s);
          const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/s);
          const descriptionMatch = itemContent.match(/<description>(.*?)<\/description>/s);
          const enclosureMatch = itemContent.match(/<enclosure[^>]*url=["'](.*?)["'][^>]*>/s);
          const guidMatch = itemContent.match(/<guid[^>]*>(.*?)<\/guid>/s);
          const clean = /* @__PURE__ */ __name((str) => str ? str.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : "", "clean");
          const title = clean(titleMatch ? titleMatch[1] : "Sans titre");
          items.push({
            title,
            slug: slugify(title),
            guid: clean(guidMatch ? guidMatch[1] : ""),
            link: clean(linkMatch ? linkMatch[1] : "#"),
            pubDate: clean(pubDateMatch ? pubDateMatch[1] : ""),
            description: clean(descriptionMatch ? descriptionMatch[1] : ""),
            audioUrl: enclosureMatch ? enclosureMatch[1] : null
          });
          currentPos = itemEnd + 7;
        }
        const podcast = items.find((p) => p.guid === podcastId || p.slug === podcastId);
        if (podcast) {
          return new Response(JSON.stringify(podcast), { status: 200, headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ error: "Podcast non trouv\xE9" }), { status: 404, headers: corsHeaders });
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }
    if (path === "/api/videos") {
      console.log("DEBUG: Configured YouTube URL:", config.youtubeRssUrl);
      if (!config.youtubeRssUrl) {
        return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
      }
      try {
        const videos = await getCachedYoutubeData(config.youtubeRssUrl);
        return new Response(JSON.stringify(videos), { status: 200, headers: corsHeaders });
      } catch (error) {
        console.error("Error fetching YouTube RSS:", error);
        return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
      }
    }
    if (path.startsWith("/api/video/")) {
      const videoId = path.split("/").pop();
      if (!config.youtubeRssUrl) {
        return new Response(JSON.stringify({ error: "Flux YouTube non configur\xE9" }), { status: 404, headers: corsHeaders });
      }
      try {
        const videos = await getCachedYoutubeData(config.youtubeRssUrl);
        const video = videos.find((v) => v.id === videoId);
        if (video) {
          return new Response(JSON.stringify(video), { status: 200, headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ error: "Vid\xE9o non trouv\xE9e" }), { status: 404, headers: corsHeaders });
        }
      } catch (error) {
        console.error("Error fetching YouTube RSS:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }
    if (path === "/api/config" && req.method === "GET") {
      if (!isAuthenticated()) {
        return new Response(JSON.stringify({ error: "Non autoris\xE9" }), { status: 401, headers: corsHeaders });
      }
      return new Response(JSON.stringify(config), { status: 200, headers: corsHeaders });
    }
    if (path === "/api/config" && req.method === "POST") {
      return new Response(JSON.stringify({ error: "La configuration est g\xE9r\xE9e par les variables d'environnement." }), { status: 405, headers: corsHeaders });
    }
    if (path === "/api/clear-cache" && req.method === "POST") {
      if (!isAuthenticated()) {
        return new Response(JSON.stringify({ error: "Non autoris\xE9" }), { status: 401, headers: corsHeaders });
      }
      const cache = caches.default;
      return new Response(JSON.stringify({ success: true, message: "Cache invalid\xE9 (attendre TTL ou red\xE9ploiement)" }), { status: 200, headers: corsHeaders });
    }
    if (path === "/admin" || path === "/admin/") {
      return await env.ASSETS.fetch(new Request(new URL("/admin/index.html", url), {
        method: "GET",
        headers: req.headers
      }));
    }
    if (path === "/dashboard" || path === "/dashboard/") {
      return await env.ASSETS.fetch(new Request(new URL("/admin/dashboard.html", url), {
        method: "GET",
        headers: req.headers
      }));
    }
    const STAGING_URL = env.STAGING_URL;
    let TARGET_DOMAIN = null;
    let TARGET_PROTOCOL = "https:";
    if (STAGING_URL) {
      try {
        const stagingUrlObj = new URL(STAGING_URL);
        TARGET_DOMAIN = stagingUrlObj.hostname;
        TARGET_PROTOCOL = stagingUrlObj.protocol;
      } catch (e) {
        console.error("Invalid STAGING_URL:", STAGING_URL);
      }
    }
    const WORKER_DOMAIN = url.hostname;
    const isAdminOrApiPath = path.startsWith("/api/") || path.startsWith("/admin") || path.startsWith("/dashboard") || path.startsWith("/core/");
    if (TARGET_DOMAIN && !isAdminOrApiPath) {
      const originUrl = new URL(req.url);
      originUrl.hostname = TARGET_DOMAIN;
      originUrl.protocol = TARGET_PROTOCOL;
      let newHeaders = new Headers(req.headers);
      newHeaders.set("Host", TARGET_DOMAIN);
      newHeaders.set("Referer", originUrl.toString());
      let newRequest = new Request(originUrl, {
        method: req.method,
        headers: newHeaders,
        body: req.body,
        redirect: "manual"
        // Gérer les redirections manuellement
      });
      try {
        let response = await fetch(newRequest);
        const contentType = response.headers.get("content-type");
        let responseHeaders = new Headers(response.headers);
        responseHeaders.delete("Content-Security-Policy");
        responseHeaders.delete("X-Frame-Options");
        if (response.headers.has("location")) {
          const location = response.headers.get("location");
          if (location.includes(TARGET_DOMAIN)) {
            const newLocation = location.replace(TARGET_DOMAIN, WORKER_DOMAIN);
            responseHeaders.set("location", newLocation);
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: responseHeaders
            });
          }
        }
        if (contentType && contentType.startsWith("text/html")) {
          return new HTMLRewriter().on("a[href]", new AttributeRewriter("href", TARGET_DOMAIN, WORKER_DOMAIN)).on("link[href]", new AttributeRewriter("href", TARGET_DOMAIN, WORKER_DOMAIN)).on("script[src]", new AttributeRewriter("src", TARGET_DOMAIN, WORKER_DOMAIN)).on("img[src]", new AttributeRewriter("src", TARGET_DOMAIN, WORKER_DOMAIN)).on("img[srcset]", new AttributeRewriter("srcset", TARGET_DOMAIN, WORKER_DOMAIN)).on("source[src]", new AttributeRewriter("src", TARGET_DOMAIN, WORKER_DOMAIN)).on("source[srcset]", new AttributeRewriter("srcset", TARGET_DOMAIN, WORKER_DOMAIN)).on("form[action]", new AttributeRewriter("action", TARGET_DOMAIN, WORKER_DOMAIN)).transform(new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
          }));
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      } catch (error) {
        console.error("Erreur de reverse proxy:", error);
        return new Response(`Erreur de reverse proxy : ${error.message}`, { status: 500 });
      }
    }
    const hasFileExtension = path.match(/\.[a-z0-9]+$/i);
    const isRootOrIndex = path === "/" || path === "/index.html" || path === "";
    if (!isRootOrIndex && !hasFileExtension && !isAdminOrApiPath) {
      try {
        return await env.ASSETS.fetch(new Request(new URL("/page-template.html", url), {
          method: "GET",
          headers: req.headers
        }));
      } catch (e) {
        console.error("Error serving page template:", e);
      }
    }
    try {
      return await env.ASSETS.fetch(req);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
    }
  }
};

// ../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ECyb65/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ECyb65/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=_worker.js.map
