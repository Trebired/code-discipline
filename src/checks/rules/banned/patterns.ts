import fs from "node:fs/promises";
import path from "node:path";

import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { collectModuleSpecifiers, parseSource } from "#27pccnhol1ci";
import { isTypeScriptFamilyExtension } from "#87jyjzn68rrk";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { CODE_DISCIPLINE_STATE_DIR } from "#ik5y0pee4ah1";
import { collectFoldedStringMatches } from "./fold.js";
import type { FoldedStringMatch } from "./fold.js";

type TextSpan = {
  start: number;
  end: number;
};

const NORMALIZED_PACKAGE_STATE_DIR = CODE_DISCIPLINE_STATE_DIR.toLowerCase();

function isStatePathCharacter(value: string): boolean {
  const code = value.charCodeAt(0);
  return code === 45
    || code === 46
    || code === 47
    || code === 95
    || (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122);
}

function collectPackageStatePathSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  let index = 0;
  while (index <= text.length - NORMALIZED_PACKAGE_STATE_DIR.length) {
    const start = text.indexOf(NORMALIZED_PACKAGE_STATE_DIR, index);
    if (start < 0) break;
    let end = start + NORMALIZED_PACKAGE_STATE_DIR.length;
    while (end < text.length && isStatePathCharacter(text[end] ?? "")) end += 1;
    spans.push({ start, end });
    index = end;
  }
  return spans;
}

function isInsideSpan(index: number, spans: TextSpan[]): boolean {
  return spans.some((span) => index >= span.start && index < span.end);
}

function collectModuleSpecifierSpansSafely(text: string, filePath: string): TextSpan[] {
  try {
    return collectModuleSpecifiers(text, filePath).map((specifier) => ({
      start: specifier.start,
      end: specifier.end,
    }));
  } catch {
    return [];
  }
}

function countOccurrencesOutsideIgnoredSpans(text: string, pattern: string, ignoredSpans: TextSpan[] = []): number {
  if (!pattern) return 0;
  const spans = [...collectPackageStatePathSpans(text), ...ignoredSpans];
  let count = 0;
  let index = 0;
  while (index <= text.length - pattern.length) {
    const matchIndex = text.indexOf(pattern, index);
    if (matchIndex < 0) break;
    if (!isInsideSpan(matchIndex, spans)) count += 1;
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
    const moduleSpecifierSpans = collectModuleSpecifierSpansSafely(text, file.absolutePath);
    const foldedMatches = collectFoldedMatchesSafely(text, file.absolutePath);

    for (const pattern of rule.patterns) {
      if (pattern.allowedFiles.includes(file.relativeFromProjectRoot)) continue;

      const rawOccurrences = normalizedText.includes(pattern.normalizedValue)
        ? countOccurrencesOutsideIgnoredSpans(normalizedText, pattern.normalizedValue, moduleSpecifierSpans)
        : 0;
      const patternFoldedMatches = foldedMatches.filter(
        (match) => countOccurrencesOutsideIgnoredSpans(match.value.toLowerCase(), pattern.normalizedValue) > 0,
      );

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
