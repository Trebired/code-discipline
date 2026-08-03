import type { CommentRange } from "./ranges.js";

type ShellHeredoc = {
  delimiter: string;
  stripTabs: boolean;
};

function isShellCommentBoundary(line: string, index: number): boolean {
  if (index === 0) return true;
  return /[\s;&|(){}]/u.test(line[index - 1] ?? "");
}

function shellCommentStart(line: string): number | null {
  let single = false;
  let double = false;
  let backtick = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (!single && char === "\\") {
      escaped = true;
      continue;
    }
    if (!double && !backtick && char === "'") single = !single;
    else if (!single && !backtick && char === "\"") double = !double;
    else if (!single && char === "`") backtick = !backtick;
    else if (!single && !double && !backtick && char === "#" && isShellCommentBoundary(line, index)) return index;
  }
  return null;
}

function parseShellHeredocWord(line: string, start: number, limit: number): string {
  const quote = line[start];
  if (quote === "\"" || quote === "'") {
    const end = line.indexOf(quote, start + 1);
    return end > start && end <= limit ? line.slice(start + 1, end) : "";
  }
  let end = start;
  while (end < limit && !/[\s;&|()<>]/u.test(line[end] ?? "")) end += 1;
  return line.slice(start, end);
}

function shellHeredocDelimiter(line: string, limit: number): ShellHeredoc | null {
  let single = false;
  let double = false;
  for (let index = 0; index < limit - 1; index += 1) {
    const char = line[index] ?? "";
    if (!double && char === "'") single = !single;
    else if (!single && char === "\"") double = !double;
    if (single || double || char !== "<" || line[index + 1] !== "<") continue;
    let cursor = index + 2;
    const stripTabs = line[cursor] === "-";
    if (stripTabs) cursor += 1;
    while (cursor < limit && /\s/u.test(line[cursor] ?? "")) cursor += 1;
    const delimiter = parseShellHeredocWord(line, cursor, limit);
    if (delimiter) return { delimiter, stripTabs };
  }
  return null;
}

function collectShellCommentRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let lineStart = 0;
  let heredoc: ShellHeredoc | null = null;
  while (lineStart <= text.length) {
    const newline = text.indexOf("\n", lineStart);
    const contentEnd = newline > 0 && text[newline - 1] === "\r" ? newline - 1 : newline < 0 ? text.length : newline;
    const line = text.slice(lineStart, contentEnd);
    if (heredoc) {
      if ((heredoc.stripTabs ? line.replace(/^\t+/u, "") : line).trimEnd() === heredoc.delimiter) heredoc = null;
    } else {
      const commentStart = shellCommentStart(line);
      const limit = commentStart ?? line.length;
      if (!(lineStart === 0 && line.startsWith("#!")) && commentStart != null) {
        ranges.push({ start: lineStart + commentStart, end: contentEnd, kind: "line" });
      }
      heredoc = shellHeredocDelimiter(line, limit);
    }
    if (newline < 0) break;
    lineStart = newline + 1;
  }
  return ranges;
}

export { collectShellCommentRanges };
