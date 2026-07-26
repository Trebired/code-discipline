import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { loadNativeBinding } from "#q6u4pcd984qa";
import { parseSource } from "#27pccnhol1ci";
import { isGoExtension, isRustExtension, isTypeScriptFamilyExtension, supportsMaxFunctionLines } from "#87jyjzn68rrk";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { getEndLine, getStartLine, isFunctionLikeWithBody, resolveFunctionKind, resolveFunctionName } from "#hrlcdim1gtmi";
import { countCodeLinesInRange, maskCommentsForLineCounting } from "./code-lines.js";
import { stripCommentsAndStrings } from "./strip.js";

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

type PendingBlockFunction = {
  braceDepth: number;
  header: string;
  kind: string;
  name: string;
  startLine: number;
};

function describeLineLimitedFunction(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): FunctionDescriptor | null {
  const startLine = getStartLine(sourceFile, node);
  const endLine = getEndLine(sourceFile, node);
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
      const descriptor = describeLineLimitedFunction(node, sourceFile);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return descriptors;
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
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "max-function-lines",
    totalItems: sourceFiles.length,
  });
  const native = loadNativeBinding();
  const nativeHandledPaths = new Set<string>();

  if (native) {
    const nativeResult = JSON.parse(native.runMaxBlockFunctionLinesRule(JSON.stringify({
      sourceFiles,
      max: options.rules.maxFunctionLines.max,
      warning: true,
    }))) as NativeMaxFunctionLinesResult;
    violations.push(...nativeResult.violations);
    for (const filePath of nativeResult.handledPaths) nativeHandledPaths.add(filePath);
  }

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (nativeHandledPaths.has(file.absolutePath) || !supportsMaxFunctionLines(file.extension)) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    const text = await fs.readFile(file.absolutePath, "utf8");
    const extension = path.extname(file.absolutePath).toLowerCase();
    const maskedText = maskCommentsForLineCounting(text, extension);
    const functions = isTypeScriptFamilyExtension(extension)
      ? collectTypeScriptFunctionDescriptors(parseSource(text, file.absolutePath))
      : (isGoExtension(extension) || isRustExtension(extension))
        ? collectBlockFunctionDescriptors(text, extension)
        : [];

    for (const descriptor of functions) {
      const codeLineCount = countCodeLinesInRange(maskedText, descriptor.startLine, descriptor.endLine);
      const physicalLineCount = descriptor.lineCount;
      if (codeLineCount > options.rules.maxFunctionLines.max) {
        violations.push({
          rule: "max-function-lines",
          fix: false,
          filePath: file.relativeFromProjectRoot,
          message: `${descriptor.kind} ${descriptor.name} has ${codeLineCount} lines and exceeds the limit of ${options.rules.maxFunctionLines.max}`,
          details: {
            functionKind: descriptor.kind,
            functionName: descriptor.name,
            lineCount: codeLineCount,
            max: options.rules.maxFunctionLines.max,
            startLine: descriptor.startLine,
            endLine: descriptor.endLine,
          },
        });
        continue;
      }

      if (physicalLineCount > options.rules.maxFunctionLines.max) {
        violations.push({
          rule: "max-function-lines",
          fix: false,
          filePath: file.relativeFromProjectRoot,
          severity: "warning",
          message: `${descriptor.kind} ${descriptor.name} has ${physicalLineCount} physical lines, but only ${codeLineCount} code lines count toward the limit of ${options.rules.maxFunctionLines.max}`,
          details: {
            functionKind: descriptor.kind,
            functionName: descriptor.name,
            lineCount: physicalLineCount,
            codeLineCount,
            max: options.rules.maxFunctionLines.max,
            startLine: descriptor.startLine,
            endLine: descriptor.endLine,
          },
        });
      }
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { runMaxFunctionLinesRule };
