import fs from "node:fs/promises";
import path from "node:path";

import type { NormalizedSyncImportsOptions } from "./types.js";
import { isInsideDirectory } from "../shared/utils.js";

function isRelativeImportSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

async function resolveFileCandidate(candidatePath: string, sourceExtensions: string[]): Promise<string | null> {
  try {
    const exactStat = await fs.stat(candidatePath);
    if (exactStat.isFile()) return candidatePath;
  } catch {}

  for (const extension of sourceExtensions) {
    const filePath = `${candidatePath}${extension}`;

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

async function resolveProjectPathTarget(targetPath: string, sourceExtensions: string[]): Promise<string | null> {
  return resolveFileCandidate(targetPath, sourceExtensions);
}

async function resolveRelativeImport(
  specifier: string,
  sourceFile: string,
  options: NormalizedSyncImportsOptions,
): Promise<string | null> {
  if (!isRelativeImportSpecifier(specifier)) return null;

  const basePath = path.resolve(path.dirname(sourceFile), specifier);
  const resolved = await resolveFileCandidate(basePath, options.sourceExtensions);

  if (!resolved) return null;
  if (!isInsideDirectory(resolved, options.sourceRoot)) return null;

  return resolved;
}

export { isRelativeImportSpecifier, resolveFileCandidate, resolveProjectPathTarget, resolveRelativeImport };
