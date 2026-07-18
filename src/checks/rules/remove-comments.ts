import fs from "node:fs/promises";

import type { ScannedSourceFile } from "../../imports/types.js";
import type { CodeDisciplineViolation } from "../../shared/discipline-types.js";
import { loadNativeBinding } from "../../native/native.js";
import { supportsRemoveComments } from "../../shared/languages.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../progress.js";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "../types.js";
import { stripComments } from "./comments/stripping.js";

function createRemoveCommentsViolation(args: {
  filePath: string;
  commentCount: number;
  lineComments: number;
  blockComments: number;
}): CodeDisciplineViolation {
  return {
    rule: "remove-comments",
    fix: true,
    filePath: args.filePath,
    message: `file contains ${args.commentCount} removable comment(s)`,
    details: {
      commentCount: args.commentCount,
      lineComments: args.lineComments,
      blockComments: args.blockComments,
    },
  };
}

async function collectRemoveCommentsViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "remove-comments",
    totalItems: sourceFiles.length,
  });
  const native = loadNativeBinding();
  if (native && !options.progressObserver) {
    const violations = JSON.parse(native.collectRemoveCommentsViolations(JSON.stringify({
      sourceFiles,
      excludedCommentPatterns: options.rules.removeComments?.exclude ?? [],
    }))) as CodeDisciplineViolation[];
    emitRuleCompleted(progress, violations.length);
    return violations;
  }

  const violations: CodeDisciplineViolation[] = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!supportsRemoveComments(file.extension)) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const result = stripComments(sourceText, file.extension, {
      exclude: options.rules.removeComments?.exclude ?? [],
    });
    if (!result.changed) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    violations.push(createRemoveCommentsViolation({
      filePath: file.relativeFromProjectRoot,
      commentCount: result.commentCount,
      lineComments: result.lineComments,
      blockComments: result.blockComments,
    }));
    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

async function fixRemoveCommentsRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "remove-comments",
    stage: "fix",
    totalItems: sourceFiles.length,
  });
  const native = loadNativeBinding();
  if (native && !options.progressObserver) {
    const result = JSON.parse(native.fixRemoveCommentsRule(JSON.stringify({
      sourceFiles,
      excludedCommentPatterns: options.rules.removeComments?.exclude ?? [],
    }))) as FixCodeDisciplineRuleResult;
    emitRuleCompleted(progress, result.violationCount, {
      removedComments: result.removed_comments,
      rewrittenFiles: result.rewritten_files,
    });
    return result;
  }

  let rewrittenFiles = 0;
  let removedComments = 0;

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!supportsRemoveComments(file.extension)) {
      emitRuleChunk(progress, index + 1, 0, { removedComments, rewrittenFiles });
      continue;
    }

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const result = stripComments(sourceText, file.extension, {
      exclude: options.rules.removeComments?.exclude ?? [],
    });
    if (!result.changed) {
      emitRuleChunk(progress, index + 1, 0, { removedComments, rewrittenFiles });
      continue;
    }

    await fs.writeFile(file.absolutePath, result.text, "utf8");
    rewrittenFiles += 1;
    removedComments += result.commentCount;
    emitRuleChunk(progress, index + 1, 0, { removedComments, rewrittenFiles });
  }

  emitRuleCompleted(progress, 0, { removedComments, rewrittenFiles });
  return {
    ok: true,
    violationCount: 0,
    violations: [],
    rewritten_files: rewrittenFiles,
    removed_comments: removedComments,
  };
}

export { collectRemoveCommentsViolations, fixRemoveCommentsRule };
