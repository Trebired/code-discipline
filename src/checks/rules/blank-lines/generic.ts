import {
  isGoExtension,
  isPythonExtension,
  isQmlExtension,
  isRustExtension,
  isShellExtension,
  isStyleExtension,
} from "#87jyjzn68rrk";
import { maskQmlCommentsAndStrings } from "#x6956eahfhcm";
import { stripCommentsAndStrings } from "#azin2l86pnk4";
import {
  measurePythonIndent,
  updatePythonTripleState,
  type PythonTripleState,
} from "#fr9be3qxsdjh";
import { stripShellStringsAndComments } from "#j00y5takmzho";
import { applyBoundaryEdits, type ApplyBoundaryEditsResult } from "./rewrite.js";
import type { BoundaryEdit } from "./types.js";

type GenericStructuralUnit = {
  endLine: number;
  scopeKey: string;
  startLine: number;
};

type PendingBraceUnit = {
  braceDepth: number;
  scopeKey: string;
  seenOpeningBrace: boolean;
  startLine: number;
};

type PendingIndentedUnit = {
  indent: number;
  scopeKey: string;
  startLine: number;
};

function hasOnlyBlankLinesBetween(lines: string[], previousEndLine: number, nextStartLine: number): boolean {
  for (let index = previousEndLine; index < nextStartLine - 1; index += 1) {
    if ((lines[index] ?? "").trim().length > 0) return false;
  }
  return true;
}

function computeBoundaryEdits(lines: string[], units: GenericStructuralUnit[]): BoundaryEdit[] {
  const byScope = new Map<string, GenericStructuralUnit[]>();

  for (const unit of units) {
    const rows = byScope.get(unit.scopeKey) ?? [];
    rows.push(unit);
    byScope.set(unit.scopeKey, rows);
  }

  const edits: BoundaryEdit[] = [];

  for (const rows of byScope.values()) {
    const sorted = rows.sort((left, right) => left.startLine - right.startLine);

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const next = sorted[index]!;
      if (!hasOnlyBlankLinesBetween(lines, previous.endLine, next.startLine)) continue;

      const gap = next.startLine - previous.endLine - 1;
      if (gap === 1) continue;

      edits.push({
        atLine: previous.endLine + 1,
        removeCount: Math.max(0, gap - 1),
        insertCount: Math.max(0, 1 - gap),
      });
    }
  }

  return edits;
}

function maskRustRawStrings(text: string): string {
  let output = "";
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "r") {
      output += text[index] ?? "";
      index += 1;
      continue;
    }

    let cursor = index + 1;
    while (text[cursor] === "#") cursor += 1;
    if (text[cursor] !== "\"") {
      output += text[index] ?? "";
      index += 1;
      continue;
    }

    const hashes = cursor - index - 1;
    const close = `"${"#".repeat(hashes)}`;
    const contentStart = cursor + 1;
    const closeIndex = text.indexOf(close, contentStart);
    if (closeIndex < 0) {
      output += text[index] ?? "";
      index += 1;
      continue;
    }

    const end = closeIndex + close.length;
    output += text.slice(index, end).replace(/[^\r\n]/gu, " ");
    index = end;
  }

  return output;
}

function maskBraceLanguage(text: string, extension: string): string {
  if (isQmlExtension(extension)) return maskQmlCommentsAndStrings(text);
  if (isRustExtension(extension)) return stripCommentsAndStrings(maskRustRawStrings(text));
  return stripCommentsAndStrings(text);
}

function countMaskedBraceDelta(line: string): number {
  let delta = 0;
  for (const character of line) {
    if (character === "{") delta += 1;
    else if (character === "}") delta -= 1;
  }
  return delta;
}

function isBraceUnitStart(line: string, extension: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return false;

  if (isGoExtension(extension)) {
    return /^(?:func|type\s+[A-Za-z_]\w*\s+(?:struct|interface))\b/u.test(trimmed);
  }

  if (isRustExtension(extension)) {
    return /^(?:(?:pub(?:\([^)]*\))?|async|const|unsafe)\s+)*(?:fn|struct|enum|impl|trait)\b/u.test(trimmed);
  }

  if (isQmlExtension(extension)) {
    return /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u.test(trimmed)
      || /^(?:property\s+\w+\s+)?[A-Za-z_$][\w$]*\s*:\s*function\s*\(/u.test(trimmed)
      || /^on[A-Z][\w$]*\s*:\s*(?:$|\{|function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/u.test(trimmed);
  }

  if (isStyleExtension(extension)) {
    return trimmed.includes("{") && !trimmed.startsWith("}");
  }

  return false;
}

function collectBraceStructuralUnits(text: string, extension: string): GenericStructuralUnit[] {
  const lines = text.split(/\r?\n/u);
  const maskedLines = maskBraceLanguage(text, extension).split(/\r?\n/u);
  const units: GenericStructuralUnit[] = [];
  let depth = 0;
  let pending: PendingBraceUnit | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const maskedLine = maskedLines[index] ?? "";
    const line = lines[index] ?? "";
    const depthBefore = depth;

    if (!pending && isBraceUnitStart(line, extension)) {
      pending = {
        braceDepth: 0,
        scopeKey: `brace:${depthBefore}`,
        seenOpeningBrace: false,
        startLine: index + 1,
      };
    }

    if (pending && maskedLine.includes("{")) pending.seenOpeningBrace = true;

    const delta = countMaskedBraceDelta(maskedLine);
    if (pending) pending.braceDepth += delta;
    depth = Math.max(0, depth + delta);

    if (pending?.seenOpeningBrace && pending.braceDepth <= 0) {
      units.push({
        startLine: pending.startLine,
        endLine: index + 1,
        scopeKey: pending.scopeKey,
      });
      pending = null;
    }
  }

  return units;
}

function closeIndentedUnits(args: {
  currentIndent: number;
  endLine: number;
  stack: PendingIndentedUnit[];
  units: GenericStructuralUnit[];
}): void {
  while (args.stack.length > 0 && args.currentIndent <= args.stack[args.stack.length - 1]!.indent) {
    const pending = args.stack.pop()!;
    args.units.push({
      startLine: pending.startLine,
      endLine: Math.max(pending.startLine, args.endLine),
      scopeKey: pending.scopeKey,
    });
  }
}

function collectPythonStructuralUnits(text: string): GenericStructuralUnit[] {
  const units: GenericStructuralUnit[] = [];
  const stack: PendingIndentedUnit[] = [];
  const lines = text.split(/\r?\n/u);
  const state: PythonTripleState = { quote: null };
  let lastMeaningfulLine = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const insideTripleString = state.quote !== null;
    const match = insideTripleString
      ? null
      : /^(\s*)(?:async\s+def|def|class)\s+[A-Za-z_]\w*\b/u.exec(line);

    if (!insideTripleString && line.trim().length > 0 && !line.trimStart().startsWith("#")) {
      const indent = measurePythonIndent(line);
      closeIndentedUnits({
        currentIndent: indent,
        endLine: lastMeaningfulLine,
        stack,
        units,
      });
      lastMeaningfulLine = index + 1;
    }

    if (match) {
      const indent = measurePythonIndent(match[1] ?? "");
      stack.push({
        indent,
        scopeKey: `indent:${indent}`,
        startLine: index + 1,
      });
    }

    updatePythonTripleState(line, state);
  }

  closeIndentedUnits({
    currentIndent: -1,
    endLine: lastMeaningfulLine || lines.length,
    stack,
    units,
  });

  return units;
}

function collectShellStructuralUnits(text: string): GenericStructuralUnit[] {
  const units: GenericStructuralUnit[] = [];
  const lines = text.split(/\r?\n/u);
  let pending: PendingBraceUnit | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const maskedLine = stripShellStringsAndComments(lines[index] ?? "");

    if (!pending && /^\s*(?:function\s+)?[A-Za-z_][\w-]*\s*(?:\(\s*\))?\s*\{/u.test(maskedLine)) {
      pending = {
        braceDepth: 0,
        scopeKey: "shell:function",
        seenOpeningBrace: false,
        startLine: index + 1,
      };
    }

    if (pending && maskedLine.includes("{")) pending.seenOpeningBrace = true;
    const delta = countMaskedBraceDelta(maskedLine);
    if (pending) pending.braceDepth += delta;

    if (pending?.seenOpeningBrace && pending.braceDepth <= 0) {
      units.push({
        startLine: pending.startLine,
        endLine: index + 1,
        scopeKey: pending.scopeKey,
      });
      pending = null;
    }
  }

  return units;
}

function collectGenericStructuralUnits(text: string, extension: string): GenericStructuralUnit[] {
  if (isPythonExtension(extension)) return collectPythonStructuralUnits(text);
  if (isShellExtension(extension)) return collectShellStructuralUnits(text);
  if (isGoExtension(extension) || isRustExtension(extension) || isQmlExtension(extension) || isStyleExtension(extension)) {
    return collectBraceStructuralUnits(text, extension);
  }
  return [];
}

function rewriteGenericStructuralBlankLines(text: string, extension: string): ApplyBoundaryEditsResult {
  const lines = text.split(/\r?\n/u);
  const units = collectGenericStructuralUnits(text, extension);
  const edits = computeBoundaryEdits(lines, units);
  return applyBoundaryEdits(text, edits);
}

export { collectGenericStructuralUnits, rewriteGenericStructuralBlankLines };
