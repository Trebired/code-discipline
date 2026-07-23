import ts from "typescript";

import { isGoExtension, isRustExtension, isStyleExtension, isTypeScriptFamilyExtension } from "../../../shared/languages.js";

type CommentKind = "line" | "block";

type CommentRange = {
  start: number;
  end: number;
  kind: CommentKind;
};

function collectTypeScriptCommentRanges(text: string, extension: string): CommentRange[] {
  const languageVariant = extension === ".jsx" || extension === ".tsx"
    ? ts.LanguageVariant.JSX
    : ts.LanguageVariant.Standard;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, languageVariant, text);
  const ranges: CommentRange[] = [];

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const kind = token === ts.SyntaxKind.SingleLineCommentTrivia
      ? "line"
      : token === ts.SyntaxKind.MultiLineCommentTrivia
        ? "block"
        : null;
    if (!kind) continue;

    ranges.push({ start: scanner.getTokenPos(), end: scanner.getTextPos(), kind });
  }

  return ranges;
}

function scanEscapedQuotedLiteral(text: string, start: number, quote: "\"" | "'"): number {
  let index = start + 1;

  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    index += 1;
    if (char === quote) return index;
  }

  return text.length;
}

function scanBacktickLiteral(text: string, start: number): number {
  let index = start + 1;

  while (index < text.length) {
    if (text[index] === "`") return index + 1;
    index += 1;
  }

  return text.length;
}

function scanLineComment(text: string, start: number): number {
  let index = start + 2;

  while (index < text.length && text[index] !== "\n" && text[index] !== "\r") {
    index += 1;
  }

  return index;
}

function scanBlockComment(text: string, start: number, nested: boolean): number {
  let index = start + 2;
  let depth = 1;

  while (index < text.length) {
    if (nested && text[index] === "/" && text[index + 1] === "*") {
      depth += 1;
      index += 2;
      continue;
    }

    if (text[index] === "*" && text[index + 1] === "/") {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
      continue;
    }

    index += 1;
  }

  return text.length;
}

function collectGoCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "/" && next === "/") {
      const end = scanLineComment(text, index);
      ranges.push({ start: index, end, kind: "line" });
      index = end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = scanBlockComment(text, index, false);
      ranges.push({ start: index, end, kind: "block" });
      index = end;
      continue;
    }

    if (char === "\"" || char === "'") {
      index = scanEscapedQuotedLiteral(text, index, char);
      continue;
    }

    if (char === "`") {
      index = scanBacktickLiteral(text, index);
      continue;
    }

    index += 1;
  }

  return ranges;
}

function scanRustRawString(text: string, start: number): number | null {
  let index = start;

  if (text[index] === "b") {
    if (text[index + 1] !== "r") return null;
    index += 1;
  }

  if (text[index] !== "r") return null;
  index += 1;

  let hashCount = 0;
  while (text[index] === "#") {
    hashCount += 1;
    index += 1;
  }

  if (text[index] !== "\"") return null;
  index += 1;

  while (index < text.length) {
    if (text[index] === "\"" && rawStringHashesMatch(text, index, hashCount)) {
      return index + 1 + hashCount;
    }
    index += 1;
  }

  return text.length;
}

function rawStringHashesMatch(text: string, index: number, hashCount: number): boolean {
  for (let hashIndex = 0; hashIndex < hashCount; hashIndex += 1) {
    if (text[index + 1 + hashIndex] !== "#") return false;
  }

  return true;
}

function scanRustCharLiteral(text: string, start: number): number | null {
  let index = start + 1;

  if (index >= text.length || text[index] === "\n" || text[index] === "\r") return null;

  if (text[index] === "\\") {
    index = scanRustEscapedChar(text, index);
  } else {
    index += 1;
  }

  return text[index] === "'" ? index + 1 : null;
}

function scanRustEscapedChar(text: string, start: number): number {
  let index = start + 1;
  if (index >= text.length) return text.length;

  if (text[index] === "u" && text[index + 1] === "{") {
    index += 2;
    while (index < text.length && text[index] !== "}") index += 1;
    return index < text.length ? index + 1 : index;
  }

  return index + 1;
}

function scanRustLiteral(text: string, index: number): number | null {
  const rawStringEnd = scanRustRawString(text, index);
  if (rawStringEnd != null) return rawStringEnd;

  const char = text[index];
  const next = text[index + 1];
  if (char === "b" && (next === "\"" || next === "'")) {
    return scanEscapedQuotedLiteral(text, index + 1, next);
  }

  if (char === "\"") return scanEscapedQuotedLiteral(text, index, "\"");
  if (char === "'") return scanRustCharLiteral(text, index);
  return null;
}

function collectRustCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let index = 0;

  while (index < text.length) {
    const literalEnd = scanRustLiteral(text, index);
    if (literalEnd != null) {
      index = literalEnd;
      continue;
    }

    const char = text[index];
    const next = text[index + 1];
    if (char === "/" && next === "/") {
      const end = scanLineComment(text, index);
      ranges.push({ start: index, end, kind: "line" });
      index = end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = scanBlockComment(text, index, true);
      ranges.push({ start: index, end, kind: "block" });
      index = end;
      continue;
    }

    index += 1;
  }

  return ranges;
}

function collectCommentRanges(text: string, extension: string): CommentRange[] {
  if (isTypeScriptFamilyExtension(extension)) return collectTypeScriptCommentRanges(text, extension);
  if (isGoExtension(extension)) return collectGoCommentRanges(text);
  if (isRustExtension(extension)) return collectRustCommentRanges(text);
  if (isStyleExtension(extension)) return collectGoCommentRanges(text);
  return [];
}

export { collectCommentRanges };
export type { CommentRange };
