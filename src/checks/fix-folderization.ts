import fs from "node:fs/promises";
import path from "node:path";

import type {
  FixCodeDisciplineResult,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";
import type { ScannedSourceFile } from "../imports/types.js";
import type { NormalizedCodeDisciplineLogger } from "../shared/logging-types.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";
import { applyTextReplacements, collectModuleSpecifiers } from "../imports/module-specifiers.js";
import { isRelativeImportSpecifier } from "../imports/resolve.js";
import { FileConflictError, FixFailureError, RewriteFailureError } from "../shared/errors.js";
import { ensureDotExtension, pathExists, stripKnownExtension, toPosixPath } from "../shared/utils.js";
import { planFolderizeCompoundFiles } from "./rules/folderize-plan.js";

type PlannedMove = {
  fromAbsolutePath: string;
  fromRelativePath: string;
  toAbsolutePath: string;
  toRelativePath: string;
};

function createFolderizationViolation(
  filePath: string,
  suggestedPath: string,
  options: NormalizedCheckCodeDisciplineOptions,
  details: Record<string, unknown>,
): CodeDisciplineViolation {
  return {
    rule: "folderize-compound-files",
    severity: options.rules.folderizeCompoundFiles?.severity ?? "error",
    fix: options.rules.folderizeCompoundFiles?.fix ?? false,
    filePath,
    message: `file can be grouped under ${suggestedPath}`,
    suggestedPath,
    details,
  };
}

function buildMovePlan(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): { moves: PlannedMove[]; violations: CodeDisciplineViolation[] } {
  const candidates = planFolderizeCompoundFiles(sourceFiles, options);
  const moves = candidates.map((candidate) => ({
    fromAbsolutePath: candidate.absolutePath,
    fromRelativePath: candidate.relativeFromProjectRoot,
    toAbsolutePath: candidate.suggestedAbsolutePath,
    toRelativePath: candidate.suggestedPath,
  }));
  const violations = candidates.map((candidate) => createFolderizationViolation(
    candidate.relativeFromProjectRoot,
    candidate.suggestedPath,
    options,
    {
      mode: candidate.mode,
      prefix: candidate.prefix,
      remainder: candidate.remainder,
      separator: candidate.separator,
    },
  ));

  return { moves, violations };
}

function resolveRelativeFromInventory(
  specifier: string,
  sourceFilePath: string,
  sourceExtensions: string[],
  knownFiles: Set<string>,
): string | null {
  if (!isRelativeImportSpecifier(specifier)) return null;

  const basePath = path.resolve(path.dirname(sourceFilePath), specifier);
  const exactCandidates = [basePath];
  const fileCandidates = sourceExtensions.map((extension) => `${basePath}${ensureDotExtension(extension)}`);
  const indexCandidates = sourceExtensions.map((extension) => path.join(basePath, `index${ensureDotExtension(extension)}`));

  for (const candidate of [...exactCandidates, ...fileCandidates, ...indexCandidates]) {
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function formatRelativeSpecifier(
  originalSpecifier: string,
  fromAbsolutePath: string,
  toAbsolutePath: string,
  sourceExtensions: string[],
): string {
  const hadExplicitExtension = sourceExtensions.some((extension) => originalSpecifier.toLowerCase().endsWith(extension.toLowerCase()));
  let relativePath = toPosixPath(path.relative(path.dirname(fromAbsolutePath), toAbsolutePath));
  if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`;

  if (hadExplicitExtension) {
    return relativePath;
  }

  const withoutExtension = stripKnownExtension(relativePath, sourceExtensions);
  const targetBasename = path.basename(toAbsolutePath);
  const originalWithoutExtension = stripKnownExtension(originalSpecifier, sourceExtensions);
  const originalUsesIndex = /(^|\/)index$/.test(originalWithoutExtension);

  if (targetBasename.startsWith("index.") && !originalUsesIndex) {
    return withoutExtension.replace(/\/index$/, "") || ".";
  }

  return withoutExtension;
}

async function planImportRewritesForFolderizationMoves(
  sourceFiles: ScannedSourceFile[],
  moves: PlannedMove[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<{
  rewrittenByPath: Map<string, { text: string; count: number }>;
  rewrittenFiles: number;
  rewrittenImports: number;
}> {
  if (moves.length === 0) {
    return {
      rewrittenByPath: new Map(),
      rewrittenFiles: 0,
      rewrittenImports: 0,
    };
  }

  const movedPaths = new Map(moves.map((move) => [move.fromAbsolutePath, move.toAbsolutePath]));
  const knownFiles = new Set(sourceFiles.map((file) => file.absolutePath));
  const rewrittenByPath = new Map<string, { text: string; count: number }>();
  let rewrittenFiles = 0;
  let rewrittenImports = 0;

  for (const file of sourceFiles) {
    const originalText = await fs.readFile(file.absolutePath, "utf8");
    const futureFilePath = movedPaths.get(file.absolutePath) ?? file.absolutePath;
    const replacements = [];

    try {
      for (const occurrence of collectModuleSpecifiers(originalText, file.absolutePath)) {
        if (!isRelativeImportSpecifier(occurrence.specifier)) continue;

        const resolvedTarget = resolveRelativeFromInventory(
          occurrence.specifier,
          file.absolutePath,
          options.sourceExtensions,
          knownFiles,
        );
        if (!resolvedTarget) continue;

        const futureTargetPath = movedPaths.get(resolvedTarget) ?? resolvedTarget;
        const sourceMoved = futureFilePath !== file.absolutePath;
        const targetMoved = futureTargetPath !== resolvedTarget;

        if (!sourceMoved && !targetMoved) continue;

        replacements.push({
          start: occurrence.start,
          end: occurrence.end,
          value: formatRelativeSpecifier(occurrence.specifier, futureFilePath, futureTargetPath, options.sourceExtensions),
        });
      }
    } catch (error) {
      throw new RewriteFailureError(file.relativeFromProjectRoot, error);
    }

    const next = applyTextReplacements(originalText, replacements);
    if (next.count === 0) continue;

    rewrittenByPath.set(futureFilePath, next);
    rewrittenFiles += 1;
    rewrittenImports += next.count;
  }

  return { rewrittenByPath, rewrittenFiles, rewrittenImports };
}

async function validateMovePlan(moves: PlannedMove[]): Promise<void> {
  const seenTargets = new Set<string>();
  const movingFrom = new Set(moves.map((move) => move.fromAbsolutePath));

  for (const move of moves) {
    if (move.fromAbsolutePath === move.toAbsolutePath) continue;

    if (seenTargets.has(move.toAbsolutePath)) {
      throw new FileConflictError(move.toRelativePath, {
        reason: "duplicate-target",
      });
    }

    seenTargets.add(move.toAbsolutePath);

    if (movingFrom.has(move.toAbsolutePath)) continue;
    if (await pathExists(move.toAbsolutePath)) {
      throw new FileConflictError(move.toRelativePath, {
        reason: "existing-target",
      });
    }
  }
}

async function moveFiles(moves: PlannedMove[]): Promise<number> {
  let movedFiles = 0;

  for (const move of moves) {
    if (move.fromAbsolutePath === move.toAbsolutePath) continue;
    await fs.mkdir(path.dirname(move.toAbsolutePath), { recursive: true });
    await fs.rename(move.fromAbsolutePath, move.toAbsolutePath);
    movedFiles += 1;
  }

  return movedFiles;
}

async function removeEmptyDirectories(directories: string[]): Promise<void> {
  const sorted = [...new Set(directories)].sort((left, right) => right.length - left.length);

  for (const directoryPath of sorted) {
    try {
      await fs.rmdir(directoryPath);
    } catch {
      // The directory still contains files, which is expected in many cases.
    }
  }
}

async function fixFolderization(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
  logger: NormalizedCodeDisciplineLogger,
): Promise<FixCodeDisciplineResult> {
  const { moves, violations } = buildMovePlan(sourceFiles, options);
  const warnings = violations.filter((violation) => violation.severity === "warning").length;
  const errors = violations.length - warnings;

  if (!options.rules.folderizeCompoundFiles || moves.length === 0) {
    logger.info("fix-folderization-unchanged", "no folderization moves required", {
      moves: 0,
    });
    return {
      ok: true,
      errors: 0,
      moved_files: 0,
      rewritten_files: 0,
      rewritten_imports: 0,
      ruleResults: {},
      warnings,
      violations: [],
    };
  }

  if (!options.rules.folderizeCompoundFiles.fix) {
    logger.warn("fix-folderization-disabled", "folderization fix is disabled", {
      candidates: moves.length,
      discipline: {
        errors,
        warnings,
      },
    });
    return {
      ok: errors === 0,
      errors,
      moved_files: 0,
      rewritten_files: 0,
      rewritten_imports: 0,
      ruleResults: {},
      warnings,
      violations,
    };
  }

  await validateMovePlan(moves);

  const sourceDirectories = moves.map((move) => path.dirname(move.fromAbsolutePath));

  try {
    const rewriteState = await planImportRewritesForFolderizationMoves(sourceFiles, moves, options);
    const movedFiles = await moveFiles(moves);

    for (const [filePath, next] of rewriteState.rewrittenByPath) {
      await fs.writeFile(filePath, next.text);
    }

    await removeEmptyDirectories(sourceDirectories);

    logger.success("fix-folderization-finished", `folderized files=${movedFiles} rewrittenImports=${rewriteState.rewrittenImports}`, {
      movedFiles,
      rewrittenFiles: rewriteState.rewrittenFiles,
      rewrittenImports: rewriteState.rewrittenImports,
    });

    return {
      ok: true,
      errors: 0,
      moved_files: movedFiles,
      rewritten_files: rewriteState.rewrittenFiles,
      rewritten_imports: rewriteState.rewrittenImports,
      ruleResults: {},
      warnings: 0,
      violations: [],
    };
  } catch (error) {
    if (error instanceof FileConflictError || error instanceof RewriteFailureError) {
      throw error;
    }

    throw new FixFailureError("Folderization fix failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export { buildMovePlan, createFolderizationViolation, fixFolderization };
