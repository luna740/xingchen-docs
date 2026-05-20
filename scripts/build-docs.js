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

function siteHtml(data, context) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>星辰帮助中心</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div class="progress" id="progress"></div>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">星</div>
      <div>
        <div class="brand-title">星辰帮助中心</div>
        <div class="brand-subtitle">${data.reduce((sum, item) => sum + item.articles.length, 0)} 篇文档</div>
      </div>
    </div>
    <label class="search">
      <span>搜索</span>
      <input id="searchInput" type="search" placeholder="输入关键词">
    </label>
    <div class="nav-status" id="navStatus"></div>
    <nav id="nav"></nav>
  </aside>
  <main class="content">
    <header class="topbar">
      <button id="menuButton" class="menu-button" type="button" aria-label="打开目录">☰</button>
      <div>
        <div class="breadcrumb" id="breadcrumb">文档</div>
        <h1 id="articleTitle"></h1>
      </div>
      <button id="themeToggle" class="theme-button" type="button" aria-label="切换主题">深色</button>
    </header>
    <article class="doc">
      <div class="meta" id="articleMeta"></div>
      <div id="articleBody"></div>
      <nav class="pager" id="pager"></nav>
    </article>
  </main>
  <aside class="toc">
    <div class="toc-title">本页目录</div>
    <nav id="tocNav"></nav>
  </aside>
  <div class="scrim" id="scrim"></div>
  <div class="lightbox" id="lightbox" aria-hidden="true">
    <button class="lightbox-close" id="lightboxClose" type="button" aria-label="关闭预览">×</button>
    <img id="lightboxImage" alt="">
  </div>
  <script id="docs-data" type="application/json">${scriptJson(buildSiteData(data, context))}</script>
  <script src="./app.js"></script>
</body>
</html>`;
}

const css = `:root {
  color-scheme: light;
  --bg: #ffffff;
  --bg-soft: #f6f8fa;
  --panel: #ffffff;
  --panel-raised: #ffffff;
  --border: #d8dee4;
  --border-soft: #eaeef2;
  --text: #24292f;
  --muted: #57606a;
  --subtle: #6e7781;
  --accent: #0969da;
  --accent-strong: #1f883d;
  --accent-bg: #ddf4ff;
  --shadow: 0 18px 55px rgba(31, 35, 40, .12);
  --sidebar-width: 318px;
  --toc-width: 230px;
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0d1117;
  --bg-soft: #161b22;
  --panel: #0d1117;
  --panel-raised: #161b22;
  --border: #30363d;
  --border-soft: #21262d;
  --text: #e6edf3;
  --muted: #8b949e;
  --subtle: #7d8590;
  --accent: #58a6ff;
  --accent-strong: #3fb950;
  --accent-bg: rgba(88, 166, 255, .14);
  --shadow: 0 18px 55px rgba(0, 0, 0, .35);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(circle at 85% -10%, rgba(31, 136, 61, .10), transparent 28rem),
    linear-gradient(180deg, var(--bg-soft), var(--bg) 18rem);
  font: 15px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}
a { color: inherit; }
button, input { font: inherit; }
.progress {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 30;
  width: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
}
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--sidebar-width);
  overflow: auto;
  background: color-mix(in srgb, var(--bg-soft) 90%, var(--panel));
  border-right: 1px solid var(--border);
  padding: 20px 16px 28px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 4px 18px;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent-strong), #0969da);
  color: #fff;
  font-weight: 800;
}
.brand-title { font-size: 17px; font-weight: 750; }
.brand-subtitle { color: var(--muted); font-size: 12px; }
.search {
  display: block;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
.search input {
  width: 100%;
  margin-top: 7px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  outline: none;
}
.search input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
.nav-status {
  min-height: 20px;
  margin: 0 2px 10px;
  color: var(--subtle);
  font-size: 12px;
}
.category {
  margin: 8px 0;
  border: 1px solid transparent;
  border-radius: 10px;
}
.category-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  text-align: left;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
}
.category-toggle:hover { background: var(--border-soft); color: var(--text); }
.category-chevron { transition: transform .16s ease; }
.category.collapsed .category-chevron { transform: rotate(-90deg); }
.category-count { margin-left: auto; color: var(--subtle); font-weight: 600; }
.category-items { padding: 0 0 6px; }
.category.collapsed .category-items { display: none; }
.nav-link {
  display: block;
  width: 100%;
  padding: 8px 10px 8px 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  text-align: left;
  line-height: 1.45;
  cursor: pointer;
}
.nav-link:hover { background: var(--border-soft); }
.nav-link.active {
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 650;
}
.content {
  min-height: 100vh;
  margin-left: var(--sidebar-width);
  margin-right: var(--toc-width);
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  justify-content: space-between;
  padding: 18px 42px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(14px);
}
.breadcrumb { color: var(--muted); font-size: 13px; }
h1 {
  margin: 2px 0 0;
  font-size: 28px;
  line-height: 1.28;
  letter-spacing: 0;
}
.theme-button, .menu-button {
  flex: 0 0 auto;
  min-width: 42px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
.theme-button:hover, .menu-button:hover { border-color: var(--accent); color: var(--accent); }
.menu-button { display: none; font-size: 18px; }
.doc {
  max-width: 920px;
  padding: 34px 42px 90px;
}
.meta {
  display: inline-flex;
  gap: 8px;
  margin-bottom: 24px;
  padding: 5px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  color: var(--muted);
  background: var(--panel-raised);
  font-size: 12px;
}
.doc h2 {
  scroll-margin-top: 96px;
  margin: 34px 0 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 22px;
  line-height: 1.35;
  letter-spacing: 0;
}
.doc p { margin: 14px 0; }
.doc .lead {
  padding: 12px 14px;
  border-left: 4px solid var(--accent-strong);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-bg) 62%, transparent);
  font-size: 17px;
  font-weight: 650;
}
.doc img {
  display: block;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  cursor: zoom-in;
}
.doc figure {
  margin: 24px 0;
}
.doc figcaption {
  margin-top: 7px;
  color: var(--muted);
  font-size: 12px;
}
.doc a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.pager {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 48px;
}
.pager button {
  min-height: 72px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-raised);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.pager button:hover { border-color: var(--accent); box-shadow: var(--shadow); }
.pager span { display: block; color: var(--muted); font-size: 12px; }
.pager strong { display: block; margin-top: 4px; line-height: 1.4; }
.toc {
  position: fixed;
  inset: 84px 0 0 auto;
  width: var(--toc-width);
  overflow: auto;
  padding: 18px 18px 24px 8px;
  color: var(--muted);
}
.toc-title {
  margin-bottom: 10px;
  color: var(--subtle);
  font-size: 12px;
  font-weight: 750;
}
.toc a {
  display: block;
  padding: 6px 8px;
  border-left: 2px solid var(--border);
  color: var(--muted);
  text-decoration: none;
  font-size: 13px;
}
.toc a:hover, .toc a.active {
  border-left-color: var(--accent);
  color: var(--accent);
}
.scrim {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 24;
  background: rgba(0, 0, 0, .35);
}
.lightbox {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 40;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(1, 4, 9, .82);
}
.lightbox.open { display: flex; }
.lightbox img {
  max-width: min(1200px, 96vw);
  max-height: 92vh;
  border-radius: 8px;
  background: #fff;
}
.lightbox-close {
  position: fixed;
  top: 18px;
  right: 20px;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255,255,255,.35);
  border-radius: 8px;
  background: rgba(13,17,23,.75);
  color: #fff;
  font-size: 26px;
  cursor: pointer;
}

@media (max-width: 1180px) {
  .content { margin-right: 0; }
  .toc { display: none; }
}

@media (max-width: 860px) {
  .sidebar {
    transform: translateX(-100%);
    transition: transform .18s ease;
    z-index: 25;
    box-shadow: var(--shadow);
  }
  .sidebar.open { transform: translateX(0); }
  .scrim.open { display: block; }
  .content { margin-left: 0; }
  .topbar { padding: 14px 18px; }
  .doc { padding: 24px 18px 72px; }
  .menu-button { display: inline-grid; place-items: center; }
  h1 { font-size: 21px; }
  .theme-button { height: 34px; padding: 0 10px; }
  .pager { grid-template-columns: 1fr; }
}`;

const appJs = `const data = JSON.parse(document.getElementById("docs-data").textContent);
const nav = document.getElementById("nav");
const navStatus = document.getElementById("navStatus");
const title = document.getElementById("articleTitle");
const body = document.getElementById("articleBody");
const meta = document.getElementById("articleMeta");
const breadcrumb = document.getElementById("breadcrumb");
const tocNav = document.getElementById("tocNav");
const pager = document.getElementById("pager");
const progress = document.getElementById("progress");
const searchInput = document.getElementById("searchInput");
const sidebar = document.querySelector(".sidebar");
const menuButton = document.getElementById("menuButton");
const themeToggle = document.getElementById("themeToggle");
const scrim = document.getElementById("scrim");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxClose = document.getElementById("lightboxClose");

let activeId = location.hash ? decodeURIComponent(location.hash.slice(1)) : null;
const collapsed = new Set();

function allArticles() {
  return data.flatMap(section => section.articles.map(article => ({ ...article, category: section.category })));
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("docs-theme", theme);
  themeToggle.textContent = theme === "dark" ? "浅色" : "深色";
}

function initTheme() {
  const saved = localStorage.getItem("docs-theme");
  const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(saved || system);
}

function closeSidebar() {
  sidebar.classList.remove("open");
  scrim.classList.remove("open");
}

function renderNav(filter = "") {
  const query = filter.trim().toLowerCase();
  nav.innerHTML = "";
  let visibleCount = 0;
  for (const section of data) {
    const articles = section.articles.filter(article => {
      if (!query) return true;
      return (article.title + " " + article.searchText).toLowerCase().includes(query);
    });
    if (!articles.length) continue;
    visibleCount += articles.length;
    const group = document.createElement("section");
    group.className = "category" + (collapsed.has(section.category.id) && !query ? " collapsed" : "");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "category-toggle";
    toggle.innerHTML = \`<span class="category-chevron">⌄</span><span>\${section.category.name}</span><span class="category-count">\${articles.length}</span>\`;
    toggle.addEventListener("click", () => {
      if (collapsed.has(section.category.id)) collapsed.delete(section.category.id);
      else collapsed.add(section.category.id);
      renderNav(searchInput.value);
    });
    const list = document.createElement("div");
    list.className = "category-items";
    for (const article of articles) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-link" + (article.id === activeId ? " active" : "");
      button.textContent = article.title;
      button.addEventListener("click", () => showArticle(article.id));
      list.appendChild(button);
    }
    group.append(toggle, list);
    nav.appendChild(group);
  }
  navStatus.textContent = query ? \`找到 \${visibleCount} 篇匹配文档\` : "按分类浏览全部文档";
}

function slugifyHeading(text, index) {
  return "section-" + index + "-" + encodeURIComponent(text.trim()).replace(/%/g, "").slice(0, 32);
}

function renderToc() {
  tocNav.innerHTML = "";
  const headings = [...body.querySelectorAll("h2")].filter(heading => heading.textContent.trim());
  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = slugifyHeading(heading.textContent, index);
    const link = document.createElement("a");
    link.href = "#" + heading.id;
    link.textContent = heading.textContent.trim();
    link.addEventListener("click", event => {
      event.preventDefault();
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", "#" + encodeURIComponent(activeId));
    });
    tocNav.appendChild(link);
  });
  if (!headings.length) tocNav.innerHTML = '<span class="toc-empty">暂无小节</span>';
}

function renderPager(record) {
  const articles = allArticles();
  const index = articles.findIndex(article => article.id === record.id);
  const prev = articles[index - 1];
  const next = articles[index + 1];
  pager.innerHTML = "";
  for (const item of [
    { label: "上一篇", article: prev },
    { label: "下一篇", article: next },
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = !item.article;
    button.innerHTML = item.article
      ? \`<span>\${item.label}</span><strong>\${item.article.title}</strong>\`
      : \`<span>\${item.label}</span><strong>没有更多文章</strong>\`;
    if (item.article) button.addEventListener("click", () => showArticle(item.article.id));
    pager.appendChild(button);
  }
}

function showArticle(id) {
  const record = allArticles().find(article => article.id === id) || allArticles()[0];
  if (!record) return;
  activeId = record.id;
  title.textContent = record.title;
  breadcrumb.textContent = record.category.name;
  meta.textContent = \`更新时间：\${formatDate(record.updatedAt)} · \${record.category.name}\`;
  body.innerHTML = record.html || "<p>这篇文章没有正文内容。</p>";
  history.replaceState(null, "", "#" + encodeURIComponent(record.id));
  renderToc();
  renderPager(record);
  renderNav(searchInput.value);
  closeSidebar();
  window.scrollTo({ top: 0, behavior: "instant" });
}

searchInput.addEventListener("input", () => renderNav(searchInput.value));
menuButton.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  scrim.classList.toggle("open", sidebar.classList.contains("open"));
});
scrim.addEventListener("click", closeSidebar);
themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
body.addEventListener("click", event => {
  const link = event.target.closest("a[href^='#']");
  if (!link) return;
  const id = decodeURIComponent(link.getAttribute("href").slice(1));
  if (!allArticles().some(article => article.id === id)) return;
  event.preventDefault();
  showArticle(id);
});
body.addEventListener("click", event => {
  const image = event.target.closest("img");
  if (!image) return;
  lightboxImage.src = image.src;
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
});
function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.removeAttribute("src");
}
lightbox.addEventListener("click", event => {
  if (event.target === lightbox) closeLightbox();
});
lightboxClose.addEventListener("click", closeLightbox);
window.addEventListener("scroll", () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = max > 0 ? Math.min(100, (window.scrollY / max) * 100) + "%" : "0";
  const headings = [...body.querySelectorAll("h2")];
  let current = null;
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top < 130) current = heading.id;
  }
  [...tocNav.querySelectorAll("a")].forEach(link => {
    link.classList.toggle("active", current && link.getAttribute("href") === "#" + current);
  });
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeSidebar();
    closeLightbox();
  }
});

initTheme();
renderNav();
showArticle(activeId);`;

async function writeSite(data) {
  const siteDir = path.join(OUT_DIR, "site");
  await fs.mkdir(siteDir, { recursive: true });
  const context = {
    articleBySlug: buildArticleIndex(data),
    imageMap: await downloadImages(data),
  };
  await fs.writeFile(path.join(siteDir, "index.html"), siteHtml(data, context), "utf8");
  await fs.writeFile(path.join(siteDir, "styles.css"), css, "utf8");
  await fs.writeFile(path.join(siteDir, "app.js"), appJs, "utf8");
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
