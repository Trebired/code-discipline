import ts from "typescript";

import { isGoExtension, isRustExtension, isTypeScriptFamilyExtension } from "../../shared/languages.js";

type CommentKind = "line" | "block";

type CommentRange = {
  start: number;
  end: number;
  kind: CommentKind;
};

type CommentStripResult = {
  changed: boolean;
  text: string;
  commentCount: number;
  lineComments: number;
  blockComments: number;
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

    ranges.push({
      start: scanner.getTokenPos(),
      end: scanner.getTextPos(),
      kind,
    });
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
    if (char === quote) {
      return index;
    }
  }

  return text.length;
}

function scanBacktickLiteral(text: string, start: number): number {
  let index = start + 1;

  while (index < text.length) {
    if (text[index] === "`") {
      return index + 1;
    }
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
      if (depth === 0) {
        return index;
      }
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
    if (text[index] === "\"") {
      let matched = true;
      for (let hashIndex = 0; hashIndex < hashCount; hashIndex += 1) {
        if (text[index + 1 + hashIndex] !== "#") {
          matched = false;
          break;
        }
      }

      if (matched) {
        return index + 1 + hashCount;
      }
    }

    index += 1;
  }

  return text.length;
}

function scanRustCharLiteral(text: string, start: number): number | null {
  let index = start + 1;

  if (index >= text.length || text[index] === "\n" || text[index] === "\r") {
    return null;
  }

  if (text[index] === "\\") {
    index += 1;

    if (index >= text.length) return text.length;

    if (text[index] === "u" && text[index + 1] === "{") {
      index += 2;
      while (index < text.length && text[index] !== "}") {
        index += 1;
      }

      if (index < text.length) {
        index += 1;
      }
    } else {
      index += 1;
    }
  } else {
    index += 1;
  }

  return text[index] === "'" ? index + 1 : null;
}

function collectRustCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let index = 0;

  while (index < text.length) {
    const rawStringEnd = scanRustRawString(text, index);
    if (rawStringEnd != null) {
      index = rawStringEnd;
      continue;
    }

    const char = text[index];
    const next = text[index + 1];

    if (char === "b" && (next === "\"" || next === "'")) {
      index = scanEscapedQuotedLiteral(text, index + 1, next);
      continue;
    }

    if (char === "\"") {
      index = scanEscapedQuotedLiteral(text, index, "\"");
      continue;
    }

    if (char === "'") {
      const charLiteralEnd = scanRustCharLiteral(text, index);
      if (charLiteralEnd != null) {
        index = charLiteralEnd;
        continue;
      }
    }

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
  if (isTypeScriptFamilyExtension(extension)) {
    return collectTypeScriptCommentRanges(text, extension);
  }

  if (isGoExtension(extension)) {
    return collectGoCommentRanges(text);
  }

  if (isRustExtension(extension)) {
    return collectRustCommentRanges(text);
  }

  return [];
}

function createBlockCommentReplacement(commentText: string): string {
  const newlineOnly = commentText.replace(/[^\r\n]/g, "");
  return newlineOnly.length > 0 ? newlineOnly : " ";
}

function findLineStart(text: string, index: number): number {
  const previousNewline = text.lastIndexOf("\n", Math.max(0, index - 1));
  return previousNewline < 0 ? 0 : previousNewline + 1;
}

function findLineEnd(text: string, index: number): { contentEnd: number; breakEnd: number } {
  const newline = text.indexOf("\n", index);
  const breakEnd = newline < 0 ? text.length : newline + 1;
  const contentEnd = newline > 0 && text[newline - 1] === "\r"
    ? newline - 1
    : newline < 0
      ? text.length
      : newline;

  return { contentEnd, breakEnd };
}

function resolveCommentReplacement(text: string, range: CommentRange, previousEnd: number): {
  start: number;
  end: number;
  value: string;
} {
  const lineStart = findLineStart(text, range.start);
  const { contentEnd, breakEnd } = findLineEnd(text, range.end);
  const prefix = text.slice(lineStart, range.start);
  const suffix = text.slice(range.end, contentEnd);

  if (lineStart >= previousEnd && prefix.trim() === "" && suffix.trim() === "") {
    return {
      start: lineStart,
      end: breakEnd,
      value: "",
    };
  }

  return {
    start: range.start,
    end: range.end,
    value: range.kind === "line"
      ? ""
      : createBlockCommentReplacement(text.slice(range.start, range.end)),
  };
}

function stripComments(text: string, extension: string): CommentStripResult {
  const ranges = collectCommentRanges(text, extension);

  if (ranges.length === 0) {
    return {
      changed: false,
      text,
      commentCount: 0,
      lineComments: 0,
      blockComments: 0,
    };
  }

  let rewritten = "";
  let previousEnd = 0;
  let lineComments = 0;
  let blockComments = 0;

  for (const range of ranges) {
    const replacement = resolveCommentReplacement(text, range, previousEnd);
    rewritten += text.slice(previousEnd, replacement.start);
    rewritten += replacement.value;
    previousEnd = replacement.end;

    if (range.kind === "line") {
      lineComments += 1;
    } else {
      blockComments += 1;
    }
  }

  rewritten += text.slice(previousEnd);

  return {
    changed: rewritten !== text,
    text: rewritten,
    commentCount: ranges.length,
    lineComments,
    blockComments,
  };
}

export { stripComments };
export type { CommentStripResult };
