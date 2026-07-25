import fs from "node:fs/promises";
import path from "node:path";

import { parseSource } from "../../../imports/module-specifiers.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { isTypeScriptFamilyExtension } from "../../../shared/languages.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../../progress.js";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "../../types.js";
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
    if (!isTypeScriptFamilyExtension(path.extname(file.absolutePath).toLowerCase())) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(sourceText, file.absolutePath);
    const result = rewriteStructuralBlankLines(sourceFile, sourceText);

    if (result.changed) {
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
    if (!isTypeScriptFamilyExtension(path.extname(file.absolutePath).toLowerCase())) {
      emitRuleChunk(progress, index + 1, 0, { rewrittenFiles });
      continue;
    }

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(sourceText, file.absolutePath);
    const result = rewriteStructuralBlankLines(sourceFile, sourceText);

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
