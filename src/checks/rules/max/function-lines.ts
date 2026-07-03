import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import { loadNativeBinding } from "../../../native/native.js";
import { parseSource } from "../../../imports/module-specifiers.js";
import { isGoExtension, isRustExtension, isTypeScriptFamilyExtension, supportsMaxFunctionLines } from "../../../shared/languages.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";

type FunctionDescriptor = {
  kind: string;
  lineCount: number;
  name: string;
  startLine: number;
  endLine: number;
};

type NativeMaxFunctionLinesResult = {
  violations: CodeDisciplineViolation[];
  handledPaths: string[];
};

type StripState = {
  escaped: boolean;
  inDouble: boolean;
  inSingle: boolean;
  inTemplate: boolean;
};

type PendingBlockFunction = {
  braceDepth: number;
  header: string;
  kind: string;
  name: string;
  startLine: number;
};

function isFunctionLikeWithBody(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    (ts.isFunctionDeclaration(node) && node.body !== undefined)
    || (ts.isMethodDeclaration(node) && node.body !== undefined)
    || (ts.isConstructorDeclaration(node) && node.body !== undefined)
    || (ts.isGetAccessorDeclaration(node) && node.body !== undefined)
    || (ts.isSetAccessorDeclaration(node) && node.body !== undefined)
    || (ts.isFunctionExpression(node) && node.body !== undefined)
    || (ts.isArrowFunction(node) && node.body !== undefined)
  );
}

function resolveFunctionKind(node: ts.FunctionLikeDeclaration): string {
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isGetAccessorDeclaration(node)) return "getter";
  if (ts.isSetAccessorDeclaration(node)) return "setter";
  if (ts.isArrowFunction(node)) return "arrow-function";
  if (ts.isFunctionExpression(node)) return "function-expression";
  return "function";
}

function resolveFunctionName(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string {
  if ("name" in node && node.name) {
    return node.name.getText(sourceFile);
  }

  const parent = node.parent;

  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }

  if (parent && ts.isBinaryExpression(parent) && ts.isIdentifier(parent.left)) {
    return parent.left.text;
  }

  if (parent && ts.isPropertyAssignment(parent)) {
    return parent.name.getText(sourceFile);
  }

  return "anonymous";
}

function describeFunction(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): FunctionDescriptor | null {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
  const lineCount = Math.max(1, endLine - startLine + 1);

  return {
    kind: resolveFunctionKind(node),
    lineCount,
    name: resolveFunctionName(node, sourceFile),
    startLine,
    endLine,
  };
}

function collectTypeScriptFunctionDescriptors(sourceFile: ts.SourceFile): FunctionDescriptor[] {
  const descriptors: FunctionDescriptor[] = [];

  function visit(node: ts.Node) {
    if (isFunctionLikeWithBody(node)) {
      const descriptor = describeFunction(node, sourceFile);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return descriptors;
}

function updateStripState(state: StripState, character: string): void {
  if (state.escaped) {
    state.escaped = false;
    return;
  }

  if ((state.inSingle || state.inDouble || state.inTemplate) && character === "\\") {
    state.escaped = true;
    return;
  }

  if (!state.inDouble && !state.inTemplate && character === "'") state.inSingle = !state.inSingle;
  if (!state.inSingle && !state.inTemplate && character === "\"") state.inDouble = !state.inDouble;
  if (!state.inSingle && !state.inDouble && character === "`") state.inTemplate = !state.inTemplate;
}

function isInString(state: StripState): boolean {
  return state.inSingle || state.inDouble || state.inTemplate;
}

function stripCommentsAndStrings(value: string): string {
  let result = "";
  const state: StripState = {
    escaped: false,
    inDouble: false,
    inSingle: false,
    inTemplate: false,
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    const nextCharacter = value[index + 1];

    if (!isInString(state) && character === "/" && nextCharacter === "/") break;

    if (!isInString(state) && character === "/" && nextCharacter === "*") {
      const closingIndex = value.indexOf("*/", index + 2);
      if (closingIndex < 0) break;
      index = closingIndex + 1;
      continue;
    }

    updateStripState(state, character);
    if (!isInString(state) && !state.escaped) {
      result += character;
    }
  }

  return result;
}

function countBraceDelta(value: string): number {
  const normalized = stripCommentsAndStrings(value);
  let delta = 0;

  for (const character of normalized) {
    if (character === "{") delta += 1;
    if (character === "}") delta -= 1;
  }

  return delta;
}

function createPendingBlockFunction(): PendingBlockFunction {
  return {
    braceDepth: 0,
    header: "",
    kind: "function",
    name: "",
    startLine: 0,
  };
}

function createBlockFunctionDescriptor(pending: PendingBlockFunction, endLine: number): FunctionDescriptor {
  return {
    kind: pending.kind,
    lineCount: Math.max(1, endLine - pending.startLine + 1),
    name: pending.name || "anonymous",
    startLine: pending.startLine,
    endLine,
  };
}

function collectBlockFunctionDescriptors(text: string, extension: string): FunctionDescriptor[] {
  const descriptors: FunctionDescriptor[] = [];
  const lines = text.split(/\r?\n/);
  const isGo = isGoExtension(extension);
  const headerStartPattern = isGo
    ? /^\s*func(?:\s*\([^)]*\))?\s+/u
    : /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?fn\s+/u;
  const headerNamePattern = isGo
    ? /^\s*func(?:\s*\([^)]*\))?\s+([A-Za-z_]\w*)/u
    : /\bfn\s+([A-Za-z_]\w*)/u;
  let pending = createPendingBlockFunction();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!pending.header) {
      if (!headerStartPattern.test(line)) continue;
      pending.header = line;
      pending.startLine = index + 1;
      pending.kind = isGo && /\bfunc\s*\(/u.test(line) ? "method" : "function";
      pending.name = headerNamePattern.exec(line)?.[1] ?? "anonymous";
    } else {
      pending.header = `${pending.header}\n${line}`;
      if (!pending.name || pending.name === "anonymous") {
        pending.name = headerNamePattern.exec(pending.header)?.[1] ?? pending.name;
      }
    }

    if (pending.braceDepth === 0 && !stripCommentsAndStrings(pending.header).includes("{")) {
      continue;
    }

    pending.braceDepth += countBraceDelta(line);
    if (pending.braceDepth > 0) continue;

    descriptors.push(createBlockFunctionDescriptor(pending, index + 1));
    pending = createPendingBlockFunction();
  }

  return descriptors;
}

async function runMaxFunctionLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.maxFunctionLines) return [];

  const violations: CodeDisciplineViolation[] = [];
  const native = loadNativeBinding();
  const nativeHandledPaths = new Set<string>();

  if (native) {
    const nativeResult = JSON.parse(native.runMaxBlockFunctionLinesRule(JSON.stringify({
      sourceFiles,
      max: options.rules.maxFunctionLines.max,
    }))) as NativeMaxFunctionLinesResult;
    violations.push(...nativeResult.violations);
    for (const filePath of nativeResult.handledPaths) nativeHandledPaths.add(filePath);
  }

  for (const file of sourceFiles) {
    if (nativeHandledPaths.has(file.absolutePath)) continue;
    if (!supportsMaxFunctionLines(file.extension)) continue;

    const text = await fs.readFile(file.absolutePath, "utf8");
    const extension = path.extname(file.absolutePath).toLowerCase();
    const functions = isTypeScriptFamilyExtension(extension)
      ? collectTypeScriptFunctionDescriptors(parseSource(text, file.absolutePath))
      : (isGoExtension(extension) || isRustExtension(extension))
        ? collectBlockFunctionDescriptors(text, extension)
        : [];

    for (const descriptor of functions) {
      if (descriptor.lineCount <= options.rules.maxFunctionLines.max) continue;

      violations.push({
        rule: "max-function-lines",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `${descriptor.kind} ${descriptor.name} has ${descriptor.lineCount} lines and exceeds the limit of ${options.rules.maxFunctionLines.max}`,
        details: {
          functionKind: descriptor.kind,
          functionName: descriptor.name,
          lineCount: descriptor.lineCount,
          max: options.rules.maxFunctionLines.max,
          startLine: descriptor.startLine,
          endLine: descriptor.endLine,
        },
      });
    }
  }

  return violations;
}

export { runMaxFunctionLinesRule };
