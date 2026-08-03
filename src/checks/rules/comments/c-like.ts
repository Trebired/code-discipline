function scanSlashLineComment(text: string, start: number): number {
  let index = start + 2;
  while (index < text.length && text[index] !== "\n" && text[index] !== "\r") index += 1;
  return index;
}

function scanSlashBlockComment(text: string, start: number, nested: boolean): number {
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

export { scanSlashBlockComment, scanSlashLineComment };
