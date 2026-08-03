import type { CommentRange } from "./ranges.js";
import { scanEscapedQuotedLiteral } from "./quoted.js";

function scanHashLineComment(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && text[index] !== "\n" && text[index] !== "\r") index += 1;
  return index;
}

function isPythonStringPrefix(value: string): boolean {
  return value.length === 1 && /[bfru]/iu.test(value);
}

function scanPythonStringLiteral(text: string, start: number): number | null {
  let quoteIndex = start;
  if (text[start] !== "\"" && text[start] !== "'") {
    if (!isPythonStringPrefix(text[start] ?? "")) return null;
    while (quoteIndex < text.length && isPythonStringPrefix(text[quoteIndex] ?? "")) quoteIndex += 1;
    if (quoteIndex - start > 3 || (text[quoteIndex] !== "\"" && text[quoteIndex] !== "'")) return null;
  }
  const quote = text[quoteIndex] as "\"" | "'";
  const triple = text.slice(quoteIndex, quoteIndex + 3) === quote.repeat(3);
  if (!triple) return scanEscapedQuotedLiteral(text, quoteIndex, quote);
  let index = quoteIndex + 3;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text.slice(index, index + 3) === quote.repeat(3)) return index + 3;
    index += 1;
  }
  return text.length;
}

function isProtectedPythonHashComment(text: string, start: number): boolean {
  if (start === 0 && text[start + 1] === "!") return true;
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineNumber = text.slice(0, lineStart).split(/\n/u).length;
  if (lineNumber > 2) return false;
  const lineEnd = scanHashLineComment(text, start);
  return /\bcoding[:=]\s*[-\w.]+/u.test(text.slice(start, lineEnd));
}

function collectPythonCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let index = 0;
  while (index < text.length) {
    const literalEnd = scanPythonStringLiteral(text, index);
    if (literalEnd != null) {
      index = literalEnd;
      continue;
    }
    if (text[index] === "#") {
      const end = scanHashLineComment(text, index);
      if (!isProtectedPythonHashComment(text, index)) ranges.push({ start: index, end, kind: "line" });
      index = end;
      continue;
    }
    index += 1;
  }
  return ranges;
}

export { collectPythonCommentRanges };
