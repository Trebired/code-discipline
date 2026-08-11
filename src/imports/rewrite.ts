import fs from "node:fs/promises";

import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { RewriteFailureError } from "#4f8hale01wb4";
import { ruleLogGroup } from "#foa3t3ao5irq";
import type { NormalizedCodeDisciplineLogger } from "#uljkt8i26p4t";
import { isTypeScriptFamilyExtension } from "#87jyjzn68rrk";
import { collectDeadImportRemovals } from "./dead.js";
import { applyTextReplacements, collectModuleSpecifiers } from "./module-specifiers.js";
import type { TextReplacement } from "./module-specifiers.js";
import { resolveRelativeImport } from "./resolve.js";
import type {
  AliasRecord,
  AllowRelativeFn,
  NormalizedImportsOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
} from "./types.js";

function isWithinRange(start: number, end: number, ranges: TextReplacement[]): boolean {
  return ranges.some((range) => start >= range.start && end <= range.end);
}

function isAllowedRelative(
  specifier: string,
  sourceFile: string,
  resolvedFile: string,
  options: NormalizedImportsOptions,
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
  options: NormalizedImportsOptions,
  aliasIdsByFilePath: Map<string, string>,
  logger: NormalizedCodeDisciplineLogger,
): Promise<RewriteFileResult> {
  try {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const replacements: TextReplacement[] = [];
    const deadImportReplacements = options.removeDeadImports && isTypeScriptFamilyExtension(file.extension)
    ? collectDeadImportRemovals(text, file.absolutePath)
    : [];

    for (const occurrence of collectModuleSpecifiers(text, file.absolutePath)) {
      if (!occurrence.specifier.startsWith(".")) continue;
      if (isWithinRange(occurrence.start, occurrence.end, deadImportReplacements)) continue;

      const resolvedFile = await resolveRelativeImport(occurrence.specifier, file.absolutePath, options);
      if (!resolvedFile) {
        if (occurrence.removalStart !== undefined && occurrence.removalEnd !== undefined) {
          replacements.push({
              start: occurrence.removalStart,
              end: occurrence.removalEnd,
              value: "",
          });
          logger.debug("rewrite-removed-unresolved", `removed unresolved import ${occurrence.specifier}`, {
              sourceFile: file.absolutePath,
              specifier: occurrence.specifier,
            }, { group: ruleLogGroup("imports") });
          continue;
        }

        logger.debug("rewrite-skipped-unresolved", `skipped unresolved import ${occurrence.specifier}`, {
            sourceFile: file.absolutePath,
            specifier: occurrence.specifier,
          }, { group: ruleLogGroup("imports") });
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

    if (deadImportReplacements.length > 0) {
      logger.debug("rewrite-removed-dead-imports", `removed ${deadImportReplacements.length} unused import(s)`, {
          sourceFile: file.absolutePath,
          count: deadImportReplacements.length,
        }, { group: ruleLogGroup("imports") });
    }

    const applied = applyTextReplacements(text, [...replacements, ...deadImportReplacements]);
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
  options: NormalizedImportsOptions,
  logger: NormalizedCodeDisciplineLogger,
): Promise<RewriteResult> {
  const aliasIdsByFilePath = new Map(aliasRecords.map((record) => [record.absolutePath, record.id]));
  const progress = createRuleProgress({
      observer: options.progressObserver,
      rule: "imports",
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
