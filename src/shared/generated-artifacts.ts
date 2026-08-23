import fs from "node:fs/promises";
import path from "node:path";

import { pathExists } from "./utils.js";

const GENERATED_ARTIFACTS_DIR = ".trebired/code-discipline/generated";
const GENERATED_REPORTS_DIR = ".trebired/code-discipline/generated/reports";
const GENERATED_ARTIFACTS_GITIGNORE_ENTRY = `${GENERATED_REPORTS_DIR}/`;

function normalizeGitignoreLine(line: string): string {
  return line.trim().replace(/^\/+/, "").replace(/\/+$/g, "");
}

function isBroadGeneratedArtifactsEntry(line: string): boolean {
  return normalizeGitignoreLine(line) === GENERATED_ARTIFACTS_DIR;
}

function isReportsGitignoreEntry(line: string): boolean {
  return normalizeGitignoreLine(line) === GENERATED_REPORTS_DIR;
}

async function ensureGeneratedArtifactsGitignore(projectRoot: string): Promise<{
  changed: boolean;
  narrowed: boolean;
  path: string;
}> {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const existing = await pathExists(gitignorePath)
  ? await fs.readFile(gitignorePath, "utf8")
  : "";
  const lines = existing.split(/\r?\n/);

  const narrowed = lines.some(isBroadGeneratedArtifactsEntry);
  if (narrowed) {
    const next = lines
    .map((line) => (isBroadGeneratedArtifactsEntry(line)
        ? GENERATED_ARTIFACTS_GITIGNORE_ENTRY
        : line))
    .join("\n");
    await fs.writeFile(gitignorePath, next, "utf8");
    return { changed: true, narrowed: true, path: gitignorePath };
  }

  if (lines.some(isReportsGitignoreEntry)) {
    return { changed: false, narrowed: false, path: gitignorePath };
  }

  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const next = `${existing}${separator}${GENERATED_ARTIFACTS_GITIGNORE_ENTRY}\n`;
  await fs.writeFile(gitignorePath, next, "utf8");
  return { changed: true, narrowed: false, path: gitignorePath };
}

function resolveGeneratedReportsDir(projectRoot: string): string {
  return path.join(projectRoot, GENERATED_REPORTS_DIR);
}

export {
  GENERATED_ARTIFACTS_DIR,
  GENERATED_ARTIFACTS_GITIGNORE_ENTRY,
  GENERATED_REPORTS_DIR,
  ensureGeneratedArtifactsGitignore,
  resolveGeneratedReportsDir,
};
