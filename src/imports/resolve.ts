import fs from "node:fs/promises";
import path from "node:path";

import type { NormalizedSyncImportsOptions } from "./types.js";
import { isInsideDirectory } from "../shared/utils.js";
import { isScssExtension } from "../shared/languages.js";

type ResolveRelativeImportOptions = Pick<NormalizedSyncImportsOptions, "sourceExtensions" | "sourceRoot">;

const RUNTIME_SPECIFIER_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);

function isRelativeImportSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function pushUniqueCandidate(candidates: string[], candidatePath: string) {
  if (!candidates.includes(candidatePath)) {
    candidates.push(candidatePath);
  }
}

function buildFileCandidates(candidatePath: string, sourceExtensions: string[]): string[] {
  const candidates: string[] = [];
  pushUniqueCandidate(candidates, candidatePath);

  const specifierExtension = path.extname(candidatePath).toLowerCase();
  if (RUNTIME_SPECIFIER_EXTENSIONS.has(specifierExtension)) {
    const sourceStem = candidatePath.slice(0, -specifierExtension.length);
    for (const extension of sourceExtensions) {
      pushUniqueCandidate(candidates, `${sourceStem}${extension}`);
    }
  }

  for (const extension of sourceExtensions) {
    pushUniqueCandidate(candidates, `${candidatePath}${extension}`);
  }

  return candidates;
}

async function resolveFileCandidate(candidatePath: string, sourceExtensions: string[]): Promise<string | null> {
  for (const filePath of buildFileCandidates(candidatePath, sourceExtensions)) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) return filePath;
    } catch {}
  }

  for (const extension of sourceExtensions) {
    const indexPath = path.join(candidatePath, `index${extension}`);

    try {
      const stat = await fs.stat(indexPath);
      if (stat.isFile()) return indexPath;
    } catch {}
  }

  return null;
}

function buildSassFileCandidates(candidatePath: string): string[] {
  const candidates: string[] = [];
  const extension = path.extname(candidatePath).toLowerCase();
  const dirname = path.dirname(candidatePath);
  const basename = path.basename(candidatePath);
  const partialPath = path.join(dirname, `_${basename}`);

  if (extension === ".scss") {
    pushUniqueCandidate(candidates, candidatePath);
    pushUniqueCandidate(candidates, path.join(dirname, `_${basename}`));
    return candidates;
  }

  pushUniqueCandidate(candidates, `${candidatePath}.scss`);
  pushUniqueCandidate(candidates, `${partialPath}.scss`);
  pushUniqueCandidate(candidates, path.join(candidatePath, "index.scss"));
  pushUniqueCandidate(candidates, path.join(candidatePath, "_index.scss"));
  return candidates;
}

async function resolveSassFileCandidate(candidatePath: string): Promise<string | null> {
  for (const filePath of buildSassFileCandidates(candidatePath)) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) return filePath;
    } catch {}
  }

  return null;
}

async function resolveProjectPathTarget(targetPath: string, sourceExtensions: string[]): Promise<string | null> {
  return resolveFileCandidate(targetPath, sourceExtensions);
}

async function resolveRelativeImport(
  specifier: string,
  sourceFile: string,
  options: ResolveRelativeImportOptions,
): Promise<string | null> {
  if (!isRelativeImportSpecifier(specifier)) return null;

  const basePath = path.resolve(path.dirname(sourceFile), specifier);
  const resolved = isScssExtension(sourceFile)
    ? await resolveSassFileCandidate(basePath)
    : await resolveFileCandidate(basePath, options.sourceExtensions);

  if (!resolved) return null;
  if (!isInsideDirectory(resolved, options.sourceRoot)) return null;

  return resolved;
}

export {
  buildFileCandidates,
  buildSassFileCandidates,
  isRelativeImportSpecifier,
  resolveFileCandidate,
  resolveProjectPathTarget,
  resolveRelativeImport,
};
