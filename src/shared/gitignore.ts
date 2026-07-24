import fs from "node:fs/promises";
import path from "node:path";

import { isDirectory, normalizeRelativePath, uniqueStrings } from "./utils.js";

const GLOB_PATTERN = /[*?[\]{}]/;

function stripInlineComment(value: string): string {
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "#") {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function shouldKeepGitignoreDirectoryPattern(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("!")) return false;
  if (GLOB_PATTERN.test(value)) return false;
  return true;
}

async function isLikelyDirectoryPattern(projectRoot: string, value: string, explicitDirectory: boolean): Promise<boolean> {
  if (explicitDirectory) return true;
  const absolutePath = path.resolve(projectRoot, value);
  if (await isDirectory(absolutePath)) return true;
  const basename = path.posix.basename(value);
  if (basename.startsWith(".")) return true;
  return !basename.includes(".");
}

async function readGitignoreExcludedDirs(projectRoot: string, gitignorePath: string): Promise<string[]> {
  try {
    const text = await fs.readFile(gitignorePath, "utf8");
    const rows = text.split(/\r?\n/);
    const directories: string[] = [];

    for (const row of rows) {
      const trimmed = stripInlineComment(row.trim());
      if (!trimmed) continue;
      if (!shouldKeepGitignoreDirectoryPattern(trimmed)) continue;

      const explicitDirectory = trimmed.endsWith("/");
      const normalized = normalizeRelativePath(trimmed.replace(/^!/, "").replace(/^\/+/, "").replace(/\/+$/, ""));
      if (!normalized) continue;
      if (!await isLikelyDirectoryPattern(projectRoot, normalized, explicitDirectory)) continue;
      directories.push(normalized);
    }

    return uniqueStrings(directories);
  } catch {
    return [];
  }
}

async function readGitignoreIgnorePatterns(gitignorePath: string): Promise<string[]> {
  try {
    const text = await fs.readFile(gitignorePath, "utf8");
    const patterns: string[] = [];

    for (const row of text.split(/\r?\n/)) {
      const trimmed = stripInlineComment(row.trim());
      if (!trimmed || trimmed.startsWith("!")) continue;
      const normalized = normalizeRelativePath(trimmed.replace(/^\/+/, "").replace(/\/+$/, ""));
      if (normalized) patterns.push(normalized);
    }

    return uniqueStrings(patterns);
  } catch {
    return [];
  }
}

export { readGitignoreExcludedDirs, readGitignoreIgnorePatterns };
