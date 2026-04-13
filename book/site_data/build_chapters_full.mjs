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
  const match = source.match(/^\s*\[annotation\]\s*\n([\s\S]*?)\n\[\/annotation\]\s*/);

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
  const chapters = [];

  for (let i = 0; i < indexChapters.length; i += 1) {
    const item = indexChapters[i];
    const id = chapterId(item.chapter_number);
    const markdownPath = path.join(paths.chaptersDir, `${String(item.chapter_number).padStart(2, "0")}.md`);
    const fullText = await readMarkdownFile(markdownPath);

    if (fullText === null) {
      warn(warnings, `[warn] Нет файла главы: ${path.relative(repoRoot, markdownPath)}`);
    }

    const structure = extractChapterStructure(fullText);
    if (!structure.title) {
      warn(warnings, `[warn] В главе нет заголовка ##: ${id}`);
    }

    const resolvedTitle = structure.title || item.chapter_title;
    const resolvedSummary = structure.annotation || item.short_summary || "";
    const resolvedTags = structure.sceneTags.length > 0 ? structure.sceneTags : item.scene_tags;

    chapters.push({
      id,
      chapter_number: item.chapter_number,
      chapter_title: resolvedTitle,
      short_summary: resolvedSummary,
      chapter_annotation: structure.annotation,
      chapter_type: item.chapter_type,
      scene_tags: resolvedTags,
      visibility: "public",
      previous_id: i > 0 ? chapterId(indexChapters[i - 1].chapter_number) : null,
      next_id: i < indexChapters.length - 1 ? chapterId(indexChapters[i + 1].chapter_number) : null,
      chapter_video_url: structure.videoUrl,
      full_text_markdown: structure.cleanedText,
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
