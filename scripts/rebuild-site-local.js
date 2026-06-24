const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "docs");
const SITE_DIR = path.join(ROOT, "site");


const CATEGORY_ORDER = [
  "\u661f\u8fb0Whatsapp\u4f7f\u7528\u624b\u518cV2.0",
  "\u5e38\u89c1\u95ee\u9898",
  "\u6d4b\u8bd5\u7ed3\u679c",
];

const PINNED_ARTICLE_ORDER = {
  "\u661f\u8fb0Whatsapp\u4f7f\u7528\u624b\u518cV2.0": [
    "69a7d0daa889b919f4222ff9",
    "8a8a83d08de3e1db318905f2",
    "4bd71ff4ff791cc70cb2b33a",
    "3c582c7841373f5b2c92ce9c",
    "130e72704a7ad203b64004ca",
    "7d0b620f82cc816acc54d963",
    "43378e8e2b9f173541747e4b",
    "130fdeea74a9912da4275485",
    "6a0dabf9db178f1cad82b71f",
    "24a22d888bf7ec11a807a1b6",
    "8983db65132cba9a1dc96751",
    "7466efc325536dd41f9258fa",
    "91607c6bee58eee082787eba",
    "75d4ce22d9f68f92fa0d7e6e",
    "d4e55cd8ffc5569b71db6eeb",
    "749e3e05e9e68b4ea6aca3a0",
    "58b9b6849105343563639e9c",
    "fad933e15da3a515f5882972",
    "2388935951e7ec39c9beafb2",
    "d4b3c2a02ced51eec27b6ad2",
    "14954024065c4b5ad2b53205",
    "1bb06441c03c0b4cf92ddb34",
  ],
  "\u5e38\u89c1\u95ee\u9898": [
    "a2980b63aff5e5944f3a8147",
    "017fd6fd9859424b3e429587",
    "d4fe0f681bdbb9233865dd6b",
    "07e22c3e84fe58064e09a284",
    "4f6105e4d0d02911ec7af302",
    "63e2871f32f32b3994cef5d6",
    "b72601dc3d6015a537f1e7bc",
    "4cdbbb52f226f7030f1d3595",
    "9ed854efdcee60e3469dab41",
    "4dcffb42881078e696792326",
    "e54e9c3d3ba7b25d7e4fc735",
    "0060aa2996494c2ba72a6382",
  ],
  "\u6d4b\u8bd5\u7ed3\u679c": [
    "4c12206ddddf3471b6e3e5c0",
  ],
};

const HIDDEN_ARTICLE_IDS = new Set([
  "ca40a1a5e77bad3ae2d060b4",
  "7afb2255add78d6610d66d44",
  "4363fef8e90eeb39ffd64ca7",
  "6380957ca4286f742b8aa074",
]);

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
  const greenShield = '<span class="shield-label shield-label-green">【绿色】<svg aria-hidden="true" class="svg-icon trust-icon green"><use href="#icon-chat-trust"></use></svg></span>';
  const orangeShield = '<span class="shield-label shield-label-orange">【橙色】<svg aria-hidden="true" class="svg-icon trust-icon yellow"><use href="#icon-chat-trust"></use></svg></span>';
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/~~([\s\S]+?)~~/g, "<del>$1</del>");
  html = html.replace(/【绿色】/g, greenShield);
  html = html.replace(/【橙色】/g, orangeShield);
  html = html.replace(/【绿色盾牌】/g, `${greenShield}盾牌`);
  html = html.replace(/【橙色盾牌】/g, `${orangeShield}盾牌`);
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
  const categoryPrefix = "\u5206\u7c7b\uff1a";
  const updatedPrefix = "\u66f4\u65b0\u65f6\u95f4\uff1a";
  const idPrefix = "ID\uff1a";
  const titleLine = lines.find(line => line.startsWith("# "));
  const categoryLine = lines.find(line => line.startsWith(categoryPrefix));
  const updatedLine = lines.find(line => line.startsWith(updatedPrefix));
  const idLine = lines.find(line => line.startsWith(idPrefix));
  const firstBodyLine = lines.findIndex((line, index) => index > 0 && line.trim() && !line.startsWith(categoryPrefix) && !line.startsWith(updatedPrefix) && !line.startsWith(idPrefix));

  return {
    title: titleLine ? titleLine.replace(/^#\s+/, "").trim() : fallbackTitle,
    category: categoryLine ? categoryLine.slice(categoryPrefix.length).trim() : fallbackCategory,
    updatedAt: updatedLine ? updatedLine.slice(updatedPrefix.length).trim() : "",
    id: idLine ? idLine.slice(idPrefix.length).trim() : "",
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
    const id = meta.id || stableId(relative);
    if (HIDDEN_ARTICLE_IDS.has(id)) continue;

    const record = {
      file,
      relative,
      id,
      title: meta.title,
      category: meta.category,
      sourceCategory: meta.category,
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
  <svg aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden">
    <symbol id="icon-chat-trust" viewBox="0 0 1024 1024">
      <path d="M512 64 160 192v266c0 224 142 421 352 502 210-81 352-278 352-502V192L512 64z"></path>
      <path d="M512 164 256 257v209c0 161 100 306 256 379 156-73 256-218 256-379V257L512 164z" opacity=".28"></path>
      <path d="m449 585-98-98-62 62 160 160 286-286-62-62-224 224z" fill="#fff"></path>
    </symbol>
  </svg>
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
