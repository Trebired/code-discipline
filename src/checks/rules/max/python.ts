type FunctionDescriptor = {
  kind: string;
  lineCount: number;
  name: string;
  startLine: number;
  endLine: number;
};

type PendingPythonFunction = {
  indent: number;
  kind: string;
  name: string;
  startLine: number;
};

type PythonTripleState = {
  quote: "\"\"\"" | "'''" | null;
};

function measurePythonIndent(line: string): number {
  let indent = 0;
  for (const char of line) {
    if (char === " ") indent += 1;
    else if (char === "\t") indent += 8 - indent % 8;
    else break;
  }
  return indent;
}

function findPythonFunctionStart(line: string): PendingPythonFunction | null {
  const match = /^(\s*)(async\s+def|def)\s+([A-Za-z_]\w*)\s*\(/u.exec(line);
  if (!match) return null;
  return {
    indent: measurePythonIndent(match[1] ?? ""),
    kind: match[2] === "def" ? "function" : "async-function",
    name: match[3] ?? "anonymous",
    startLine: 0,
  };
}

function isPythonMeaningfulLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith("#");
}

function closePythonFunctions(
  stack: PendingPythonFunction[],
  descriptors: FunctionDescriptor[],
  currentIndent: number,
  endLine: number,
): void {
  while (stack.length > 0 && currentIndent <= stack[stack.length - 1]!.indent) {
    const pending = stack.pop()!;
    const resolvedEnd = Math.max(pending.startLine, endLine);
    descriptors.push({
      kind: pending.kind,
      lineCount: resolvedEnd - pending.startLine + 1,
      name: pending.name,
      startLine: pending.startLine,
      endLine: resolvedEnd,
    });
  }
}

function updatePythonTripleState(line: string, state: PythonTripleState): void {
  for (let index = 0; index < line.length; index += 1) {
    const triple = line.slice(index, index + 3);
    if (state.quote) {
      if (triple === state.quote) {
        state.quote = null;
        index += 2;
      }
      continue;
    }
    if (line[index] === "#") return;
    if (triple === "\"\"\"" || triple === "'''") {
      state.quote = triple;
      index += 2;
    }
  }
}

function collectPythonFunctionDescriptors(text: string): FunctionDescriptor[] {
  const descriptors: FunctionDescriptor[] = [];
  const stack: PendingPythonFunction[] = [];
  const state: PythonTripleState = { quote: null };
  const lines = text.split(/\r?\n/u);
  let lastMeaningfulLine = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const insideTripleString = state.quote !== null;
    const functionStart = insideTripleString ? null : findPythonFunctionStart(line);
    if (!insideTripleString && isPythonMeaningfulLine(line)) {
      const indent = measurePythonIndent(line);
      closePythonFunctions(stack, descriptors, indent, Math.max(lastMeaningfulLine, index));
      lastMeaningfulLine = index + 1;
    }
    if (functionStart) {
      stack.push({ ...functionStart, startLine: index + 1 });
    }
    updatePythonTripleState(line, state);
  }

  closePythonFunctions(stack, descriptors, -1, lastMeaningfulLine || lines.length);
  return descriptors;
}

export { collectPythonFunctionDescriptors, measurePythonIndent, updatePythonTripleState };
export type { FunctionDescriptor, PythonTripleState };
