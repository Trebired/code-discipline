import fs from "node:fs/promises";

import type { ScannedSourceFile } from "../../imports/types.js";
import type { CodeDisciplineViolation } from "../../shared/discipline-types.js";
import { loadNativeBinding } from "../../native/native.js";
import { supportsRemoveComments } from "../../shared/languages.js";
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
): Promise<CodeDisciplineViolation[]> {
  const native = loadNativeBinding();
  if (native) {
    return JSON.parse(native.collectRemoveCommentsViolations(JSON.stringify({ sourceFiles }))) as CodeDisciplineViolation[];
  }

  const violations: CodeDisciplineViolation[] = [];

  for (const file of sourceFiles) {
    if (!supportsRemoveComments(file.extension)) continue;

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const result = stripComments(sourceText, file.extension);
    if (!result.changed) continue;

    violations.push(createRemoveCommentsViolation({
      filePath: file.relativeFromProjectRoot,
      commentCount: result.commentCount,
      lineComments: result.lineComments,
      blockComments: result.blockComments,
    }));
  }

  return violations;
}

async function fixRemoveCommentsRule(
  sourceFiles: ScannedSourceFile[],
  _options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const native = loadNativeBinding();
  if (native) {
    return JSON.parse(native.fixRemoveCommentsRule(JSON.stringify({ sourceFiles }))) as FixCodeDisciplineRuleResult;
  }

  let rewrittenFiles = 0;
  let removedComments = 0;

  for (const file of sourceFiles) {
    if (!supportsRemoveComments(file.extension)) continue;

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const result = stripComments(sourceText, file.extension);
    if (!result.changed) continue;

    await fs.writeFile(file.absolutePath, result.text, "utf8");
    rewrittenFiles += 1;
    removedComments += result.commentCount;
  }

  return {
    ok: true,
    violationCount: 0,
    violations: [],
    rewritten_files: rewrittenFiles,
    removed_comments: removedComments,
  };
}

export { collectRemoveCommentsViolations, fixRemoveCommentsRule };
