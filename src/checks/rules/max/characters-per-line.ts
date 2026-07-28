import fs from "node:fs/promises";

import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";

function countCharacters(line: string): number {
  return Array.from(line).length;
}

function isSvgFile(file: ScannedSourceFile): boolean {
  return file.extension.toLowerCase() === ".svg";
}

function canContainJsxSvg(file: ScannedSourceFile): boolean {
  return [".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"].includes(file.extension.toLowerCase());
}

function isLikelyJsxSvgStart(line: string, matchIndex: number): boolean {
  const before = line.slice(0, matchIndex).trimEnd();
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
  if (!before) return true;

  return /(?:return|[({\[<>=?:,])$/.test(before);
}

function countInlineSvgOpenTags(line: string): number {
  let count = 0;
  const matcher = /<svg\b/gi;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(line))) {
    if (!isLikelyJsxSvgStart(line, match.index)) continue;

    const tagEnd = line.indexOf(">", match.index);
    const tagText = tagEnd === -1 ? line.slice(match.index) : line.slice(match.index, tagEnd + 1);
    if (/\/\s*>$/.test(tagText)) continue;

    count += 1;
  }

  return count;
}

function countInlineSvgCloseTags(line: string): number {
  return Array.from(line.matchAll(/<\/svg\s*>/gi)).length;
}

async function runMaxCharactersPerLineRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.maxCharactersPerLine) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "max-characters-per-line",
    totalItems: sourceFiles.length,
  });
  const violations: CodeDisciplineViolation[] = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (isSvgFile(file)) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    const lines = (await fs.readFile(file.absolutePath, "utf8")).split(/\r?\n/);
    const trackInlineSvg = canContainJsxSvg(file);
    let inlineSvgDepth = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? "";

      if (trackInlineSvg) {
        const openTags = countInlineSvgOpenTags(line);
        const closeTags = countInlineSvgCloseTags(line);
        const isInlineSvgLine = inlineSvgDepth > 0 || openTags > 0;
        inlineSvgDepth = Math.max(0, inlineSvgDepth + openTags - closeTags);
        if (isInlineSvgLine) continue;
      }

      const characterCount = countCharacters(line);
      if (characterCount <= options.rules.maxCharactersPerLine.max) continue;

      violations.push({
        rule: "max-characters-per-line",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `line ${lineIndex + 1} has ${characterCount} characters and exceeds the limit of ${options.rules.maxCharactersPerLine.max}`,
        details: {
          line: lineIndex + 1,
          characterCount,
          max: options.rules.maxCharactersPerLine.max,
        },
      });
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { countCharacters, runMaxCharactersPerLineRule };
