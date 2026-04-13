const DATA_URL = "/book/site_data/chapters_full.json";

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

function normalizePlainText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdownHeading(value) {
  return normalizePlainText(value).replace(/^##\s*/, "");
}

function resolveVideoSource(videoUrl) {
  const value = String(videoUrl || "").trim();
  if (!value) {
    return "";
  }
  if (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("/") || value.startsWith(".")) {
    return value;
  }
  return `../book/videos/${value}`;
}

function isTagOnlyLine(line) {
  return /^#\S+(?:\s+#\S+)*$/.test(line.trim());
}

function removeEdgeTagLines(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").trim().split("\n");

  while (lines.length > 0 && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  if (lines.length > 0 && isTagOnlyLine(lines[0])) {
    lines.shift();
  }

  if (lines.length > 0 && isTagOnlyLine(lines[lines.length - 1])) {
    lines.pop();
  }

  return lines.join("\n").trim();
}

function extractAnnotation(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const match = source.match(/^\s*\[annotation\]\s*([\s\S]*?)\s*\[\/annotation\]\s*/i);

  if (!match) {
    return {
      annotation: "",
      cleanedText: source,
    };
  }

  return {
    annotation: match[1].replace(/\s+/g, " ").trim(),
    cleanedText: source.slice(match[0].length).trim(),
  };
}

function renderReadableMarkdown(container, markdown, chapterTitle) {
  container.replaceChildren();

  const blocks = removeEdgeTagLines(markdown)
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^\[video:\s*.+\]$/i.test(block));

  let skippedDuplicateTitle = false;

  for (const block of blocks) {
    if (/^##\s+/.test(block)) {
      const headingText = block.replace(/^##\s+/, "");
      if (
        !skippedDuplicateTitle &&
        stripMarkdownHeading(headingText) === stripMarkdownHeading(chapterTitle)
      ) {
        skippedDuplicateTitle = true;
        continue;
      }

      const title = document.createElement("h2");
      title.className = "chapter-page__text-title";
      title.textContent = headingText;
      container.append(title);
      continue;
    }

    const paragraph = document.createElement("p");
    paragraph.className = "chapter-page__text-paragraph";
    paragraph.textContent = block.replace(/^\*(.*)\*$/, "$1");
    container.append(paragraph);
  }
}

function renderVideoBlock(container, chapter) {
  const videoUrl = chapter?.chapter_video_url || chapter?.video_url || "";
  container.replaceChildren();

  if (!videoUrl) {
    container.hidden = true;
    return;
  }

  const isVideoFile = /\.(mp4|webm|ogg)(?:$|\?|\#)/i.test(videoUrl);
  const source = resolveVideoSource(videoUrl);

  if (isVideoFile) {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.src = source;
    video.className = "chapter-page__video-media";
    container.append(video);
  } else {
    const iframe = document.createElement("iframe");
    iframe.src = source;
    iframe.title = `Видео к главе ${chapter.chapter_number}`;
    iframe.loading = "lazy";
    iframe.allowFullscreen = true;
    iframe.className = "chapter-page__video-media";
    container.append(iframe);
  }

  container.hidden = false;
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
  const pageIntro = byId("chapter-page-intro");
  const pageVideo = byId("chapter-page-video");
  const pageText = byId("chapter-page-text");
  const pageTags = byId("chapter-page-tags");
  const prevLink = byId("prev-chapter");
  const nextLink = byId("next-chapter");

  if (!pageTitle || !pageIntro || !pageVideo || !pageText || !pageTags || !prevLink || !nextLink) {
    return;
  }

  if (!chapter || !isPublicChapter(chapter)) {
    pageTitle.textContent = "Глава недоступна";
    pageIntro.textContent = "Эта глава скрыта или не найдена.";
    pageText.replaceChildren();
    pageVideo.replaceChildren();
    pageVideo.hidden = true;
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

  const { annotation, cleanedText } = extractAnnotation(chapter.full_text_markdown || "");

  pageIntro.textContent = chapter.chapter_annotation || annotation || chapter.short_summary || "";
  renderVideoBlock(pageVideo, chapter);
  renderReadableMarkdown(pageText, cleanedText, chapter.chapter_title || "");

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
