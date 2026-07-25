import path from "node:path";

import ts from "typescript";

import { ParseFailureError } from "../shared/errors.js";
import { isScssExtension } from "../shared/languages.js";
import { formatDiagnostics } from "../shared/utils.js";

type ModuleSpecifierOccurrence = {
  specifier: string;
  start: number;
  end: number;
  removalEnd?: number;
  removalStart?: number;
};

type TextReplacement = {
  start: number;
  end: number;
  value: string;
};

type TextScannerState = {
  escaping: boolean;
  inBlockComment: boolean;
  inLineComment: boolean;
  inString: boolean;
  quote: string;
};

function resolveScriptKind(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  if (extension === ".mts") return ts.ScriptKind.TS;
  if (extension === ".cts") return ts.ScriptKind.TS;
  return ts.ScriptKind.TS;
}

function parseSource(text: string, filePath: string): ts.SourceFile {
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, resolveScriptKind(filePath));
  const diagnostics = ((sourceFile as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[];
  }).parseDiagnostics ?? []);
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

  if (errors.length > 0) {
    throw new ParseFailureError(filePath, formatDiagnostics(errors));
  }

  return sourceFile;
}

function expandLineRemovalRange(text: string, start: number, end: number): { start: number; end: number } | null {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndCandidate = text.indexOf("\n", end);
  const lineEnd = lineEndCandidate === -1 ? text.length : lineEndCandidate + 1;
  const prefix = text.slice(lineStart, start);
  const suffix = text.slice(end, lineEndCandidate === -1 ? text.length : lineEndCandidate);

  if (prefix.trim() || suffix.trim()) return null;
  return { start: lineStart, end: lineEnd };
}

function collectTypeScriptModuleSpecifiers(text: string, filePath: string): ModuleSpecifierOccurrence[] {
  const sourceFile = parseSource(text, filePath);
  const occurrences: ModuleSpecifierOccurrence[] = [];

  function removableStatementRange(node: ts.Node): { start: number; end: number } | null {
    return expandLineRemovalRange(text, node.getStart(sourceFile), node.getEnd());
  }

  function addLiteral(node: ts.StringLiteralLike, removalRange?: { start: number; end: number } | null) {
    occurrences.push({
      specifier: node.text,
      start: node.getStart(sourceFile) + 1,
      end: node.getEnd() - 1,
      removalStart: removalRange?.start,
      removalEnd: removalRange?.end,
    });
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        addLiteral(node.moduleSpecifier, removableStatementRange(node));
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [firstArg] = node.arguments;
      if (firstArg && ts.isStringLiteralLike(firstArg)) {
        addLiteral(firstArg);
      }
    }

    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      addLiteral(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return occurrences;
}

function createTextScannerState(): TextScannerState {
  return {
    escaping: false,
    inBlockComment: false,
    inLineComment: false,
    inString: false,
    quote: "",
  };
}

function isIdentifierCharacter(value: string): boolean {
  return /[a-zA-Z0-9_-]/.test(value);
}

function advanceTextScannerState(state: TextScannerState, char: string, next?: string): { skip: number } {
  if (state.inLineComment) {
    if (char === "\n" || char === "\r") state.inLineComment = false;
    return { skip: 0 };
  }

  if (state.inBlockComment) {
    if (char === "*" && next === "/") {
      state.inBlockComment = false;
      return { skip: 1 };
    }
    return { skip: 0 };
  }

  if (state.inString) {
    if (state.escaping) state.escaping = false;
    else if (char === "\\") state.escaping = true;
    else if (char === state.quote) {
      state.inString = false;
      state.quote = "";
    }
    return { skip: 0 };
  }

  if (char === "/" && next === "/") {
    state.inLineComment = true;
    return { skip: 1 };
  }

  if (char === "/" && next === "*") {
    state.inBlockComment = true;
    return { skip: 1 };
  }

  if (char === "\"" || char === "'") {
    state.inString = true;
    state.quote = char;
  }

  return { skip: 0 };
}

function matchSassDirective(text: string, index: number): "forward" | "import" | "use" | "" {
  if (text[index] !== "@") return "";
  for (const directive of ["forward", "import", "use"] as const) {
    const start = index + 1;
    const end = start + directive.length;
    if (text.slice(start, end) === directive && !isIdentifierCharacter(text[end] || "")) return directive;
  }
  return "";
}

function findDirectiveEnd(text: string, index: number): number {
  let quote = "";
  let escaping = false;
  let parenDepth = 0;

  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor]!;
    if (quote) {
      if (escaping) escaping = false;
      else if (char === "\\") escaping = true;
      else if (char === quote) quote = "";
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") parenDepth += 1;
    else if (char === ")" && parenDepth > 0) parenDepth -= 1;
    else if (char === ";" && parenDepth === 0) return cursor;
  }

  return text.length;
}

function isInsideUrlFunction(segment: string, quoteIndex: number): boolean {
  let cursor = quoteIndex - 1;
  while (cursor >= 0 && /\s/.test(segment[cursor]!)) cursor -= 1;
  if (segment[cursor] !== "(") return false;
  cursor -= 1;
  while (cursor >= 0 && /\s/.test(segment[cursor]!)) cursor -= 1;

  const end = cursor + 1;
  while (cursor >= 0 && /[a-zA-Z-]/.test(segment[cursor]!)) cursor -= 1;
  return segment.slice(cursor + 1, end).toLowerCase() === "url";
}

function collectQuotedSassSpecifiers(
  segment: string,
  baseOffset: number,
  removalRange?: { start: number; end: number } | null,
): ModuleSpecifierOccurrence[] {
  const occurrences: ModuleSpecifierOccurrence[] = [];
  let quote = "";
  let specifierStart = -1;
  let escaping = false;

  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index]!;
    if (quote) {
      if (escaping) escaping = false;
      else if (char === "\\") escaping = true;
      else if (char === quote) {
        occurrences.push({
          specifier: segment.slice(specifierStart, index),
          start: baseOffset + specifierStart,
          end: baseOffset + index,
          removalStart: removalRange?.start,
          removalEnd: removalRange?.end,
        });
        quote = "";
        specifierStart = -1;
      }
      continue;
    }

    if ((char === "\"" || char === "'") && !isInsideUrlFunction(segment, index)) {
      quote = char;
      specifierStart = index + 1;
    }
  }

  return occurrences;
}

function collectScssModuleSpecifiers(text: string): ModuleSpecifierOccurrence[] {
  const occurrences: ModuleSpecifierOccurrence[] = [];
  const state = createTextScannerState();

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];
    if (!state.inLineComment && !state.inBlockComment && !state.inString) {
      const directive = matchSassDirective(text, index);
      if (directive) {
        const directiveEnd = findDirectiveEnd(text, index);
        const directiveStart = index + directive.length + 1;
        const rangeEnd = directiveEnd < text.length && text[directiveEnd] === ";" ? directiveEnd + 1 : directiveEnd;
        const removalRange = expandLineRemovalRange(text, index, rangeEnd);
        const segment = text.slice(directiveStart, directiveEnd);
        const specifiers = collectQuotedSassSpecifiers(segment, directiveStart, removalRange);
        occurrences.push(...(directive === "import" && specifiers.length > 1
          ? specifiers.map((specifier) => ({ ...specifier, removalStart: undefined, removalEnd: undefined }))
          : directive === "import" ? specifiers : specifiers.slice(0, 1)));
        index = directiveEnd;
        continue;
      }
    }

    index += advanceTextScannerState(state, char, next).skip;
  }

  return occurrences;
}

function collectModuleSpecifiers(text: string, filePath: string): ModuleSpecifierOccurrence[] {
  return isScssExtension(filePath)
    ? collectScssModuleSpecifiers(text)
    : collectTypeScriptModuleSpecifiers(text, filePath);
}

function applyTextReplacements(text: string, replacements: TextReplacement[]): { text: string; count: number } {
  if (replacements.length === 0) {
    return { text, count: 0 };
  }

  const sorted = [...replacements].sort((left, right) => right.start - left.start);
  let nextText = text;

  for (const replacement of sorted) {
    nextText = `${nextText.slice(0, replacement.start)}${replacement.value}${nextText.slice(replacement.end)}`;
  }

  return {
    text: nextText,
    count: replacements.length,
  };
}

export { applyTextReplacements, collectModuleSpecifiers, collectScssModuleSpecifiers, parseSource, resolveScriptKind };
export type { ModuleSpecifierOccurrence, TextReplacement };
