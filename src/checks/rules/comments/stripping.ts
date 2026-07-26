import { loadNativeBinding } from "#q6u4pcd984qa";
import { isStyleExtension } from "#87jyjzn68rrk";
import { collectCommentRanges } from "./ranges.js";
import type { CommentRange } from "./ranges.js";

type CommentStripResult = {
  changed: boolean;
  text: string;
  commentCount: number;
  lineComments: number;
  blockComments: number;
};

type CommentStripOptions = {
  exclude?: string[];
};

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
    return { start: lineStart, end: breakEnd, value: "" };
  }

  return {
    start: range.start,
    end: range.end,
    value: range.kind === "line"
      ? ""
      : createBlockCommentReplacement(text.slice(range.start, range.end)),
  };
}

function createEmptyStripResult(text: string): CommentStripResult {
  return {
    changed: false,
    text,
    commentCount: 0,
    lineComments: 0,
    blockComments: 0,
  };
}

function shouldExcludeComment(text: string, range: CommentRange, options: CommentStripOptions): boolean {
  const excludedPatterns = options.exclude ?? [];
  if (excludedPatterns.length === 0) return false;

  const commentText = text.slice(range.start, range.end);
  return excludedPatterns.some((pattern) => pattern.length > 0 && commentText.includes(pattern));
}

function stripCommentsJs(text: string, extension: string, options: CommentStripOptions = {}): CommentStripResult {
  const ranges = collectCommentRanges(text, extension).filter((range) => !shouldExcludeComment(text, range, options));
  if (ranges.length === 0) return createEmptyStripResult(text);

  let rewritten = "";
  let previousEnd = 0;
  let lineComments = 0;
  let blockComments = 0;

  for (const range of ranges) {
    const replacement = resolveCommentReplacement(text, range, previousEnd);
    rewritten += text.slice(previousEnd, replacement.start);
    rewritten += replacement.value;
    previousEnd = replacement.end;

    if (range.kind === "line") lineComments += 1;
    else blockComments += 1;
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

function stripComments(text: string, extension: string, options: CommentStripOptions = {}): CommentStripResult {
  if (isStyleExtension(extension)) {
    return stripCommentsJs(text, extension, options);
  }

  const native = loadNativeBinding();
  if (native) {
    return JSON.parse(native.stripComments(JSON.stringify({
      text,
      extension,
      excludedCommentPatterns: options.exclude ?? [],
    }))) as CommentStripResult;
  }

  return stripCommentsJs(text, extension, options);
}

export { stripComments, stripCommentsJs };
export type { CommentStripOptions, CommentStripResult };
