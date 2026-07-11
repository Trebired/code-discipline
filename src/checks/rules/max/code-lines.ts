import { collectCommentRanges } from "../comments/ranges.js";

function countPhysicalLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

function maskCommentsForLineCounting(text: string, extension: string): string {
  const ranges = collectCommentRanges(text, extension);
  if (ranges.length === 0) return text;

  let rewritten = "";
  let previousEnd = 0;

  for (const range of ranges) {
    rewritten += text.slice(previousEnd, range.start);
    rewritten += text.slice(range.start, range.end).replace(/[^\r\n]/g, " ");
    previousEnd = range.end;
  }

  rewritten += text.slice(previousEnd);
  return rewritten;
}

function countCodeLines(maskedText: string): number {
  if (maskedText.length === 0) return 0;
  return maskedText.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function countCodeLinesInRange(maskedText: string, startLine: number, endLine: number): number {
  if (maskedText.length === 0) return 0;

  let count = 0;
  const lines = maskedText.split(/\r?\n/);
  for (let index = startLine - 1; index < Math.min(lines.length, endLine); index += 1) {
    if ((lines[index] ?? "").trim().length > 0) count += 1;
  }
  return count;
}

export {
  countCodeLines,
  countCodeLinesInRange,
  countPhysicalLines,
  maskCommentsForLineCounting,
};
