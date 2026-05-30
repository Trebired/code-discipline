import fs from "node:fs/promises";
import path from "node:path";

import type { ScannedSourceFile, SourceScanOptions } from "./types.js";
import { normalizeRelativePath, toPosixPath } from "../shared/utils.js";

function shouldExcludeDirectory(relativeDir: string, directoryName: string, excludeDirs: string[]): boolean {
  const normalizedRelativeDir = normalizeRelativePath(relativeDir);
  return excludeDirs.some((entry) => {
    const normalizedEntry = normalizeRelativePath(entry);
    return directoryName === normalizedEntry
      || normalizedRelativeDir === normalizedEntry
      || normalizedRelativeDir.startsWith(`${normalizedEntry}/`);
  });
}

async function walkDirectory(
  directoryPath: string,
  relativeDir: string,
  options: SourceScanOptions,
  rows: ScannedSourceFile[],
): Promise<void> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    const absolutePath = path.join(directoryPath, entry.name);
    const relativePath = normalizeRelativePath(path.join(relativeDir, entry.name));

    if (entry.isDirectory()) {
      if (shouldExcludeDirectory(relativePath, entry.name, options.excludeDirs)) continue;
      await walkDirectory(absolutePath, relativePath, options, rows);
      continue;
    }

    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!options.sourceExtensions.includes(extension)) continue;

    rows.push({
      absolutePath,
      relativeFromProjectRoot: toPosixPath(path.relative(options.projectRoot, absolutePath)),
      relativeFromSourceRoot: toPosixPath(relativePath),
      extension,
    });
  }
}

async function scanSourceFiles(options: SourceScanOptions): Promise<ScannedSourceFile[]> {
  const rows: ScannedSourceFile[] = [];
  await walkDirectory(options.sourceRoot, "", options, rows);
  return rows.sort((left, right) => left.relativeFromProjectRoot.localeCompare(right.relativeFromProjectRoot));
}

export { scanSourceFiles };
