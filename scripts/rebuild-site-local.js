const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "docs");
const SITE_DIR = path.join(ROOT, "site");

const KNOWN_IDS = new Map([
  ["星辰Whatsapp使用手册V2.0/如何在星辰登录whatsapp账号.md", "69a7d0daa889b919f4222ff9"],
]);

const CATEGORY_ORDER = [
  "星辰Whatsapp使用手册V2.0",
  "星辰whatsapp协议常见问题",
  "星辰whatsapp协议优势",
  "星辰使用建议",
  "封控",
];

const PINNED_ARTICLE_ORDER = {
  "星辰Whatsapp使用手册V2.0": [
    "69a7d0daa889b919f4222ff9",
  ],
};

function posixPath(value) {
  return value.split(path.sep).join("/");
}

function stableId(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 24);
}

function escapeHtml(input = "") {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineMarkdown(text, linkResolver) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const target = linkResolver(href);
    return `<a href="${escapeHtml(target)}">${label}</a>`;
  });
  return html;
}

async function listMarkdownFiles(dir = DOCS_DIR) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await listMarkdownFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(fullPath);
  }
  return result;
}

function readMeta(markdown, fallbackTitle, fallbackCategory) {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find(line => line.startsWith("# "));
  const categoryLine = lines.find(line => line.startsWith("分类："));
  const updatedLine = lines.find(line => line.startsWith("更新时间："));
  const firstBodyLine = lines.findIndex((line, index) => index > 0 && line.trim() && !line.startsWith("分类：") && !line.startsWith("更新时间："));

  return {
    title: titleLine ? titleLine.replace(/^#\s+/, "").trim() : fallbackTitle,
    category: categoryLine ? categoryLine.replace(/^分类：/, "").trim() : fallbackCategory,
    updatedAt: updatedLine ? updatedLine.replace(/^更新时间：/, "").trim() : "",
    bodyLines: lines.slice(Math.max(firstBodyLine, 1)),
  };
}

function markdownToHtml(lines, currentDir, fileToArticle) {
  const html = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];

  function resolveLink(href) {
    if (/^https?:\/\//i.test(href) || href.startsWith("#")) return href;
    const cleanHref = decodeURIComponent(href).split("#")[0];
    const full = path.normalize(path.resolve(currentDir, cleanHref));
    const article = fileToArticle.get(full);
    return article ? `#${article.id}` : href;
  }

  function flushParagraph() {
    const text = paragraph.join("<br>");
    paragraph = [];
    if (!text.trim()) return;
    const plain = text.replace(/<br>/g, "").trim();
    const isLead = /^\*\*[\s\S]+\*\*$/.test(plain) && !plain.slice(2, -2).includes("**");
    const content = inlineMarkdown(text, resolveLink);
    html.push(isLead ? `<p class="lead">${content}</p>` : `<p>${content}</p>`);
  }

  function renderImage(src) {
    const imageName = path.basename(decodeURIComponent(src));
    return `<figure><img src="./assets/images/${escapeHtml(imageName)}" alt="" loading="lazy"></figure>`;
  }

  function renderQuote(text) {
    return `<blockquote>${inlineMarkdown(text, resolveLink)}</blockquote>`;
  }

  function flushList() {
    if (!listType || !listItems.length) return;
    const tag = listType === "ordered" ? "ol" : "ul";
    html.push(`<${tag} class="doc-list">${listItems.map(item => `<li>${item}</li>`).join("")}</${tag}>`);
    listType = null;
    listItems = [];
  }

  function addListItem(type, text) {
    flushParagraph();
    if (listType && listType !== type) flushList();
    listType = type;
    listItems.push(inlineMarkdown(text, resolveLink));
  }

  function appendToListItem(fragment) {
    if (!listItems.length) return false;
    listItems[listItems.length - 1] += fragment;
    return true;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const nestedLine = rawLine.match(/^\s{2,}(.+)/)?.[1]?.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (nestedLine && listType) {
      const nestedImage = nestedLine.match(/^!\[[^\]]*\]\(([^)]+)\)/);
      if (nestedImage) {
        appendToListItem(renderImage(nestedImage[1]));
        continue;
      }

      const nestedQuote = nestedLine.match(/^>\s+(.+)/);
      if (nestedQuote) {
        appendToListItem(renderQuote(nestedQuote[1]));
        continue;
      }

      appendToListItem(`<p>${inlineMarkdown(nestedLine, resolveLink)}</p>`);
      continue;
    }

    const image = line.match(/^!\[[^\]]*\]\(([^)]+)\)/);
    if (image) {
      flushParagraph();
      flushList();
      html.push(renderImage(image[1]));
      continue;
    }

    const quote = line.match(/^>\s+(.+)/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(renderQuote(quote[1]));
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)/);
    if (ordered) {
      addListItem("ordered", ordered[1]);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)/);
    if (unordered) {
      addListItem("unordered", unordered[1]);
      continue;
    }

    const subheading = line.match(/^###\s+(.+)/);
    if (subheading) {
      flushParagraph();
      flushList();
      html.push(`<h3>${inlineMarkdown(subheading[1], resolveLink)}</h3>`);
      continue;
    }

    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      flushParagraph();
      flushList();
      html.push(`<h2>${inlineMarkdown(heading[1], resolveLink)}</h2>`);
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return html.join("\n");
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function buildData() {
  const files = await listMarkdownFiles();
  const records = [];
  const fileToArticle = new Map();

  for (const file of files) {
    const relative = posixPath(path.relative(DOCS_DIR, file));
    const category = posixPath(path.dirname(relative));
    const fallbackTitle = path.basename(file, ".md");
    const markdown = await fs.readFile(file, "utf8");
    const meta = readMeta(markdown, fallbackTitle, category);
    const id = KNOWN_IDS.get(relative) || stableId(relative);
    const record = {
      file,
      relative,
      id,
      title: meta.title,
      category: meta.category,
      updatedAt: meta.updatedAt,
      bodyLines: meta.bodyLines,
    };
    records.push(record);
    fileToArticle.set(path.normalize(file), record);
  }

  const groups = new Map();
  for (const record of records) {
    record.html = markdownToHtml(record.bodyLines, path.dirname(record.file), fileToArticle);
    record.searchText = record.bodyLines.join(" ").replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/[#*_`[\]()]/g, " ");
    if (!groups.has(record.category)) groups.set(record.category, []);
    groups.get(record.category).push(record);
  }

  const categories = [...groups.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b, "zh-CN");
  });

  return categories.map(categoryName => {
    const pinned = PINNED_ARTICLE_ORDER[categoryName] || [];
    const articles = groups.get(categoryName).sort((a, b) => {
      const ai = pinned.indexOf(a.id);
      const bi = pinned.indexOf(b.id);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.title.localeCompare(b.title, "zh-CN");
    });
    return {
      category: {
        id: stableId(categoryName),
        name: categoryName,
        articlesCount: articles.length,
      },
      articles: articles.map(article => ({
        id: article.id,
        title: article.title,
        updatedAt: article.updatedAt,
        searchText: article.searchText,
        html: article.html,
      })),
    };
  });
}

function siteHtml(data) {
  const total = data.reduce((sum, item) => sum + item.articles.length, 0);
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
        <div class="brand-subtitle">${total} 篇文档</div>
      </div>
    </div>
    <label class="search">
      <span>搜索文档</span>
      <input id="searchInput" type="search" placeholder="输入关键词">
    </label>
    <div class="nav-status" id="navStatus"></div>
    <nav id="nav"></nav>
  </aside>
  <main class="content">
    <header class="topbar">
      <button id="menuButton" class="icon-button menu-button" type="button" aria-label="打开目录">☰</button>
      <div class="topbar-copy">
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
  <script id="docs-data" type="application/json">${scriptJson(data)}</script>
  <script src="./app.js"></script>
</body>
</html>
`;
}

async function main() {
  const data = await buildData();
  await writeSiteFromData(data);
  await writeRawSnapshot(data);
  console.log(`rebuilt site: ${data.reduce((sum, section) => sum + section.articles.length, 0)} articles`);
}

async function writeSiteFromData(data) {
  await fs.mkdir(SITE_DIR, { recursive: true });
  await fs.writeFile(path.join(SITE_DIR, "index.html"), siteHtml(data), "utf8");
}

async function writeRawSnapshot(data) {
  await fs.mkdir(path.join(ROOT, "raw"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "raw", "docs.json"), JSON.stringify(data, null, 2), "utf8");
}

module.exports = {
  buildData,
  writeRawSnapshot,
  writeSiteFromData,
};

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
