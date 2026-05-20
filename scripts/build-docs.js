const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const BASE_URL = "https://xingchen2.tawk.help";
const PROPERTY_ID = "67bad6ab2d792b190cd16b18";
const SITE_ID = "primary";
const OUT_DIR = process.cwd();

const categories = [
  { name: "星辰Whatsapp使用手册V2.0", slug: "星辰whatsapp使用手册v20" },
  { name: "星辰whatsapp协议常见问题", slug: "星辰whatsapp协议常见问题" },
  { name: "星辰whatsapp协议优势", slug: "星辰whatsapp协议优势" },
  { name: "星辰使用建议", slug: "星辰使用建议" },
  { name: "封控", slug: "封控" },
];

function apiUrl(endpoint, params) {
  const url = new URL(endpoint, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return url;
}

async function getJson(endpoint, params) {
  const url = apiUrl(endpoint, params);
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0 docs-exporter",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  const json = await response.json();
  if (!json.ok) throw new Error(`API returned ok=false: ${url}`);
  return json.data;
}

function safeFileName(input) {
  return input
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function escapeHtml(input = "") {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlToPlainText(html = "") {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function localImageName(url) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname) || ".bin";
  const base = safeFileName(path.basename(parsed.pathname, ext)) || "image";
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
  return `${base}-${hash}${ext}`;
}

function articleSlugFromHref(href = "") {
  try {
    const parsed = href.startsWith("http") ? new URL(href) : new URL(href, BASE_URL);
    const prefix = "/article/";
    if (!parsed.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

function rewriteArticleLinks(html = "", articleBySlug) {
  return html.replace(/\s+href=(["'])(.*?)\1/gi, (match, quote, href) => {
    const slug = articleSlugFromHref(href);
    const target = slug ? articleBySlug.get(slug) : null;
    if (!target) return match;
    return ` href=${quote}#${target.id}${quote}`;
  });
}

function markdownText(html = "", articleBySlug, currentArticle) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, href, label) => {
      const slug = articleSlugFromHref(href);
      const target = slug ? articleBySlug.get(slug) : null;
      const text = htmlToPlainText(label);
      if (!target) return text;
      const currentDir = path.join("docs", safeFileName(currentArticle.categoryName));
      const targetFile = path.join("docs", safeFileName(target.categoryName), `${safeFileName(target.title)}.md`);
      const relative = path.relative(currentDir, targetFile).replace(/\\/g, "/");
      return `[${text}](${encodeURI(relative)})`;
    })
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function paragraphHtml(block, articleBySlug) {
  const text = block.content?.text || "";
  const size = Number(block.content?.size || 16);
  const plain = htmlToPlainText(text);
  if (!plain) return "";
  const linkedText = rewriteArticleLinks(text, articleBySlug);

  if (size >= 24) return `<h2>${linkedText}</h2>`;
  if (size >= 20) return `<p class="lead">${linkedText}</p>`;
  return `<p>${linkedText}</p>`;
}

function blockToHtml(block, context) {
  if (block.type === "paragraph") return paragraphHtml(block, context.articleBySlug);
  if (block.type === "image" && block.content?.url) {
    const url = block.content.url;
    const localUrl = context.imageMap.get(url)?.sitePath || url;
    return `<figure><img src="${escapeHtml(localUrl)}" alt="" loading="lazy"><figcaption>${escapeHtml(path.basename(localUrl))}</figcaption></figure>`;
  }
  return "";
}

function blockToMarkdown(block, context) {
  if (block.type === "paragraph") {
    const text = markdownText(block.content?.text || "", context.articleBySlug, context.currentArticle);
    if (!text) return "";
    const size = Number(block.content?.size || 16);
    if (size >= 24) return `## ${text}`;
    if (size >= 20) return `**${text}**`;
    return text;
  }
  if (block.type === "image" && block.content?.url) {
    const image = context.imageMap.get(block.content.url);
    const currentDir = path.join(OUT_DIR, "docs", safeFileName(context.currentArticle.categoryName));
    const localPath = image
      ? path.relative(currentDir, image.output).replace(/\\/g, "/")
      : block.content.url;
    return `![](${encodeURI(localPath)})`;
  }
  return "";
}

function articleToMarkdown(article, category, context) {
  const body = (article.contents || [])
    .map((block) => blockToMarkdown(block, {
      ...context,
      currentArticle: { ...article, categoryName: category.name },
    }))
    .filter(Boolean)
    .join("\n\n");
  return [
    `# ${article.title}`,
    "",
    `分类：${category.name}`,
    `更新时间：${article.updatedAt || ""}`,
    "",
    body,
    "",
  ].join("\n");
}

function articleToSearchText(article) {
  return (article.contents || []).map((block) => htmlToPlainText(block.content?.text || "")).join(" ");
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function fetchAllDocs() {
  const result = [];
  for (const categorySeed of categories) {
    const categoryData = await getJson("/api/category", {
      slug: categorySeed.slug,
      propertyId: PROPERTY_ID,
      siteId: SITE_ID,
    });
    const category = categoryData.category;
    const articleListData = await getJson("/api/articles", {
      categoryId: category.id,
      propertyId: PROPERTY_ID,
      siteId: SITE_ID,
      limit: 100,
    });
    const articles = [];
    for (const item of articleListData.articles || []) {
      const articleData = await getJson("/api/article", {
        slug: item.slug,
        propertyId: PROPERTY_ID,
        siteId: SITE_ID,
      });
      articles.push(articleData.article);
      console.log(`fetched: ${category.name} / ${item.title}`);
    }
    result.push({ category, articles });
  }
  return result;
}

function buildArticleIndex(data) {
  const articleBySlug = new Map();
  for (const section of data) {
    for (const article of section.articles) {
      articleBySlug.set(article.slug, { ...article, categoryName: section.category.name });
      for (const slug of article.slugs || []) {
        if (slug.slug) articleBySlug.set(slug.slug, { ...article, categoryName: section.category.name });
      }
    }
  }
  return articleBySlug;
}

function collectImages(data) {
  const urls = new Set();
  for (const section of data) {
    for (const article of section.articles) {
      for (const block of article.contents || []) {
        if (block.type === "image" && block.content?.url) urls.add(block.content.url);
      }
    }
  }
  return [...urls];
}

async function downloadImages(data) {
  const imageDir = path.join(OUT_DIR, "site", "assets", "images");
  await fs.mkdir(imageDir, { recursive: true });
  const imageMap = new Map();
  for (const url of collectImages(data)) {
    const name = localImageName(url);
    const output = path.join(imageDir, name);
    const sitePath = `./assets/images/${name}`;
    imageMap.set(url, { output, sitePath });
    try {
      await fs.access(output);
      console.log(`image exists: ${name}`);
      continue;
    } catch {
      // Continue to download the missing image.
    }
    const response = await fetch(url, {
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*",
        "user-agent": "Mozilla/5.0 docs-exporter",
      },
    });
    if (!response.ok) throw new Error(`image ${response.status} ${response.statusText}: ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(output, buffer);
    console.log(`image downloaded: ${name}`);
  }
  return imageMap;
}

async function writeMarkdown(data, context) {
  const docsDir = path.join(OUT_DIR, "docs");
  await fs.mkdir(docsDir, { recursive: true });
  for (const section of data) {
    const categoryDir = path.join(docsDir, safeFileName(section.category.name));
    await fs.mkdir(categoryDir, { recursive: true });
    for (const article of section.articles) {
      const file = path.join(categoryDir, `${safeFileName(article.title)}.md`);
      await fs.writeFile(file, articleToMarkdown(article, section.category, context), "utf8");
    }
  }
}

function buildSiteData(data, context) {
  return data.map((section) => ({
    category: {
      id: section.category.id,
      name: section.category.name,
      slug: section.category.slug,
      updatedAt: section.category.updatedAt,
      articlesCount: section.articles.length,
    },
    articles: section.articles.map((article) => ({
      id: article.id,
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle || "",
      updatedAt: article.updatedAt,
      searchText: articleToSearchText(article),
      html: (article.contents || []).map((block) => blockToHtml(block, context)).filter(Boolean).join("\n"),
    })),
  }));
}

async function writeSite(data) {
  const siteDir = path.join(OUT_DIR, "site");
  await fs.mkdir(siteDir, { recursive: true });
  const context = {
    articleBySlug: buildArticleIndex(data),
    imageMap: await downloadImages(data),
  };
  const localBuilder = require("./rebuild-site-local.js");
  if (typeof localBuilder.writeSiteFromData === "function") {
    await localBuilder.writeSiteFromData(buildSiteData(data, context));
  }
  return context;
}

async function main() {
  const data = await fetchAllDocs();
  await fs.mkdir(path.join(OUT_DIR, "raw"), { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, "raw", "docs.json"), JSON.stringify(data, null, 2), "utf8");
  const context = await writeSite(data);
  await writeMarkdown(data, context);
  const total = data.reduce((sum, section) => sum + section.articles.length, 0);
  console.log(`done: ${data.length} categories, ${total} articles`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
