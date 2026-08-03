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

export { scanEscapedQuotedLiteral };
