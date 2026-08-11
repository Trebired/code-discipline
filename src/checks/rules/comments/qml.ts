import type { CommentRange } from "./ranges.js";
import { scanSlashBlockComment, scanSlashLineComment } from "./c-like.js";
import { scanEscapedQuotedLiteral } from "./quoted.js";

const REGEX_PREFIX_CHARS = new Set(["(", "[", "{", ":", ",", ";", "=", "!", "?", "&", "|", "+", "-", "*", "~", "^", "<", ">"]);
const REGEX_PREFIX_WORDS = new Set(["case", "delete", "in", "new", "of", "return", "throw", "typeof", "void", "yield"]);

function scanTemplateLiteral(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === "`") return index + 1;
    index += 1;
  }
  return text.length;
}

function previousSignificantIndex(text: string, start: number): number {
  let index = start - 1;
  while (index >= 0 && /\s/u.test(text[index] ?? "")) index -= 1;
  return index;
}

function previousWord(text: string, end: number): string {
  let index = end;
  while (index >= 0 && /[$\w]/u.test(text[index] ?? "")) index -= 1;
  return text.slice(index + 1, end + 1);
}

function canStartRegexLiteral(text: string, start: number): boolean {
  const previousIndex = previousSignificantIndex(text, start);
  if (previousIndex < 0) return true;
  const previous = text[previousIndex] ?? "";
  if (REGEX_PREFIX_CHARS.has(previous)) return true;
  if (/[$\w]/u.test(previous)) return REGEX_PREFIX_WORDS.has(previousWord(text, previousIndex));
  return false;
}

function scanRegexLiteral(text: string, start: number): number | null {
  if (!canStartRegexLiteral(text, start)) return null;
  let index = start + 1;
  let inCharacterClass = false;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === "\n" || char === "\r") return null;
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "[") inCharacterClass = true;
    else if (char === "]") inCharacterClass = false;
    else if (char === "/" && !inCharacterClass) {
      index += 1;
      while (/[$\w]/u.test(text[index] ?? "")) index += 1;
      return index;
    }
    index += 1;
  }
  return null;
}

function scanQmlLiteral(text: string, start: number): number | null {
  const char = text[start];
  if (char === "\"" || char === "'") return scanEscapedQuotedLiteral(text, start, char);
  if (char === "`") return scanTemplateLiteral(text, start);
  if (char === "/" && text[start + 1] !== "/" && text[start + 1] !== "*") return scanRegexLiteral(text, start);
  return null;
}

function collectQmlCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let index = 0;
  while (index < text.length) {
    const literalEnd = scanQmlLiteral(text, index);
    if (literalEnd != null) {
      index = literalEnd;
      continue;
    }
    if (text[index] === "/" && text[index + 1] === "/") {
      const end = scanSlashLineComment(text, index);
      ranges.push({ start: index, end, kind: "line" });
      index = end;
      continue;
    }
    if (text[index] === "/" && text[index + 1] === "*") {
      const end = scanSlashBlockComment(text, index, false);
      ranges.push({ start: index, end, kind: "block" });
      index = end;
      continue;
    }
    index += 1;
  }
  return ranges;
}

function maskQmlCommentsAndStrings(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const literalEnd = scanQmlLiteral(text, index);
    const commentEnd = literalEnd == null && text[index] === "/" && text[index + 1] === "/"
    ? scanSlashLineComment(text, index)
    : literalEnd == null && text[index] === "/" && text[index + 1] === "*"
    ? scanSlashBlockComment(text, index, false)
    : null;
    const end = literalEnd ?? commentEnd;
    if (end != null) {
      result += text.slice(index, end).replace(/[^\r\n]/gu, " ");
      index = end;
      continue;
    }
    result += text[index] ?? "";
    index += 1;
  }
  return result;
}

export { collectQmlCommentRanges, maskQmlCommentsAndStrings };
