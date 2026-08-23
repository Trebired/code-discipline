import fs from "node:fs/promises";
import path from "node:path";

import { pathExists } from "#ntve5i5a0mol";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";

type IncludeCoverageArgs = {
  aliasedPaths: readonly string[];
  projectRoot: string;
  tsconfigPath: string;
};

function stripJsonComments(source: string): string {
  return source
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .replace(/(^|[^:"'\\])\/\/.*$/gmu, "$1");
}

function parseTsconfigJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return JSON.parse(stripJsonComments(source));
  }
}

async function readTsconfigInclude(tsconfigPath: string): Promise<string[]|null> {
  if (!await pathExists(tsconfigPath)) return null;
  try {
    const parsed = parseTsconfigJson(await fs.readFile(tsconfigPath, "utf8"));
    const include = (parsed as { include?: unknown }).include;
    if (!Array.isArray(include)) return null;
    return include.map((entry) => String(entry || "").trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/").replace(/^\.\/+/, "").replace(/\/+$/g, "");
}

function scanRootOf(relativePath: string): string {
  const normalized = toPosix(relativePath);
  return normalized.split("/")[0] || "";
}

function includeCoversRoot(include: readonly string[], root: string): boolean {
  return include.some((entry) => {
      const normalized = toPosix(entry);
      if (!normalized) return false;
      if (normalized === "**" || normalized === "**/*") return true;
      const base = normalized.split("/")[0] || "";
      if (base === "**") return true;
      return base === root;
  });
}

async function collectIncludeCoverageViolations(
  args: IncludeCoverageArgs,
): Promise<CodeDisciplineViolation[]> {
  const include = await readTsconfigInclude(args.tsconfigPath);
  if (!include || !include.length) return [];

  const roots = new Set<string>();
  for (const aliased of args.aliasedPaths) {
    const relative = toPosix(path.relative(args.projectRoot, aliased));
    if (!relative || relative.startsWith("..")) continue;
    const root = scanRootOf(relative);
    if (root && !includeCoversRoot(include, root)) roots.add(root);
  }
  if (!roots.size) return [];

  const tsconfigRel = toPosix(path.relative(args.projectRoot, args.tsconfigPath)) || "tsconfig.json";
  return Array.from(roots).sort().map((root) => ({
        rule: "imports"as const,
        fix: false,
        filePath: tsconfigRel,
        message: `${root} is aliased but not covered by ${tsconfigRel}#include`,
        details: {
          include: [...include],
          scanRoot: root,
          suggestion: `add "${root}" to ${tsconfigRel}#include`,
        },
        severity: "fail"as const,
  }));
}

export { collectIncludeCoverageViolations, readTsconfigInclude };
