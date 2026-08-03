import fs from "node:fs/promises";
import path from "node:path";

import { pathExists } from "./utils.js";

const GENERATED_ARTIFACTS_DIR = ".trebired/code-discipline/generated";
const GENERATED_ARTIFACTS_GITIGNORE_ENTRY = ".trebired/code-discipline/generated/";
const GENERATED_REPORTS_DIR = ".trebired/code-discipline/generated/reports";

function isGeneratedArtifactsGitignoreEntry(line: string): boolean {
  const normalized = line.trim().replace(/^\/+/, "").replace(/\/+$/g, "");
  return normalized === GENERATED_ARTIFACTS_DIR;
}

async function ensureGeneratedArtifactsGitignore(projectRoot: string): Promise<{ changed: boolean; path: string }> {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const existing = await pathExists(gitignorePath)
    ? await fs.readFile(gitignorePath, "utf8")
    : "";
  const lines = existing.split(/\r?\n/);

  if (lines.some(isGeneratedArtifactsGitignoreEntry)) {
    return { changed: false, path: gitignorePath };
  }

  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const next = `${existing}${separator}${GENERATED_ARTIFACTS_GITIGNORE_ENTRY}\n`;
  await fs.writeFile(gitignorePath, next, "utf8");
  return { changed: true, path: gitignorePath };
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
