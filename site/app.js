const data = JSON.parse(document.getElementById("docs-data").textContent);
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
      return `${article.title} ${article.searchText}`.toLowerCase().includes(query);
    });

    if (!articles.length) continue;
    visibleCount += articles.length;

    const group = document.createElement("section");
    group.className = "category" + (collapsed.has(section.category.id) && !query ? " collapsed" : "");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "category-toggle";
    toggle.innerHTML = `<span class="category-chevron">⌄</span><span>${section.category.name}</span><span class="category-count">${articles.length}</span>`;
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

  navStatus.textContent = query ? `找到 ${visibleCount} 篇匹配文档` : "按分类浏览全部文档";
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
  const items = [
    { label: "上一篇", article: articles[index - 1] },
    { label: "下一篇", article: articles[index + 1] },
  ];

  pager.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = !item.article;
    button.innerHTML = item.article
      ? `<span>${item.label}</span><strong>${item.article.title}</strong>`
      : `<span>${item.label}</span><strong>没有更多文章</strong>`;
    if (item.article) button.addEventListener("click", () => showArticle(item.article.id));
    pager.appendChild(button);
  }
}

function enhanceArticle() {
  body.querySelectorAll("figure").forEach((figure, index) => {
    if (!figure.querySelector("figcaption")) {
      const caption = document.createElement("figcaption");
      caption.textContent = `截图 ${index + 1}`;
      figure.appendChild(caption);
    }
  });
}

function showArticle(id) {
  const articles = allArticles();
  const record = articles.find(article => article.id === id) || articles[0];
  if (!record) return;

  activeId = record.id;
  title.textContent = record.title;
  breadcrumb.textContent = record.category.name;
  meta.textContent = `更新时间：${formatDate(record.updatedAt)} · ${record.category.name}`;
  body.innerHTML = record.html || "<p>这篇文章没有正文内容。</p>";

  history.replaceState(null, "", "#" + encodeURIComponent(record.id));
  enhanceArticle();
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
showArticle(activeId);
