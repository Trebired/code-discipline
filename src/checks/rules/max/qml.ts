import { maskQmlCommentsAndStrings } from "#x6956eahfhcm";

type FunctionDescriptor = {
  kind: string;
  lineCount: number;
  name: string;
  startLine: number;
  endLine: number;
};

type PendingQmlBlock = {
  braceDepth: number;
  kind: string;
  name: string;
  seenOpeningBrace: boolean;
  startLine: number;
};

function countQmlBraceDelta(line: string): number {
  return Array.from(line).reduce((sum, char) => {
      if (char === "{") return sum + 1;
      if (char === "}") return sum - 1;
      return sum;
    }, 0);
}

function findQmlFunctionStart(line: string, lineNumber: number): PendingQmlBlock | null {
  const declared = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/u.exec(line);
  if (declared) {
    return {
      braceDepth: 0,
      kind: "function",
      name: declared[1] ?? "anonymous",
      seenOpeningBrace: false,
      startLine: lineNumber,
    };
  }

  const assigned = /^\s*(?:property\s+\w+\s+)?([A-Za-z_$][\w$]*)\s*:\s*function\s*\(/u.exec(line);
  if (assigned) {
    return {
      braceDepth: 0,
      kind: "function",
      name: assigned[1] ?? "anonymous",
      seenOpeningBrace: false,
      startLine: lineNumber,
    };
  }

  const handler = /^\s*(on[A-Z][\w$]*)\s*:\s*(?:$|\{|function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/u.exec(line);
  if (!handler) return null;
  return {
    braceDepth: 0,
    kind: "signal-handler",
    name: handler[1] ?? "anonymous",
    seenOpeningBrace: false,
    startLine: lineNumber,
  };
}

function createQmlDescriptor(pending: PendingQmlBlock, endLine: number): FunctionDescriptor {
  return {
    kind: pending.kind,
    lineCount: Math.max(1, endLine - pending.startLine + 1),
    name: pending.name,
    startLine: pending.startLine,
    endLine,
  };
}

function collectQmlFunctionDescriptors(text: string): FunctionDescriptor[] {
  const descriptors: FunctionDescriptor[] = [];
  const lines = maskQmlCommentsAndStrings(text).split(/\r?\n/u);
  let pending: PendingQmlBlock | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!pending) {
      pending = findQmlFunctionStart(line, index + 1);
      if (!pending) continue;
    }

    if (line.includes("{")) pending.seenOpeningBrace = true;
    pending.braceDepth += countQmlBraceDelta(line);
    if (!pending.seenOpeningBrace || pending.braceDepth > 0) continue;
    descriptors.push(createQmlDescriptor(pending, index + 1));
    pending = null;
  }

  if (pending?.seenOpeningBrace) {
    descriptors.push(createQmlDescriptor(pending, lines.length));
  }

  return descriptors;
}

export { collectQmlFunctionDescriptors };
