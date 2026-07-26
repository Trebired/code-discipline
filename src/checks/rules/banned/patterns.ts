import fs from "node:fs/promises";
import path from "node:path";

import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { parseSource } from "#27pccnhol1ci";
import { isTypeScriptFamilyExtension } from "#87jyjzn68rrk";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { collectFoldedStringMatches } from "./fold.js";
import type { FoldedStringMatch } from "./fold.js";

function countOccurrences(text: string, pattern: string): number {
  if (!pattern) return 0;

  let count = 0;
  let index = 0;

  while (index <= text.length - pattern.length) {
    const matchIndex = text.indexOf(pattern, index);
    if (matchIndex < 0) break;
    count += 1;
    index = matchIndex + 1;
  }

  return count;
}

function collectFoldedMatchesSafely(text: string, filePath: string): FoldedStringMatch[] {
  if (!isTypeScriptFamilyExtension(path.extname(filePath).toLowerCase())) return [];

  try {
    return collectFoldedStringMatches(parseSource(text, filePath));
  } catch {
    return [];
  }
}

function formatOccurrenceSuffix(count: number): string {
  return count > 1 ? ` ${count} times` : "";
}

function buildBannedPatternMessage(patternValue: string, rawOccurrences: number, foldedOccurrences: number): string {
  if (foldedOccurrences === 0) {
    return `file contains banned pattern "${patternValue}"${formatOccurrenceSuffix(rawOccurrences)}`;
  }

  if (rawOccurrences === 0) {
    return `file contains banned pattern "${patternValue}" via a constant-folded expression${formatOccurrenceSuffix(foldedOccurrences)}`;
  }

  return `file contains banned pattern "${patternValue}"${formatOccurrenceSuffix(rawOccurrences)} and via a constant-folded expression${formatOccurrenceSuffix(foldedOccurrences)}`;
}

async function collectBannedPatternViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.rules.bannedPatterns;
  if (!rule) return [];

  const violations: CodeDisciplineViolation[] = [];
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "banned-patterns",
    totalItems: sourceFiles.length,
  });

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    const text = await fs.readFile(file.absolutePath, "utf8");
    const normalizedText = text.toLowerCase();
    const foldedMatches = collectFoldedMatchesSafely(text, file.absolutePath);

    for (const pattern of rule.patterns) {
      if (pattern.allowedFiles.includes(file.relativeFromProjectRoot)) continue;

      const rawOccurrences = normalizedText.includes(pattern.normalizedValue) ? countOccurrences(normalizedText, pattern.normalizedValue) : 0;
      const patternFoldedMatches = foldedMatches.filter((match) => match.value.toLowerCase().includes(pattern.normalizedValue));

      if (rawOccurrences === 0 && patternFoldedMatches.length === 0) continue;

      violations.push({
        rule: "banned-patterns",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: buildBannedPatternMessage(pattern.value, rawOccurrences, patternFoldedMatches.length),
        details: {
          pattern: pattern.value,
          occurrences: rawOccurrences,
          foldedOccurrences: patternFoldedMatches.length,
          foldedMatches: patternFoldedMatches.map((match) => ({ line: match.line, kind: match.kind })),
          allowedFiles: pattern.allowedFiles,
        },
      });
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { collectBannedPatternViolations };
