import fs from 'node:fs/promises';
import path from 'node:path';

const srcDir = '/Users/sashaivanov/Obsidian/AI-Hub/03_Huge_Moon/moon-book';
const destDir = '/Users/sashaivanov/Desktop/bota2/moon-book/book';

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  console.log("Синхронизируем chapters...");
  // Clear dest chapters first? No, just overwrite for now.
  await copyDir(path.join(srcDir, 'chapters'), path.join(destDir, 'chapters'));
  
  console.log("Синхронизируем context...");
  await copyDir(path.join(srcDir, 'context'), path.join(destDir, 'context'));
  
  console.log("Готово!");
}

main().catch(console.error);
