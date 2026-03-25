const DATA_URL = "../book/site_data/chapters_full.json";

const state = {
  chapters: [],
  chaptersById: new Map(),
  visibleChapters: [],
  activeTag: null,
};

const byId = (id) => document.getElementById(id);

function normalizeChapters(data) {
  const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
  return chapters.slice().sort((a, b) => a.chapter_number - b.chapter_number);
}

function isPublicChapter(chapter) {
  return chapter?.visibility === "public";
}

function buildMaps(chapters) {
  state.chapters = chapters;
  state.chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  state.visibleChapters = chapters.filter(isPublicChapter);
}

function getUniqueTags(chapters) {
  const counts = new Map();
  for (const chapter of chapters) {
    for (const tag of chapter.scene_tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .map(([tag, count]) => ({ tag, count }));
}

function updateUrlParam(tag) {
  const url = new URL(window.location.href);
  if (tag) {
    url.searchParams.set("tag", tag);
  } else {
    url.searchParams.delete("tag");
  }
  window.history.replaceState({}, "", url);
}

function setActiveTag(tag) {
  state.activeTag = tag || null;
  if (document.body.dataset.page === "index") {
    renderIndex();
  }
}

function escapeForText(value) {
  return value ?? "";
}

function renderReadableMarkdown(container, markdown) {
  container.replaceChildren();

  const blocks = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (/^##\s+/.test(block)) {
      const title = document.createElement("h2");
      title.className = "chapter-page__text-title";
      title.textContent = block.replace(/^##\s+/, "");
      container.append(title);
      continue;
    }

    const paragraph = document.createElement("p");
    paragraph.className = "chapter-page__text-paragraph";
    paragraph.textContent = block.replace(/^\*(.*)\*$/, "$1");
    container.append(paragraph);
  }
}

function createChip({ label, onClick, active = false, clear = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = clear ? "tag-chip tag-chip--clear" : "tag-chip";
  button.textContent = label;
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.addEventListener("click", onClick);
  return button;
}

function findVisibleNeighbor(startId, direction) {
  const seen = new Set();
  let currentId = startId;

  while (currentId) {
    if (seen.has(currentId)) {
      return null;
    }
    seen.add(currentId);

    const chapter = state.chaptersById.get(currentId);
    if (!chapter) {
      return null;
    }

    if (isPublicChapter(chapter)) {
      return chapter;
    }

    currentId = direction === "prev" ? chapter.previous_id : chapter.next_id;
  }

  return null;
}

function getChapterById(id) {
  return state.chaptersById.get(id) || null;
}

function getPublicChapterUrl(chapter, tag = null) {
  const url = new URL("./chapter.html", window.location.href);
  url.searchParams.set("id", chapter.id);
  if (tag) {
    url.searchParams.set("tag", tag);
  }
  return url.toString();
}

function renderIndex() {
  const chapterList = byId("chapter-list");
  const filterStatus = byId("filter-status");
  const chapterCount = byId("chapter-count");
  const emptyState = byId("empty-state");
  const tagFilters = byId("tag-filters");

  if (!chapterList || !filterStatus || !chapterCount || !emptyState || !tagFilters) {
    return;
  }

  const uniqueTags = getUniqueTags(state.visibleChapters);
  tagFilters.replaceChildren();
  tagFilters.append(
    createChip({
      label: "Все теги",
      clear: true,
      active: !state.activeTag,
      onClick: () => {
        updateUrlParam(null);
        setActiveTag(null);
      },
    }),
  );

  for (const item of uniqueTags) {
    tagFilters.append(
      createChip({
        label: `${item.tag} (${item.count})`,
        active: state.activeTag === item.tag,
        onClick: () => {
          updateUrlParam(item.tag);
          setActiveTag(item.tag);
        },
      }),
    );
  }

  const chapters = state.visibleChapters.filter((chapter) => {
    if (!state.activeTag) {
      return true;
    }
    return (chapter.scene_tags || []).includes(state.activeTag);
  });

  chapterCount.textContent = `${chapters.length} из ${state.visibleChapters.length}`;
  filterStatus.textContent = state.activeTag
    ? `Показаны главы с тегом ${state.activeTag}`
    : "Показаны все публичные главы";

  chapterList.replaceChildren();

  for (const chapter of chapters) {
    const card = document.createElement("article");
    card.className = "chapter-card";

    const top = document.createElement("div");
    top.className = "chapter-card__top";

    const title = document.createElement("h3");
    title.className = "chapter-card__title";

    const link = document.createElement("a");
    link.href = getPublicChapterUrl(chapter, state.activeTag);
    link.textContent = `${chapter.chapter_number}. ${escapeForText(chapter.chapter_title)}`;
    title.append(link);

    const meta = document.createElement("div");
    meta.className = "chapter-card__meta";
    meta.textContent = chapter.chapter_type || "";

    top.append(title, meta);

    const summary = document.createElement("p");
    summary.className = "chapter-card__summary";
    summary.textContent = chapter.short_summary || "";

    const tags = document.createElement("div");
    tags.className = "chapter-card__tags";
    for (const tag of chapter.scene_tags || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chapter-card__tag";
      button.textContent = `#${tag}`;
      button.addEventListener("click", () => {
        updateUrlParam(tag);
        setActiveTag(tag);
      });
      tags.append(button);
    }

    card.append(top, summary, tags);
    chapterList.append(card);
  }

  if (chapters.length === 0) {
    emptyState.textContent = state.activeTag
      ? `По тегу #${state.activeTag} пока нет ни одной публичной главы.`
      : "Публичных глав пока нет.";
  } else {
    emptyState.textContent = "";
  }
  emptyState.hidden = chapters.length !== 0;
}

function renderChapterPage() {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("id");
  const chapter = id ? getChapterById(id) : state.visibleChapters[0] || null;

  const pageTitle = byId("chapter-page-title");
  const pageMeta = byId("chapter-page-meta");
  const pageBadges = byId("chapter-page-badges");
  const pageSummary = byId("chapter-page-summary");
  const pageText = byId("chapter-page-text");
  const pageTags = byId("chapter-page-tags");
  const prevLink = byId("prev-chapter");
  const nextLink = byId("next-chapter");

  if (!pageTitle || !pageMeta || !pageBadges || !pageSummary || !pageText || !pageTags || !prevLink || !nextLink) {
    return;
  }

  if (!chapter || !isPublicChapter(chapter)) {
    pageTitle.textContent = "Глава недоступна";
    pageMeta.textContent = "Эта глава скрыта или не найдена.";
    pageBadges.replaceChildren();
    pageSummary.textContent = "На публичных страницах показываются только главы с visibility = public.";
    pageText.replaceChildren();
    pageTags.replaceChildren();
    prevLink.textContent = "Предыдущая глава";
    prevLink.setAttribute("aria-disabled", "true");
    prevLink.removeAttribute("href");
    nextLink.textContent = "Следующая глава";
    nextLink.setAttribute("aria-disabled", "true");
    nextLink.removeAttribute("href");
    return;
  }

  document.title = `Под Огромной Луной — ${chapter.chapter_title}`;
  pageTitle.textContent = `${chapter.chapter_number}. ${chapter.chapter_title}`;
  pageMeta.textContent = `${chapter.chapter_type || ""} · ${chapter.visibility === "public" ? "публичная глава" : "скрытая глава"}`;
  pageBadges.replaceChildren();

  const numberBadge = document.createElement("span");
  numberBadge.className = "chapter-page__badge";
  numberBadge.textContent = `Глава ${chapter.chapter_number}`;
  const typeBadge = document.createElement("span");
  typeBadge.className = "chapter-page__badge";
  typeBadge.textContent = chapter.chapter_type || "Без типа";
  pageBadges.append(numberBadge, typeBadge);

  pageSummary.textContent = chapter.short_summary || "";
  renderReadableMarkdown(pageText, chapter.full_text_markdown || "");

  pageTags.replaceChildren();
  for (const tag of chapter.scene_tags || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip chapter-page__tag";
    chip.textContent = `#${tag}`;
    chip.addEventListener("click", () => {
      const url = new URL("./index.html", window.location.href);
      url.searchParams.set("tag", tag);
      window.location.href = url.toString();
    });
    pageTags.append(chip);
  }

  const prevChapter = findVisibleNeighbor(chapter.previous_id, "prev");
  const nextChapter = findVisibleNeighbor(chapter.next_id, "next");

  if (prevChapter) {
    prevLink.href = getPublicChapterUrl(prevChapter);
    prevLink.textContent = `← ${prevChapter.chapter_number}. ${prevChapter.chapter_title}`;
    prevLink.removeAttribute("aria-disabled");
  } else {
    prevLink.textContent = "Предыдущая глава";
    prevLink.setAttribute("aria-disabled", "true");
    prevLink.removeAttribute("href");
  }

  if (nextChapter) {
    nextLink.href = getPublicChapterUrl(nextChapter);
    nextLink.textContent = `${nextChapter.chapter_number}. ${nextChapter.chapter_title} →`;
    nextLink.removeAttribute("aria-disabled");
  } else {
    nextLink.textContent = "Следующая глава";
    nextLink.setAttribute("aria-disabled", "true");
    nextLink.removeAttribute("href");
  }
}

async function loadData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить данные: ${response.status}`);
  }
  return response.json();
}

async function bootstrap() {
  try {
    const data = await loadData();
    buildMaps(normalizeChapters(data));

    const url = new URL(window.location.href);
    state.activeTag = url.searchParams.get("tag") || null;

    if (document.body.dataset.page === "index") {
      renderIndex();
    } else if (document.body.dataset.page === "chapter") {
      renderChapterPage();
    }
  } catch (error) {
    const body = document.body;
    body.innerHTML = `
      <main style="max-width: 720px; margin: 48px auto; font-family: Georgia, serif; line-height: 1.6;">
        <h1>Не удалось загрузить сайт</h1>
        <p>${String(error.message || error)}</p>
        <p>Проверь, что сайт открыт через локальный сервер и что путь к <code>${DATA_URL}</code> доступен из папки <code>site</code>.</p>
      </main>
    `;
  }
}

bootstrap();
