import fs from "node:fs/promises";

import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../checks/progress.js";
import { RewriteFailureError } from "../shared/errors.js";
import type { NormalizedCodeDisciplineLogger } from "../shared/logging-types.js";
import { applyTextReplacements, collectModuleSpecifiers } from "./module-specifiers.js";
import { resolveRelativeImport } from "./resolve.js";
import type {
  AliasRecord,
  AllowRelativeFn,
  NormalizedSyncImportsOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
} from "./types.js";

function isAllowedRelative(
  specifier: string,
  sourceFile: string,
  resolvedFile: string,
  options: NormalizedSyncImportsOptions,
): boolean {
  const policy = options.allowRelative;

  if (Array.isArray(policy)) {
    return policy.some((entry) => specifier === entry || specifier.startsWith(entry));
  }

  return (policy as AllowRelativeFn)(specifier, {
    sourceFile,
    resolvedFile,
    projectRoot: options.projectRoot,
    sourceRoot: options.sourceRoot,
  });
}

async function rewriteSourceFile(
  file: ScannedSourceFile,
  options: NormalizedSyncImportsOptions,
  aliasIdsByFilePath: Map<string, string>,
  logger: NormalizedCodeDisciplineLogger,
): Promise<RewriteFileResult> {
  try {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const replacements = [];

    for (const occurrence of collectModuleSpecifiers(text, file.absolutePath)) {
      if (!occurrence.specifier.startsWith(".")) continue;

      const resolvedFile = await resolveRelativeImport(occurrence.specifier, file.absolutePath, options);
      if (!resolvedFile) {
        logger.debug("rewrite-skipped-unresolved", `skipped unresolved import ${occurrence.specifier}`, {
          sourceFile: file.absolutePath,
          specifier: occurrence.specifier,
        });
        continue;
      }

      if (isAllowedRelative(occurrence.specifier, file.absolutePath, resolvedFile, options)) continue;

      const aliasId = aliasIdsByFilePath.get(resolvedFile);
      if (!aliasId) continue;

      replacements.push({
        start: occurrence.start,
        end: occurrence.end,
        value: aliasId,
      });
    }

    const applied = applyTextReplacements(text, replacements);
    if (applied.count === 0) {
      return {
        rewritten: false,
        rewrittenImports: 0,
      };
    }

    await fs.writeFile(file.absolutePath, applied.text);

    return {
      rewritten: true,
      rewrittenImports: applied.count,
    };
  } catch (error) {
    throw new RewriteFailureError(file.absolutePath, error);
  }
}

async function rewriteSourceImports(
  sourceFiles: ScannedSourceFile[],
  aliasRecords: AliasRecord[],
  options: NormalizedSyncImportsOptions,
  logger: NormalizedCodeDisciplineLogger,
): Promise<RewriteResult> {
  const aliasIdsByFilePath = new Map(aliasRecords.map((record) => [record.absolutePath, record.id]));
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "sync-imports",
    stage: "fix",
    totalItems: sourceFiles.length,
  });
  let rewrittenFiles = 0;
  let rewrittenImports = 0;

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    const result = await rewriteSourceFile(file, options, aliasIdsByFilePath, logger);
    if (result.rewritten) rewrittenFiles += 1;
    rewrittenImports += result.rewrittenImports;
    emitRuleChunk(progress, index + 1, 0, { rewrittenFiles, rewrittenImports });
  }

  emitRuleCompleted(progress, 0, { rewrittenFiles, rewrittenImports });
  return {
    rewrittenFiles,
    rewrittenImports,
  };
}

export { isAllowedRelative, rewriteSourceImports };
