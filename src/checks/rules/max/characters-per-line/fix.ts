import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import { applyTextReplacements, parseSource, type TextReplacement } from "#27pccnhol1ci";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { isTypeScriptFamilyExtension } from "#87jyjzn68rrk";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import { countCharacters, runMaxCharactersPerLineRule } from "#gbpelbsn3ne5";

type LiteralLineContext = {
  indent: string;
  lineText: string;
  prefix: string;
};

const CONCATENATION_SUFFIX = " +";
const URL_LITERAL_PATTERN = /(?:https?|ftp):\/\/|mailto:/i;

function isGeneratedSource(file: ScannedSourceFile): boolean {
  const normalized = file.relativeFromProjectRoot.split(path.sep).join("/");
  return normalized.startsWith(".trebired/code-discipline/generated/") || normalized.split("/").includes("generated");
}

function isMinifiedSource(file: ScannedSourceFile): boolean {
  return path.basename(file.relativeFromProjectRoot).toLowerCase().includes(".min.");
}

function isSupportedSource(file: ScannedSourceFile): boolean {
  return isTypeScriptFamilyExtension(file.extension) && !isGeneratedSource(file) && !isMinifiedSource(file);
}

function isImportOrExportSpecifier(node: ts.StringLiteral): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) return true;
  if (ts.isExternalModuleReference(parent) && parent.expression === node) return true;
  if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent) && parent.literal === node) return true;
  return false;
}

function isSafeStringLiteralPosition(node: ts.StringLiteral): boolean {
  if (isImportOrExportSpecifier(node)) return false;

  const parent = node.parent;
  if (!parent) return false;
  if (ts.isJsxAttribute(parent)) return false;
  if (ts.isExpressionStatement(parent) && parent.expression === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) return true;
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) return true;
  if (ts.isArrayLiteralExpression(parent)) return parent.elements.some((element) => element === node);
  if (ts.isCallExpression(parent)) {
    if (parent.expression.kind === ts.SyntaxKind.ImportKeyword) return false;
    return parent.arguments.some((argument) => argument === node);
  }
  if (ts.isReturnStatement(parent) && parent.expression === node) return true;
  return false;
}

function lineContextForNode(
  text: string,
  sourceFile: ts.SourceFile,
  nodeStart: number,
): LiteralLineContext {
  const { line } = sourceFile.getLineAndCharacterOfPosition(nodeStart);
  const lineStarts = sourceFile.getLineStarts();
  const lineStart = lineStarts[line] ?? 0;
  const nextLineStart = lineStarts[line + 1];
  const lineEnd = nextLineStart === undefined
  ? text.length
  : text[nextLineStart - 2] === "\r"
  ? nextLineStart - 2
  : nextLineStart - 1;
  const lineText = text.slice(lineStart, lineEnd);
  const prefix = text.slice(lineStart, nodeStart);
  const indent = lineText.match(/^\s*/)?.[0] ?? "";
  return { indent, lineText, prefix };
}

function hasCommentOutsideLiteral(lineText: string, nodeColumn: number, rawLiteral: string): boolean {
  const leading = lineText.slice(0, nodeColumn);
  const trailing = lineText.slice(nodeColumn + rawLiteral.length);
  return [leading, trailing].some((segment) => segment.includes("//") || segment.includes("/*") || segment.includes("*/"));
}

function canRewriteRawLiteral(rawLiteral: string): boolean {
  const quote = rawLiteral[0];
  if (quote !== "\"" && quote !== "'") return false;
  if (rawLiteral[rawLiteral.length - 1] !== quote) return false;
  if (rawLiteral.includes("\n") || rawLiteral.includes("\r")) return false;
  return !rawLiteral.slice(1, -1).includes("\\");
}

function splitLiteralValue(
  value: string,
  firstCapacity: number,
  nextCapacity: number,
): string[] | null {
  if (firstCapacity <= 0 || nextCapacity <= 0) return null;

  const chars = Array.from(value);
  const segments: string[] = [];
  let start = 0;

  while (start < chars.length) {
    const capacity = segments.length === 0 ? firstCapacity : nextCapacity;
    const remaining = chars.length - start;
    if (remaining <= capacity) {
      segments.push(chars.slice(start).join(""));
      break;
    }

    const limit = Math.min(chars.length - 1, start + capacity - 1);
    let splitEnd = -1;

    for (let index = limit; index > start; index -= 1) {
      if (/\s/u.test(chars[index]!)) {
        splitEnd = index + 1;
        break;
      }
    }

    if (splitEnd <= start) return null;
    segments.push(chars.slice(start, splitEnd).join(""));
    start = splitEnd;
  }

  return segments.length > 1 ? segments : null;
}

function renderedLineLength(args: {
    content: string;
    indent: string;
    quote: string;
    suffix: string;
}): number {
  return countCharacters(`${args.indent}${args.quote}${args.content}${args.quote}${args.suffix}`);
}

function renderReplacement(
  segments: string[],
  quote: string,
  continuationIndent: string,
): string {
  return segments
  .map((segment, index) => `${quote}${segment}${quote}${index === segments.length - 1 ? "" : CONCATENATION_SUFFIX}`)
  .join(`\n${continuationIndent}`);
}

function createStringLiteralReplacement(args: {
    context: LiteralLineContext;
    max: number;
    rawLiteral: string;
}): string | null {
  if (!canRewriteRawLiteral(args.rawLiteral)) return null;

  const quote = args.rawLiteral[0]!;
  const value = args.rawLiteral.slice(1, -1);
  if (!/\s/u.test(value)) return null;
  if (URL_LITERAL_PATTERN.test(value)) return null;

  const firstCapacity = args.max
  -countCharacters(args.context.prefix)
  -countCharacters(`${quote}${quote}${CONCATENATION_SUFFIX}`);
  const nextCapacity = args.max
  -countCharacters(args.context.indent)
  -countCharacters(`${quote}${quote}${CONCATENATION_SUFFIX}`);
  const segments = splitLiteralValue(value, firstCapacity, nextCapacity);
  if (!segments) return null;

  const allLinesFit = segments.every((segment, index) => {
      const isFirst = index === 0;
      const isLast = index === segments.length - 1;
      const indent = isFirst ? args.context.prefix : args.context.indent;
      const suffix = isLast ? "" : CONCATENATION_SUFFIX;
      return renderedLineLength({ content: segment, indent, quote, suffix }) <= args.max;
  });
  return allLinesFit ? renderReplacement(segments, quote, args.context.indent) : null;
}

function collectStringLiteralReplacements(
  text: string,
  file: ScannedSourceFile,
  max: number,
): TextReplacement[] {
  const sourceFile = parseSource(text, file.absolutePath);
  const replacements: TextReplacement[] = [];

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) && isSafeStringLiteralPosition(node)) {
      const start = node.getStart(sourceFile);
      const end = node.getEnd();
      const rawLiteral = text.slice(start, end);
      const context = lineContextForNode(text, sourceFile, start);
      const nodeColumn = start - sourceFile.getLineStarts()[sourceFile.getLineAndCharacterOfPosition(start).line]!;

      if (
        countCharacters(context.lineText) > max
        &&!hasCommentOutsideLiteral(context.lineText, nodeColumn, rawLiteral)
      ) {
        const value = createStringLiteralReplacement({ context, max, rawLiteral });
        if (value) replacements.push({ start, end, value });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return replacements;
}

async function fixMaxCharactersPerLineRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const max = options.rules.maxCharactersPerLine?.max;
  if (!max) {
    return { ok: true, violationCount: 0, violations: [], rewritten_files: 0, unchanged_files: 0 };
  }

  const progress = createRuleProgress({
      observer: options.progressObserver,
      rule: "max-characters-per-line",
      stage: "fix",
      totalItems: sourceFiles.length,
  });
  let rewrittenFiles = 0;
  let unchangedFiles = 0;

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!isSupportedSource(file)) {
      unchangedFiles += 1;
      emitRuleChunk(progress, index + 1, 0, { rewrittenFiles });
      continue;
    }

    const text = await fs.readFile(file.absolutePath, "utf8");
    let replacements: TextReplacement[] = [];
    try {
      replacements = collectStringLiteralReplacements(text, file, max);
    } catch {
      unchangedFiles += 1;
      emitRuleChunk(progress, index + 1, 0, { rewrittenFiles });
      continue;
    }

    const next = applyTextReplacements(text, replacements);
    if (next.count === 0) {
      unchangedFiles += 1;
      emitRuleChunk(progress, index + 1, 0, { rewrittenFiles });
      continue;
    }

    await fs.writeFile(file.absolutePath, next.text, "utf8");
    rewrittenFiles += 1;
    emitRuleChunk(progress, index + 1, 0, { rewrittenFiles });
  }

  emitRuleCompleted(progress, 0, { rewrittenFiles });
  const violations = await runMaxCharactersPerLineRule(sourceFiles, options);

  return {
    ok: violations.length === 0,
    violationCount: violations.length,
    violations,
    rewritten_files: rewrittenFiles,
    unchanged_files: unchangedFiles,
  };
}

export { fixMaxCharactersPerLineRule };
