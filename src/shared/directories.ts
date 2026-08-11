import fs from "node:fs/promises";

async function removeEmptyDirectories(directories: string[]): Promise<void> {
  const sorted = [...new Set(directories)].sort((left, right) => right.length - left.length);

  for (const directoryPath of sorted) {
    try {
      await fs.rmdir(directoryPath);
    } catch {
    }
  }
}

export { removeEmptyDirectories };
