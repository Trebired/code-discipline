import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import type { NormalizedSyncImportsOptions, ScannedSourceFile } from "../../../../../imports/types.js";
import type { NormalizedCodeDisciplineLogger } from "../../../../../shared/logging-types.js";
import type { CodeDisciplineViolation } from "../../../../../shared/discipline-types.js";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "../../../../types.js";
import { FixFailureError, RewriteFailureError } from "../../../../../shared/errors.js";
import { applyTextReplacements, collectModuleSpecifiers, parseSource } from "../../../../../imports/module-specifiers.js";
import { formatRelativeSpecifier } from "../../../../../imports/format.js";
import { isRelativeImportSpecifier, resolveRelativeImport } from "../../../../../imports/resolve.js";
import { planTsconfigAliases } from "../../../../../imports/aliases.js";
import { removeEmptyDirectories } from "../../../../../shared/directories.js";
import { supportsSyncImports } from "../../../../../shared/languages.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../../../../progress.js";
import { collectMinFileLineViolations } from "../lines.js";

type RedirectPlan = {
  file: ScannedSourceFile;
  targetAbsolutePath: string | null;
  targetSpecifier: string;
};

function resolveTypeScriptRedirectSpecifier(text: string, filePath: string): string | null {
  const sourceFile = parseSource(text, filePath);
  if (sourceFile.statements.length !== 1) return null;

  const [statement] = sourceFile.statements;
  if (!statement || !ts.isExportDeclaration(statement)) return null;
  if (!statement.moduleSpecifier || !ts.isStringLiteralLike(statement.moduleSpecifier)) return null;
  return statement.moduleSpecifier.text;
}

function resolveScssRedirectSpecifier(text: string, filePath: string): string | null {
  const [occurrence, extra] = collectModuleSpecifiers(text, filePath);
  if (!occurrence || extra) return null;
  if (occurrence.removalStart === undefined || occurrence.removalEnd === undefined) return null;
  if (text.slice(0, occurrence.removalStart).trim() || text.slice(occurrence.removalEnd).trim()) return null;

  const directive = text.slice(occurrence.removalStart, occurrence.removalEnd).trim();
  return directive.startsWith("@forward") ? occurrence.specifier : null;
}

function resolveRedirectSpecifier(text: string, file: ScannedSourceFile): string | null {
  if (file.extension === ".scss") return resolveScssRedirectSpecifier(text, file.absolutePath);
  return resolveTypeScriptRedirectSpecifier(text, file.absolutePath);
}

async function buildAliasTargetMap(
  sourceFiles: ScannedSourceFile[],
  syncOptions: NormalizedSyncImportsOptions | null,
  logger: NormalizedCodeDisciplineLogger,
): Promise<Map<string, string>> {
  if (!syncOptions) return new Map();
  const plan = await planTsconfigAliases(syncOptions, sourceFiles.filter((file) => supportsSyncImports(file.extension)), logger);
  return new Map(plan.aliasRecords.map((record) => [record.id, record.absolutePath]));
}

async function resolveSourceTarget(
  specifier: string,
  file: ScannedSourceFile,
  options: NormalizedCheckCodeDisciplineOptions,
  aliasTargets: Map<string, string>,
): Promise<string | null> {
  return isRelativeImportSpecifier(specifier)
    ? resolveRelativeImport(specifier, file.absolutePath, options)
    : aliasTargets.get(specifier) ?? null;
}

async function collectRedirectPlans(
  sourceFiles: ScannedSourceFile[],
  violations: CodeDisciplineViolation[],
  options: NormalizedCheckCodeDisciplineOptions,
  aliasTargets: Map<string, string>,
): Promise<Map<string, RedirectPlan>> {
  const violatingPaths = new Set(violations.map((violation) => violation.filePath));
  const redirects = new Map<string, RedirectPlan>();

  for (const file of sourceFiles) {
    if (!violatingPaths.has(file.relativeFromProjectRoot) || !supportsSyncImports(file.extension)) continue;
    const text = await fs.readFile(file.absolutePath, "utf8");
    const targetSpecifier = resolveRedirectSpecifier(text, file);
    if (!targetSpecifier) continue;

    const targetAbsolutePath = await resolveSourceTarget(targetSpecifier, file, options, aliasTargets);
    if (isRelativeImportSpecifier(targetSpecifier) && !targetAbsolutePath) continue;
    redirects.set(file.absolutePath, { file, targetAbsolutePath, targetSpecifier });
  }

  return redirects;
}

function resolveFinalRedirect(redirect: RedirectPlan, redirects: Map<string, RedirectPlan>): RedirectPlan {
  const visited = new Set<string>();
  let current = redirect;

  while (current.targetAbsolutePath && redirects.has(current.targetAbsolutePath) && !visited.has(current.targetAbsolutePath)) {
    visited.add(current.file.absolutePath);
    current = redirects.get(current.targetAbsolutePath)!;
  }

  return current;
}

function replacementForRedirect(
  originalSpecifier: string,
  importer: ScannedSourceFile,
  redirect: RedirectPlan,
  options: NormalizedCheckCodeDisciplineOptions,
): string | null {
  if (!isRelativeImportSpecifier(redirect.targetSpecifier)) return redirect.targetSpecifier;
  if (!redirect.targetAbsolutePath) return null;
  return formatRelativeSpecifier(originalSpecifier, importer.absolutePath, redirect.targetAbsolutePath, options.sourceExtensions);
}

async function planRedirectImportRewrites(args: {
  aliasTargets: Map<string, string>;
  options: NormalizedCheckCodeDisciplineOptions;
  redirects: Map<string, RedirectPlan>;
  sourceFiles: ScannedSourceFile[];
}): Promise<{ rewrittenByPath: Map<string, { text: string; count: number }>; rewrittenFiles: number; rewrittenImports: number }> {
  const rewrittenByPath = new Map<string, { text: string; count: number }>();
  let rewrittenFiles = 0;
  let rewrittenImports = 0;

  for (const file of args.sourceFiles) {
    if (args.redirects.has(file.absolutePath) || !supportsSyncImports(file.extension)) continue;
    const text = await fs.readFile(file.absolutePath, "utf8");
    const replacements = [];

    for (const occurrence of collectModuleSpecifiers(text, file.absolutePath)) {
      const target = await resolveSourceTarget(occurrence.specifier, file, args.options, args.aliasTargets);
      const redirect = target ? args.redirects.get(target) : null;
      if (!redirect) continue;

      const replacement = replacementForRedirect(
        occurrence.specifier,
        file,
        resolveFinalRedirect(redirect, args.redirects),
        args.options,
      );
      if (!replacement || replacement === occurrence.specifier) continue;
      replacements.push({ start: occurrence.start, end: occurrence.end, value: replacement });
    }

    const next = applyTextReplacements(text, replacements);
    if (next.count === 0) continue;
    rewrittenByPath.set(file.absolutePath, next);
    rewrittenFiles += 1;
    rewrittenImports += next.count;
  }

  return { rewrittenByPath, rewrittenFiles, rewrittenImports };
}

async function applyMinFileLineFixWrites(
  redirects: Map<string, RedirectPlan>,
  rewrites: Map<string, { text: string; count: number }>,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<number> {
  const filesToDelete = [...redirects.values()];
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "min-file-lines",
    stage: "fix",
    totalItems: filesToDelete.length,
  });

  for (const [filePath, rewrite] of rewrites) {
    await fs.writeFile(filePath, rewrite.text);
  }

  for (let index = 0; index < filesToDelete.length; index += 1) {
    await fs.unlink(filesToDelete[index]!.file.absolutePath);
    emitRuleChunk(progress, index + 1, 0, { deletedFiles: index + 1 });
  }

  emitRuleCompleted(progress, 0, { deletedFiles: filesToDelete.length });
  return filesToDelete.length;
}

async function fixMinFileLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
  logger: NormalizedCodeDisciplineLogger,
  syncOptions: NormalizedSyncImportsOptions | null,
): Promise<FixCodeDisciplineRuleResult> {
  const violations = await collectMinFileLineViolations(sourceFiles, options);
  const aliasTargets = await buildAliasTargetMap(sourceFiles, syncOptions, logger);
  const redirects = await collectRedirectPlans(sourceFiles, violations, options, aliasTargets);
  const fixedPaths = new Set([...redirects.values()].map((redirect) => redirect.file.relativeFromProjectRoot));
  const remainingViolations = violations.filter((violation) => !fixedPaths.has(violation.filePath));

  if (redirects.size === 0) {
    return {
      ok: remainingViolations.length === 0,
      violationCount: remainingViolations.length,
      violations: remainingViolations,
      deleted_files: 0,
      rewritten_files: 0,
      rewritten_imports: 0,
    };
  }

  try {
    const rewriteState = await planRedirectImportRewrites({ aliasTargets, options, redirects, sourceFiles });
    const deletedFiles = await applyMinFileLineFixWrites(redirects, rewriteState.rewrittenByPath, options);
    await removeEmptyDirectories([...redirects.values()].map((redirect) => path.dirname(redirect.file.absolutePath)));

    return {
      ok: remainingViolations.length === 0,
      violationCount: remainingViolations.length,
      violations: remainingViolations,
      deleted_files: deletedFiles,
      rewritten_files: rewriteState.rewrittenFiles,
      rewritten_imports: rewriteState.rewrittenImports,
    };
  } catch (error) {
    if (error instanceof RewriteFailureError) throw error;
    throw new FixFailureError("min-file-lines fix failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export { fixMinFileLinesRule };
