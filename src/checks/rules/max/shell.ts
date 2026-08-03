type FunctionDescriptor = {
  kind: string;
  lineCount: number;
  name: string;
  startLine: number;
  endLine: number;
};

type PendingShellFunction = {
  braceDepth: number;
  name: string;
  startLine: number;
};

function stripShellStringsAndComments(line: string): string {
  let result = "";
  let single = false;
  let double = false;
  let backtick = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (escaped) {
      escaped = false;
      result += " ";
      continue;
    }
    if (!single && char === "\\") {
      escaped = true;
      result += " ";
      continue;
    }
    if (!double && !backtick && char === "'") single = !single;
    else if (!single && !backtick && char === "\"") double = !double;
    else if (!single && char === "`") backtick = !backtick;
    if (!single && !double && !backtick && char === "#" && hasShellCommentPrefix(line, index)) break;
    result += single || double || backtick ? " " : char;
  }
  return result;
}

function hasShellCommentPrefix(line: string, index: number): boolean {
  const previous = index > 0 ? line.charCodeAt(index - 1) : 0;
  return previous === 0
    || previous === 9
    || previous === 10
    || previous === 13
    || previous === 32
    || previous === 38
    || previous === 40
    || previous === 41
    || previous === 59
    || previous === 123
    || previous === 124
    || previous === 125;
}

function countShellBraceDelta(line: string): number {
  return Array.from(stripShellStringsAndComments(line)).reduce((sum, char) => {
    if (char === "{") return sum + 1;
    if (char === "}") return sum - 1;
    return sum;
  }, 0);
}

function findShellFunctionStart(line: string): string | null {
  const stripped = stripShellStringsAndComments(line);
  const match = /^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*(?:\(\s*\))?\s*\{/u.exec(stripped);
  return match?.[1] ?? null;
}

function createShellDescriptor(pending: PendingShellFunction, endLine: number): FunctionDescriptor {
  return {
    kind: "function",
    lineCount: Math.max(1, endLine - pending.startLine + 1),
    name: pending.name || "anonymous",
    startLine: pending.startLine,
    endLine,
  };
}

function collectShellFunctionDescriptors(text: string): FunctionDescriptor[] {
  const descriptors: FunctionDescriptor[] = [];
  const lines = text.split(/\r?\n/u);
  let pending: PendingShellFunction | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!pending) {
      const name = findShellFunctionStart(line);
      if (!name) continue;
      pending = { braceDepth: 0, name, startLine: index + 1 };
    }
    pending.braceDepth += countShellBraceDelta(line);
    if (pending.braceDepth > 0) continue;
    descriptors.push(createShellDescriptor(pending, index + 1));
    pending = null;
  }

  return descriptors;
}

export { collectShellFunctionDescriptors, stripShellStringsAndComments };
