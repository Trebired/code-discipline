import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { loadNativeBinding } from "#q6u4pcd984qa";
import { collectWithParseFailure } from "#lvwwpxtj6az5";
import { parseSource } from "#27pccnhol1ci";
import {
  isCppExtension,
  isCsharpExtension,
  isGoExtension,
  isPythonExtension,
  isQmlExtension,
  isRustExtension,
  isShellExtension,
  isTypeScriptFamilyExtension,
  supportsMaxFunctionLines,
} from "#87jyjzn68rrk";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { getEndLine, getStartLine, isFunctionLikeWithBody, resolveFunctionKind, resolveFunctionName } from "#hrlcdim1gtmi";
import { countCodeLinesInRange, maskCommentsForLineCounting } from "./code-lines.js";
import { collectPythonFunctionDescriptors } from "./python.js";
import { collectQmlFunctionDescriptors } from "./qml.js";
import { collectShellFunctionDescriptors } from "./shell.js";
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

function stripRustLifetimeTokens(value: string): string {
  return value.replace(/'[A-Za-z_]\w*/gu, (match) => " ".repeat(match.length));
}

function stripCommentsAndStringsForExtension(value: string, extension: string): string {
  return stripCommentsAndStrings(isRustExtension(extension) ? stripRustLifetimeTokens(value) : value);
}

function countBraceDelta(value: string, extension: string): number {
  const normalized = stripCommentsAndStringsForExtension(value, extension);
  let delta = 0;

  for (const character of normalized) {
    if (character === "{") delta += 1;
    if (character === "}") delta -= 1;
  }

  return delta;
}

const C_FAMILY_HEADER_EXCLUDED_LEADING_WORDS = new Set([
    "if", "else", "for", "while", "do", "switch", "case", "default", "catch", "try", "finally",
    "using", "lock", "foreach", "fixed", "checked", "unchecked", "namespace", "class", "struct",
    "enum", "interface", "return", "throw", "new", "delete", "goto", "break", "continue",
]);

function isCFamilyHeaderStart(line: string): boolean {
  const trimmed = stripCommentsAndStrings(line).trim();
  if (!trimmed || trimmed.endsWith(";") || trimmed.endsWith(":")) return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("[") || trimmed.startsWith("@")) return false;
  if (!trimmed.includes("(")) return false;

  const leadingWord = /[A-Za-z_]\w*/u.exec(trimmed)?.[0] ?? "";
  return !C_FAMILY_HEADER_EXCLUDED_LEADING_WORDS.has(leadingWord);
}

function extractCFamilyFunctionName(header: string): string {
  const stripped = stripCommentsAndStrings(header);
  const parenIndex = stripped.indexOf("(");
  if (parenIndex === -1) return "anonymous";
  return /[A-Za-z_]\w*$/u.exec(stripped.slice(0, parenIndex))?.[0] ?? "anonymous";
}

function stripRustKeyword(value: string, keyword: string): string | null {
  if (!value.startsWith(keyword)) return null;
  const next = value[keyword.length] ?? "";
  return next && /[A-Za-z0-9_]/u.test(next) ? null : value.slice(keyword.length);
}

function stripRustVisibility(value: string): string | null {
  if (value.startsWith("pub(")) {
    const rest = value.slice(4);
    const end = rest.indexOf(")");
    return end === -1 ? null : rest.slice(end + 1);
  }
  return stripRustKeyword(value, "pub");
}

function stripRustAbi(value: string): string {
  if (!value.startsWith("\"")) return value;
  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") return value.slice(index + 1);
  }
  return value;
}

function isRustFunctionHeaderStart(line: string): boolean {
  let rest = stripCommentsAndStringsForExtension(line, ".rs").trimStart();
  if (!rest || rest.startsWith("#")) return false;

  rest = stripRustVisibility(rest)?.trimStart() ?? rest;

  while (true) {
    const asyncRest = stripRustKeyword(rest, "async");
    if (asyncRest != null) {
      rest = asyncRest.trimStart();
      continue;
    }
    const unsafeRest = stripRustKeyword(rest, "unsafe");
    if (unsafeRest != null) {
      rest = unsafeRest.trimStart();
      continue;
    }
    const constRest = stripRustKeyword(rest, "const");
    if (constRest != null) {
      rest = constRest.trimStart();
      continue;
    }
    const externRest = stripRustKeyword(rest, "extern");
    if (externRest != null) {
      rest = stripRustAbi(externRest.trimStart()).trimStart();
      continue;
    }
    break;
  }

  return stripRustKeyword(rest, "fn") != null;
}

function pendingRustHeaderEndedWithoutBody(header: string, extension: string): boolean {
  if (!isRustExtension(extension)) return false;
  const normalized = stripCommentsAndStringsForExtension(header, extension);
  const beforeBody = normalized.split("{", 1)[0] ?? normalized;
  return !normalized.includes("{") && beforeBody.trimEnd().endsWith(";");
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
  const isCFamily = isCppExtension(extension) || isCsharpExtension(extension);
  const isRust = isRustExtension(extension);
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
      const isHeaderStart = isCFamily ? isCFamilyHeaderStart(line) : isRust ? isRustFunctionHeaderStart(line) : headerStartPattern.test(line);
      if (!isHeaderStart) continue;
      pending.header = line;
      pending.startLine = index + 1;
      pending.kind = isGo && /\bfunc\s*\(/u.test(line) ? "method" : "function";
      pending.name = isCFamily ? extractCFamilyFunctionName(pending.header) : (headerNamePattern.exec(line)?.[1] ?? "anonymous");
    } else {
      pending.header = `${pending.header}\n${line}`;
      if (!pending.name || pending.name === "anonymous") {
        pending.name = isCFamily
        ? extractCFamilyFunctionName(pending.header)
        : (headerNamePattern.exec(pending.header)?.[1] ?? pending.name);
      }
    }

    if (pendingRustHeaderEndedWithoutBody(pending.header, extension)) {
      pending = createPendingBlockFunction();
      continue;
    }

    if (pending.braceDepth === 0 && !stripCommentsAndStringsForExtension(pending.header, extension).includes("{")) {
      continue;
    }

    pending.braceDepth += countBraceDelta(line, extension);
    if (pending.braceDepth > 0) continue;

    descriptors.push(createBlockFunctionDescriptor(pending, index + 1));
    pending = createPendingBlockFunction();
  }

  return descriptors;
}

function collectLanguageFunctionDescriptors(text: string, extension: string, filePath: string): FunctionDescriptor[] {
  if (isTypeScriptFamilyExtension(extension)) return collectTypeScriptFunctionDescriptors(parseSource(text, filePath));
  if (isGoExtension(extension) || isRustExtension(extension) || isCppExtension(extension) || isCsharpExtension(extension)) {
    return collectBlockFunctionDescriptors(text, extension);
  }
  if (isPythonExtension(extension)) return collectPythonFunctionDescriptors(text);
  if (isShellExtension(extension)) return collectShellFunctionDescriptors(text);
  if (isQmlExtension(extension)) return collectQmlFunctionDescriptors(text);
  return [];
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
    const functions = await collectWithParseFailure(
      "max-function-lines",
      file.relativeFromProjectRoot,
      violations,
      () => collectLanguageFunctionDescriptors(text, extension, file.absolutePath),
    );

    for (const descriptor of functions ?? []) {
      const codeLineCount = countCodeLinesInRange(maskedText, descriptor.startLine, descriptor.endLine);
      const physicalLineCount = descriptor.lineCount;
      if (codeLineCount > options.rules.maxFunctionLines.max) {
        const message = `${descriptor.kind} ${descriptor.name} has ${codeLineCount} lines `
        +`and exceeds the limit of ${options.rules.maxFunctionLines.max}`;
        violations.push({
            rule: "max-function-lines",
            fix: false,
            filePath: file.relativeFromProjectRoot,
            message,
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
        const message = `${descriptor.kind} ${descriptor.name} has ${physicalLineCount} physical lines, `
        +`but only ${codeLineCount} code lines count toward the limit of ${options.rules.maxFunctionLines.max}`;
        violations.push({
            rule: "max-function-lines",
            fix: false,
            filePath: file.relativeFromProjectRoot,
            severity: "warning",
            message,
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

export { collectLanguageFunctionDescriptors, runMaxFunctionLinesRule };
export type { FunctionDescriptor };
