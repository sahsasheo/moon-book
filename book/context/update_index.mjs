import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const paths = {
  index: path.join(repoRoot, 'context', 'chapter_index.md'),
  chaptersDir: path.join(repoRoot, 'chapters')
};

// Функция для нормализации заголовка
function normalizeTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// Извлекаем заголовок из markdown-файла (ищем первую строку `## Заголовок`)
function extractTitleFromMarkdown(text) {
  const match = text.match(/^##\s+(.+)$/m);
  return match ? normalizeTitle(match[1]) : "Без названия";
}

// Извлекаем поле из блока текста
function extractField(block, label) {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "mi");
  const match = block.match(pattern);
  return match ? match[1].trim() : "";
}

// Парсим старый индекс, чтобы сохранить метаданные
function parseOldIndex(indexText) {
  const headingRegex = /^##\s+(?:[\d.-]+\s+)?(.+)$/gm;
  const matches = [...indexText.matchAll(headingRegex)];
  const chapters = new Map();

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const blockStart = current.index ?? 0;
    const blockEnd = next ? next.index ?? indexText.length : indexText.length;
    const block = indexText.slice(blockStart, blockEnd).trim();
    
    const title = normalizeTitle(current[1]).toLowerCase();
    
    const short_summary = extractField(block, "- Краткое содержание") || extractField(block, "Краткое содержание");
    const chapter_type = extractField(block, "- тип") || extractField(block, "тип");
    const scene_tags = extractField(block, "- сценические теги") || extractField(block, "сценические теги");
    const base_tags = extractField(block, "- теги базы") || extractField(block, "теги базы");
    const func = extractField(block, "- функция") || extractField(block, "функция");
    const status = extractField(block, "- статус") || extractField(block, "статус");

    // Если аннотация идет перед списком (после заголовка)
    let annotation = "";
    const lines = block.split('\n');
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].startsWith('-') || lines[j].trim() === '') continue;
      if (!lines[j].includes('Краткое содержание:')) {
        annotation += lines[j] + '\n';
      }
    }
    
    const summaryMatch = block.match(/Краткое содержание:\s*(.*?)(?=\n-|\n\n|$)/s);
    if (summaryMatch) {
       annotation = summaryMatch[1].trim();
    }

    chapters.set(title, {
      annotation,
      type: chapter_type,
      scene_tags,
      base_tags,
      func,
      status
    });
  }
  return chapters;
}

async function updateIndex() {
  console.log("Читаем старый индекс...");
  let oldIndexText = "";
  try {
    oldIndexText = await fs.readFile(paths.index, 'utf8');
  } catch (e) {
    console.warn("Не удалось прочитать старый индекс, создаем с нуля.");
  }

  const oldData = parseOldIndex(oldIndexText);
  
  console.log("Читаем папку chapters...");
  const files = await fs.readdir(paths.chaptersDir);
  const mdFiles = files.filter(f => f.endsWith('.md')).sort(); // Сортируем по алфавиту

  let newIndexMd = `# Указатель глав «Под Огромной Луной»\n\n`;

  for (let i = 0; i < mdFiles.length; i++) {
    const filename = mdFiles[i];
    const filePath = path.join(paths.chaptersDir, filename);
    const content = await fs.readFile(filePath, 'utf8');
    const stats = await fs.stat(filePath);
    const now = new Date();
    const isRecent = (now - stats.mtime) < (48 * 60 * 60 * 1000); // 48 часов

    const title = extractTitleFromMarkdown(content);
    const normalizedTitle = title.toLowerCase();

    const meta = oldData.get(normalizedTitle) || {
      annotation: "Нет описания.",
      type: "сцена",
      scene_tags: "",
      base_tags: "#под_Огромной_Луной",
      func: "",
      status: "в работе"
    };

    const chapterNum = String(i + 1).padStart(2, '0');
    const recentTag = isRecent ? " 🆕" : "";
    
    newIndexMd += `## ${chapterNum}. ${title}${recentTag}\n\n`;
    newIndexMd += `Краткое содержание: ${meta.annotation}\n\n`;
    newIndexMd += `- тип: ${meta.type}\n`;
    if (meta.scene_tags) newIndexMd += `- сценические теги: ${meta.scene_tags}\n`;
    if (meta.base_tags) newIndexMd += `- теги базы: ${meta.base_tags}\n`;
    if (meta.func) newIndexMd += `- функция: ${meta.func}\n`;
    if (meta.status) newIndexMd += `- статус: ${meta.status}\n`;
    newIndexMd += `\n`;
  }

  await fs.writeFile(paths.index, newIndexMd, 'utf8');
  console.log(`Индекс обновлен! Всего глав: ${mdFiles.length}`);
}

updateIndex().catch(console.error);
