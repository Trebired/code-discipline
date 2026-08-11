import fs from "node:fs/promises";
import path from "node:path";

import { parseSource } from "#27pccnhol1ci";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { isTypeScriptFamilyExtension, supportsStructuralBlankLines } from "#87jyjzn68rrk";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import { rewriteGenericStructuralBlankLines } from "./generic.js";
import { collectWithParseFailure } from "#lvwwpxtj6az5";
import { rewriteStructuralBlankLines } from "./rewrite.js";

function createStructuralBlankLinesViolation(args: {
    filePath: string;
    boundaryCount: number;
    insertedBlankLines: number;
    removedBlankLines: number;
}): CodeDisciplineViolation {
  return {
    rule: "structural-blank-lines",
    fix: true,
    filePath: args.filePath,
    message: `file has ${args.boundaryCount} structural boundar${args.boundaryCount === 1 ? "y" : "ies"} with incorrect blank line spacing`,
    details: {
      boundaryCount: args.boundaryCount,
      insertedBlankLines: args.insertedBlankLines,
      removedBlankLines: args.removedBlankLines,
    },
  };
}

function rewriteStructuralBlankLinesForFile(file: ScannedSourceFile, sourceText: string) {
  const extension = path.extname(file.absolutePath).toLowerCase();
  if (isTypeScriptFamilyExtension(extension)) {
    return rewriteStructuralBlankLines(parseSource(sourceText, file.absolutePath), sourceText);
  }
  return rewriteGenericStructuralBlankLines(sourceText, extension);
}

async function collectStructuralBlankLinesViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const violations: CodeDisciplineViolation[] = [];
  const progress = createRuleProgress({
      observer: options.progressObserver,
      rule: "structural-blank-lines",
      totalItems: sourceFiles.length,
  });

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!supportsStructuralBlankLines(file.extension)) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const result = await collectWithParseFailure(
      "structural-blank-lines",
      file.relativeFromProjectRoot,
      violations,
      () => rewriteStructuralBlankLinesForFile(file, sourceText),
    );

    if (result?.changed) {
      violations.push(createStructuralBlankLinesViolation({
            filePath: file.relativeFromProjectRoot,
            boundaryCount: result.boundaryCount,
            insertedBlankLines: result.insertedBlankLines,
            removedBlankLines: result.removedBlankLines,
      }));
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

async function fixStructuralBlankLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const progress = createRuleProgress({
      observer: options.progressObserver,
      rule: "structural-blank-lines",
      stage: "fix",
      totalItems: sourceFiles.length,
  });

  let rewrittenFiles = 0;
  let insertedBlankLines = 0;
  let removedBlankLines = 0;

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!supportsStructuralBlankLines(file.extension)) {
      emitRuleChunk(progress, index + 1, 0, { rewrittenFiles });
      continue;
    }

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const result = rewriteStructuralBlankLinesForFile(file, sourceText);

    if (!result.changed) {
      emitRuleChunk(progress, index + 1, 0, { rewrittenFiles });
      continue;
    }

    await fs.writeFile(file.absolutePath, result.text, "utf8");
    rewrittenFiles += 1;
    insertedBlankLines += result.insertedBlankLines;
    removedBlankLines += result.removedBlankLines;
    emitRuleChunk(progress, index + 1, 0, { rewrittenFiles });
  }

  emitRuleCompleted(progress, 0, { rewrittenFiles });
  return {
    ok: true,
    violationCount: 0,
    violations: [],
    rewritten_files: rewrittenFiles,
    inserted_blank_lines: insertedBlankLines,
    removed_blank_lines: removedBlankLines,
  };
}

export { collectStructuralBlankLinesViolations, fixStructuralBlankLinesRule };
