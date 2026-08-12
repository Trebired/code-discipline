import { scanSlashBlockComment, scanSlashLineComment } from "./c-like.js";
import { scanEscapedQuotedLiteral } from "./quoted.js";
import type { CommentRange } from "./ranges.js";

function scanCsharpVerbatimString(text: string, quoteStart: number): number {
  let index = quoteStart + 1;

  while (index < text.length) {
    if (text[index] === "\"") {
      if (text[index + 1] === "\"") {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }

  return text.length;
}

function scanCsharpString(text: string, index: number): number | null {
  const char = text[index];
  const next = text[index + 1];
  const afterNext = text[index + 2];

  if (char === "@" && next === "\"") return scanCsharpVerbatimString(text, index + 1);
  if (char === "@" && next === "$" && afterNext === "\"") return scanCsharpVerbatimString(text, index + 2);
  if (char === "$" && next === "@" && afterNext === "\"") return scanCsharpVerbatimString(text, index + 2);
  if (char === "$" && next === "\"") return scanEscapedQuotedLiteral(text, index + 1, "\"");
  if (char === "\"" || char === "'") return scanEscapedQuotedLiteral(text, index, char);
  return null;
}

function collectCsharpCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let index = 0;

  while (index < text.length) {
    const stringEnd = scanCsharpString(text, index);
    if (stringEnd != null) {
      index = stringEnd;
      continue;
    }

    const char = text[index];
    const next = text[index + 1];

    if (char === "/" && next === "/") {
      const end = scanSlashLineComment(text, index);
      ranges.push({ start: index, end, kind: "line" });
      index = end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = scanSlashBlockComment(text, index, false);
      ranges.push({ start: index, end, kind: "block" });
      index = end;
      continue;
    }

    index += 1;
  }

  return ranges;
}

export { collectCsharpCommentRanges };
