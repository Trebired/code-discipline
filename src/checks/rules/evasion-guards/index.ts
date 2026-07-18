import fs from "node:fs/promises";

import { parseSource } from "../../../imports/module-specifiers.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import { loadNativeBinding } from "../../../native/native.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { isTypeScriptFamilyExtension } from "../../../shared/languages.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../../progress.js";
import type { NormalizedCheckCodeDisciplineOptions, NormalizedPackedCodeGuardOptions } from "../../types.js";
import { collectFunctionDescriptors } from "./functions.js";
import { collectRuntimeCodeHidingViolations } from "./runtime.js";
import { countStructuralTokens, getPackedLineStats, stripCommentsAndStrings } from "./strip.js";

function createPackedFileViolation(
  file: ScannedSourceFile,
  text: string,
  nonEmptyLineCount: number,
  structuralTokenCount: number,
  rule: NormalizedPackedCodeGuardOptions,
): CodeDisciplineViolation {
  return {
    rule: "evasion-guards",
    fix: false,
    filePath: file.relativeFromProjectRoot,
    message: `file appears packed into ${nonEmptyLineCount} non-empty line(s)`,
    details: {
      kind: "packed-file",
      nonEmptyLineCount,
      characterCount: text.length,
      structuralTokenCount,
      maxNonEmptyLines: rule.maxPackedFileNonEmptyLines,
      minCharacters: rule.minPackedFileCharacters,
      minStructuralTokens: rule.minPackedFileStructuralTokens,
    },
  };
}

function collectPackedLineViolations(
  file: ScannedSourceFile,
  rawLines: string[],
  strippedLines: string[],
  rule: NormalizedPackedCodeGuardOptions,
): CodeDisciplineViolation[] {
  const violations: CodeDisciplineViolation[] = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    const stats = getPackedLineStats(rawLines[index] ?? "", strippedLines[index] ?? "");
    if (
      stats.columnCount < rule.minPackedLineColumns
      || (
        stats.semicolonCount <= rule.maxSemicolonsPerLine
        && stats.structuralTokenCount <= rule.maxStructuralTokensPerLine
      )
    ) continue;

    violations.push({
      rule: "evasion-guards",
      fix: false,
      filePath: file.relativeFromProjectRoot,
      message: `line ${index + 1} appears packed to avoid line-count rules`,
      details: {
        kind: "packed-line",
        line: index + 1,
        columnCount: stats.columnCount,
        semicolonCount: stats.semicolonCount,
        structuralTokenCount: stats.structuralTokenCount,
        minColumns: rule.minPackedLineColumns,
        maxSemicolons: rule.maxSemicolonsPerLine,
        maxStructuralTokens: rule.maxStructuralTokensPerLine,
      },
    });
  }

  return violations;
}

function collectPackedFileViolations(
  file: ScannedSourceFile,
  text: string,
  strippedText: string,
  rule: NormalizedPackedCodeGuardOptions,
): CodeDisciplineViolation[] {
  const rawLines = text.split(/\r?\n/u);
  const strippedLines = strippedText.split(/\r?\n/u);
  const nonEmptyLineCount = rawLines.filter((line) => line.trim().length > 0).length;
  const structuralTokenCount = countStructuralTokens(strippedText);
  const violations = collectPackedLineViolations(file, rawLines, strippedLines, rule);

  if (
    nonEmptyLineCount <= rule.maxPackedFileNonEmptyLines
    && text.length >= rule.minPackedFileCharacters
    && structuralTokenCount >= rule.minPackedFileStructuralTokens
  ) {
    violations.unshift(createPackedFileViolation(file, text, nonEmptyLineCount, structuralTokenCount, rule));
  }

  return violations;
}

function collectPackedFunctionViolations(
  file: ScannedSourceFile,
  text: string,
  rule: NormalizedPackedCodeGuardOptions,
): CodeDisciplineViolation[] {
  const sourceFile = parseSource(text, file.absolutePath);

  return collectFunctionDescriptors(sourceFile)
    .filter((descriptor) => (
      descriptor.lineCount <= rule.maxPackedFunctionLines
      && descriptor.statementCount > rule.maxPackedFunctionStatements
      && descriptor.characterCount >= rule.minPackedFunctionCharacters
    ))
    .map((descriptor) => ({
      rule: "evasion-guards",
      fix: false,
      filePath: file.relativeFromProjectRoot,
      message: `${descriptor.kind} ${descriptor.name} appears packed into ${descriptor.lineCount} line(s)`,
      details: {
        kind: "packed-function",
        functionKind: descriptor.kind,
        functionName: descriptor.name,
        line: descriptor.startLine,
        lineCount: descriptor.lineCount,
        statementCount: descriptor.statementCount,
        characterCount: descriptor.characterCount,
        maxLines: rule.maxPackedFunctionLines,
        maxStatements: rule.maxPackedFunctionStatements,
        minCharacters: rule.minPackedFunctionCharacters,
      },
    }));
}

async function collectFileEvasionViolations(
  file: ScannedSourceFile,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.evasionGuards;
  if (!rule) return [];

  const text = await fs.readFile(file.absolutePath, "utf8");
  const strippedText = stripCommentsAndStrings(text);
  const violations = rule.packedCode
    ? collectPackedFileViolations(file, text, strippedText, rule.packedCode)
    : [];

  if (!isTypeScriptFamilyExtension(file.extension)) return violations;
  if (rule.packedCode) violations.push(...collectPackedFunctionViolations(file, text, rule.packedCode));
  if (rule.runtimeCodeHiding) {
    violations.push(...collectRuntimeCodeHidingViolations(file, parseSource(text, file.absolutePath)));
  }

  return violations;
}

async function runEvasionGuardsRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.evasionGuards;
  if (!rule) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "evasion-guards",
    totalItems: sourceFiles.length,
  });
  const native = loadNativeBinding();
  if (native && !options.progressObserver) {
    const violations = JSON.parse(native.runEvasionGuardsRule(JSON.stringify({
      sourceFiles,
      evasionGuards: rule,
    }))) as CodeDisciplineViolation[];
    emitRuleCompleted(progress, violations.length);
    return violations;
  }

  const violations: CodeDisciplineViolation[] = [];
  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    violations.push(...await collectFileEvasionViolations(file, options));
    emitRuleChunk(progress, index + 1, violations.length);
  }
  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { runEvasionGuardsRule };
