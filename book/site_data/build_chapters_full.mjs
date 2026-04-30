import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const paths = {
  index: path.join(repoRoot, "book/context/chapter_index.md"),
  chaptersDir: path.join(repoRoot, "book/chapters"),
  output: path.join(repoRoot, "book/site_data/chapters_full.json"),
};

const VIDEO_BASE_URL = process.env.VIDEO_BASE_URL?.trim() || "";

function chapterId(number) {
  return `ch-${String(number).padStart(3, "0")}`;
}

function normalizeTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSceneTags(raw) {
  return String(raw || "")
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/^#/, ""));
}

function extractField(block, label) {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "mi");
  const match = block.match(pattern);
  return match ? match[1].trim() : "";
}

function parseIndex(indexText) {
  const headingRegex = /^##\s+(\d{2})\.\s+(.+)$/gm;
  const matches = [...indexText.matchAll(headingRegex)];
  const chapters = [];

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const blockStart = current.index ?? 0;
    const blockEnd = next ? next.index ?? indexText.length : indexText.length;
    const block = indexText.slice(blockStart, blockEnd).trim();
    const chapter_number = Number(current[1]);
    const chapter_title = normalizeTitle(current[2]);
    const short_summary = extractField(block, "- Краткое содержание") || extractField(block, "Краткое содержание");
    const chapter_type = extractField(block, "- тип") || extractField(block, "тип");
    const scene_tags = parseSceneTags(
      extractField(block, "- сценические теги") || extractField(block, "сценические теги"),
    );

    chapters.push({
      chapter_number,
      chapter_title,
      short_summary,
      chapter_type,
      scene_tags,
    });
  }

  return chapters.sort((a, b) => a.chapter_number - b.chapter_number);
}

async function readMarkdownFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function stripAnnotationBlock(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const match = source.match(/^\s*\[annotation\]\s*([\s\S]*?)\s*\[\/annotation\]\s*/);

  if (!match) {
    return {
      annotation: "",
      text: source,
    };
  }

  return {
    annotation: normalizeTitle(match[1].replace(/\n{3,}/g, "\n\n")),
    text: source.slice(match[0].length),
  };
}

function extractSceneTags(line) {
  return String(line || "")
    .trim()
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/^#/, ""));
}

function extractChapterStructure(markdown) {
  const { annotation, text } = stripAnnotationBlock(markdown);
  const source = text.replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const cleanedLines = [];
  const sceneTags = [];
  let title = "";
  let videoUrl = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!title) {
      const titleMatch = trimmed.match(/^##\s+(.+)$/);
      if (titleMatch) {
        title = normalizeTitle(titleMatch[1]);
        cleanedLines.push(line);
        continue;
      }
    }

    if (/^\[video:\s*(.+?)\]\s*$/.test(trimmed)) {
      if (!videoUrl) {
        const videoMatch = trimmed.match(/^\[video:\s*(.+?)\]\s*$/);
        const videoFile = videoMatch ? videoMatch[1].trim() : "";
        videoUrl = videoFile
          ? (/^(?:[a-z]+:)?\/\//i.test(videoFile) || videoFile.startsWith("/") || videoFile.startsWith(".")
              ? videoFile
              : VIDEO_BASE_URL
                ? `${VIDEO_BASE_URL.replace(/\/+$/, "")}/${videoFile.replace(/^\/+/, "")}`
                : videoFile)
          : null;
      }
      continue;
    }

    if (/^#\S+(?:\s+#\S+)*$/.test(trimmed)) {
      sceneTags.push(...extractSceneTags(trimmed));
      continue;
    }

    cleanedLines.push(line);
  }

  const cleanedText = cleanedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    annotation,
    title,
    videoUrl,
    sceneTags,
    cleanedText,
  };
}

function warn(warnings, message) {
  warnings.push(message);
  console.warn(message);
}

async function build() {
  const warnings = [];
  const indexText = await fs.readFile(paths.index, "utf8");
  const indexChapters = parseIndex(indexText);

  // Создаем словарь метаданных из индекса по названию главы (в нижнем регистре)
  const indexMap = new Map();
  for (const item of indexChapters) {
    indexMap.set(item.chapter_title.toLowerCase(), item);
  }

  const chapters = [];
  
  // Читаем файлы из папки, фильтруем только .md и сортируем по имени (как в ОС)
  const dirFiles = await fs.readdir(paths.chaptersDir);
  const mdFiles = dirFiles.filter(f => f.endsWith(".md")).sort();

  for (let i = 0; i < mdFiles.length; i += 1) {
    const filename = mdFiles[i];
    const chapter_number = i + 1; // Номер по порядку в папке
    const id = chapterId(chapter_number);
    const markdownPath = path.join(paths.chaptersDir, filename);
    const fullText = await readMarkdownFile(markdownPath);
    const stats = await fs.stat(markdownPath);
    const now = new Date();
    const isRecent = (now - stats.mtime) < (48 * 60 * 60 * 1000); // 48 часов

    if (fullText === null) {
      warn(warnings, `[warn] Ошибка чтения файла: ${filename}`);
      continue;
    }

    const structure = extractChapterStructure(fullText);
    if (!structure.title) {
      warn(warnings, `[warn] В главе нет заголовка ##: ${filename}`);
    }

    // Ищем метаданные в индексе по названию главы
    const normalizedFileTitle = normalizeTitle(structure.title).toLowerCase();
    const item = indexMap.get(normalizedFileTitle) || {};

    if (!item.chapter_title) {
       warn(warnings, `[info] Глава "${structure.title}" (${filename}) не найдена в индексе. Будет использована без метаданных.`);
    }

    const resolvedTitle = structure.title || item.chapter_title || "Без названия";
    const resolvedSummary = structure.annotation || item.short_summary || "";
    const resolvedTags = structure.sceneTags.length > 0 ? structure.sceneTags : (item.scene_tags || []);
    const resolvedType = item.chapter_type || "сцена";

    chapters.push({
      id,
      chapter_number,
      chapter_title: resolvedTitle,
      short_summary: resolvedSummary,
      chapter_annotation: structure.annotation,
      chapter_type: resolvedType,
      scene_tags: resolvedTags,
      visibility: "public",
      previous_id: chapter_number > 1 ? chapterId(chapter_number - 1) : null,
      next_id: chapter_number < mdFiles.length ? chapterId(chapter_number + 1) : null,
      chapter_video_url: structure.videoUrl,
      full_text_markdown: structure.cleanedText,
      is_recent: isRecent,
    });
  }

  const payload = {
    chapters,
  };

  await fs.writeFile(paths.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { chaptersCount: chapters.length, warnings };
}

build().then(({ chaptersCount, warnings }) => {
  console.log(`[ok] chapters_full.json собран: ${chaptersCount} глав`);
  if (warnings.length === 0) {
    console.log("[ok] предупреждений нет");
  }
}).catch((error) => {
  console.error("[error] Сборка chapters_full.json не удалась");
  console.error(error);
  process.exitCode = 1;
});
