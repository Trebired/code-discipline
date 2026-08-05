import fs from "node:fs/promises";
import path from "node:path";

import type {
  FixCodeDisciplineResult,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { ruleLogGroup } from "#foa3t3ao5irq";
import type { NormalizedCodeDisciplineLogger } from "#uljkt8i26p4t";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { removeEmptyDirectories } from "#2gohqj1pb29e";
import { formatRelativeSpecifier } from "#r4k0t5wqgwq6";
import { applyTextReplacements, collectModuleSpecifiers } from "#27pccnhol1ci";
import { isRelativeImportSpecifier } from "#ay5rr8vjr5fh";
import { supportsImports } from "#87jyjzn68rrk";
import { FileConflictError, FixFailureError, RewriteFailureError } from "#4f8hale01wb4";
import { ensureDotExtension, pathExists } from "#ntve5i5a0mol";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "./progress.js";
import { planSourceFileStructure } from "./rules/source-file-structure/plan.js";

type PlannedMove = {
  fromAbsolutePath: string;
  fromRelativePath: string;
  toAbsolutePath: string;
  toRelativePath: string;
};
function createSourceFileStructureViolation(
  filePath: string,
  suggestedPath: string,
  options: NormalizedCheckCodeDisciplineOptions,
  details: Record<string, unknown>,
): CodeDisciplineViolation {
  return {
    rule: "source-file-structure",
    fix: true,
    filePath,
    message: `file path should be normalized to ${suggestedPath}`,
    suggestedPath,
    details,
  };
}

function buildMovePlan(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): { moves: PlannedMove[]; violations: CodeDisciplineViolation[] } {
  const candidates = planSourceFileStructure(sourceFiles, options);
  const moves = candidates.map((candidate) => ({
    fromAbsolutePath: candidate.absolutePath,
    fromRelativePath: candidate.relativeFromProjectRoot,
    toAbsolutePath: candidate.suggestedAbsolutePath,
    toRelativePath: candidate.suggestedPath,
  }));
  const violations = candidates.map((candidate) => createSourceFileStructureViolation(
    candidate.relativeFromProjectRoot,
    candidate.suggestedPath,
    options,
    {
      mode: candidate.mode,
      prefix: candidate.prefix,
      remainder: candidate.remainder,
      ...(candidate.roleSuffix ? { roleSuffix: candidate.roleSuffix } : {}),
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

async function planImportRewritesForSourceFileStructureMoves(
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
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "source-file-structure",
    stage: "rewrite-plan",
    totalItems: sourceFiles.length,
  });
  let rewrittenFiles = 0;
  let rewrittenImports = 0;

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!supportsImports(file.extension)) {
      emitRuleChunk(progress, index + 1, 0, { rewrittenFiles, rewrittenImports });
      continue;
    }
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
    if (next.count === 0) {
      emitRuleChunk(progress, index + 1, 0, { rewrittenFiles, rewrittenImports });
      continue;
    }

    rewrittenByPath.set(futureFilePath, next);
    rewrittenFiles += 1;
    rewrittenImports += next.count;
    emitRuleChunk(progress, index + 1, 0, { rewrittenFiles, rewrittenImports });
  }

  emitRuleCompleted(progress, 0, { rewrittenFiles, rewrittenImports });
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

async function moveFiles(moves: PlannedMove[], options: NormalizedCheckCodeDisciplineOptions): Promise<number> {
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "source-file-structure",
    stage: "move",
    totalItems: moves.length,
  });
  let movedFiles = 0;

  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index]!;
    if (move.fromAbsolutePath === move.toAbsolutePath) {
      emitRuleChunk(progress, index + 1, 0, { movedFiles });
      continue;
    }
    await fs.mkdir(path.dirname(move.toAbsolutePath), { recursive: true });
    await fs.rename(move.fromAbsolutePath, move.toAbsolutePath);
    movedFiles += 1;
    emitRuleChunk(progress, index + 1, 0, { movedFiles });
  }

  emitRuleCompleted(progress, 0, { movedFiles });
  return movedFiles;
}

async function writeSourceFileStructureRewrites(
  rewrites: Map<string, { text: string; count: number }>,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<void> {
  const entries = [...rewrites.entries()];
  const totalImports = entries.reduce((sum, [, rewrite]) => sum + rewrite.count, 0);
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "source-file-structure",
    stage: "write",
    totalItems: entries.length,
  });

  for (let index = 0; index < entries.length; index += 1) {
    const [filePath, next] = entries[index]!;
    await fs.writeFile(filePath, next.text);
    emitRuleChunk(progress, index + 1, 0, {
      rewrittenFiles: index + 1,
      rewrittenImports: totalImports,
    });
  }

  emitRuleCompleted(progress, 0, {
    rewrittenFiles: entries.length,
    rewrittenImports: totalImports,
  });
}

async function fixSourceFileStructure(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
  logger: NormalizedCodeDisciplineLogger,
): Promise<FixCodeDisciplineResult> {
  const { moves, violations } = buildMovePlan(sourceFiles, options);

  if (!options.rules.sourceFileStructure || moves.length === 0) {
    logger.info("fix-source-file-structure-unchanged", "no source file structure moves required", {
      moves: 0,
    }, { group: ruleLogGroup("source-file-structure") });
    return {
      ok: true,
      violationCount: 0,
      deleted_files: 0,
      moved_files: 0,
      rewritten_files: 0,
      rewritten_imports: 0,
      removed_comments: 0,
      formatted_files: 0,
      unchanged_files: 0,
      ruleResults: {},
      violations: [],
    };
  }

  await validateMovePlan(moves);

  const sourceDirectories = moves.map((move) => path.dirname(move.fromAbsolutePath));

  try {
    const rewriteState = await planImportRewritesForSourceFileStructureMoves(sourceFiles, moves, options);
    const movedFiles = await moveFiles(moves, options);
    await writeSourceFileStructureRewrites(rewriteState.rewrittenByPath, options);

    await removeEmptyDirectories(sourceDirectories);

    logger.success("fix-source-file-structure-finished", `source file structure moves=${movedFiles} rewrittenImports=${rewriteState.rewrittenImports}`, {
      movedFiles,
      rewrittenFiles: rewriteState.rewrittenFiles,
      rewrittenImports: rewriteState.rewrittenImports,
    }, { group: ruleLogGroup("source-file-structure") });

    return {
      ok: true,
      violationCount: 0,
      deleted_files: 0,
      moved_files: movedFiles,
      rewritten_files: rewriteState.rewrittenFiles,
      rewritten_imports: rewriteState.rewrittenImports,
      removed_comments: 0,
      formatted_files: 0,
      unchanged_files: 0,
      ruleResults: {},
      violations: [],
    };
  } catch (error) {
    if (error instanceof FileConflictError || error instanceof RewriteFailureError) {
      throw error;
    }

    throw new FixFailureError("Source file structure fix failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export { buildMovePlan, createSourceFileStructureViolation, fixSourceFileStructure };
