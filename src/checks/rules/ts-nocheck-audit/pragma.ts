const TS_NOCHECK_LINE_PATTERN = /^\/\/\s*@ts-nocheck(?:\s.*)?$/;

type PragmaLineRange = {
  start: number;
  end: number;
};

function findLeadingTsNocheckLine(text: string): PragmaLineRange | null {
  let cursor = 0;

  if (text.startsWith("#!")) {
    const shebangEnd = text.indexOf("\n");
    cursor = shebangEnd === -1 ? text.length : shebangEnd + 1;
  }

  while (cursor < text.length) {
    const newlineIndex = text.indexOf("\n", cursor);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;
    const line = text.slice(cursor, lineEnd);

    if (line.trim() === "") {
      cursor = newlineIndex === -1 ? text.length : newlineIndex + 1;
      continue;
    }

    if (TS_NOCHECK_LINE_PATTERN.test(line.trim())) {
      return { start: cursor, end: newlineIndex === -1 ? text.length : newlineIndex + 1 };
    }

    return null;
  }

  return null;
}

function removeLeadingTsNocheckLine(text: string): { text: string; removed: boolean } {
  const range = findLeadingTsNocheckLine(text);
  if (!range) return { text, removed: false };

  return {
    text: text.slice(0, range.start) + text.slice(range.end),
    removed: true,
  };
}

export { findLeadingTsNocheckLine, removeLeadingTsNocheckLine };
export type { PragmaLineRange };
