import fs from "node:fs/promises";

import ts from "typescript";

import type { ScannedSourceFile } from "../../imports/types.js";
import { parseSource } from "../../imports/module-specifiers.js";
import type { CodeDisciplineViolation } from "../../shared/discipline-types.js";
import { isTypeScriptFamilyExtension } from "../../shared/languages.js";
import type { NormalizedCheckCodeDisciplineOptions } from "../types.js";

type PackedLineStats = {
  columnCount: number;
  semicolonCount: number;
  structuralTokenCount: number;
};

type FunctionDescriptor = {
  characterCount: number;
  kind: string;
  lineCount: number;
  name: string;
  startLine: number;
  statementCount: number;
};

function stripCommentsAndStrings(text: string): string {
  let result = "";
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inBlockComment = false;
  let inLineComment = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    const nextCharacter = text[index + 1] ?? "";

    if (inLineComment) {
      if (character === "\n") {
        inLineComment = false;
        result += "\n";
      } else {
        result += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (character === "*" && nextCharacter === "/") {
        inBlockComment = false;
        result += "  ";
        index += 1;
      } else {
        result += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate && character === "/" && nextCharacter === "/") {
      inLineComment = true;
      result += "  ";
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate && character === "/" && nextCharacter === "*") {
      inBlockComment = true;
      result += "  ";
      index += 1;
      continue;
    }

    if (escaped) {
      escaped = false;
      result += " ";
      continue;
    }

    if ((inSingle || inDouble || inTemplate) && character === "\\") {
      escaped = true;
      result += " ";
      continue;
    }

    if (!inDouble && !inTemplate && character === "'") {
      inSingle = !inSingle;
      result += " ";
      continue;
    }

    if (!inSingle && !inTemplate && character === "\"") {
      inDouble = !inDouble;
      result += " ";
      continue;
    }

    if (!inSingle && !inDouble && character === "`") {
      inTemplate = !inTemplate;
      result += " ";
      continue;
    }

    result += inSingle || inDouble || inTemplate
      ? character === "\n" ? "\n" : " "
      : character;
  }

  return result;
}

function countStructuralTokens(text: string): number {
  let count = 0;

  for (const character of text) {
    if ("{}()[],:?=>".includes(character)) {
      count += 1;
    }
  }

  return count;
}

function getPackedLineStats(rawLine: string, strippedLine: string): PackedLineStats {
  return {
    columnCount: rawLine.length,
    semicolonCount: (strippedLine.match(/;/gu) ?? []).length,
    structuralTokenCount: countStructuralTokens(strippedLine),
  };
}

function getStartLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getLineCount(sourceFile: ts.SourceFile, node: ts.Node): number {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
  return Math.max(1, endLine - startLine + 1);
}

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

function countExecutableStatements(node: ts.Node): number {
  let count = 0;

  function visit(child: ts.Node) {
    if (ts.isStatement(child) && !ts.isBlock(child)) {
      count += 1;
    }

    ts.forEachChild(child, visit);
  }

  ts.forEachChild(node, visit);
  return count;
}

function describeFunction(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): FunctionDescriptor {
  const body = node.body;
  const statementCount = body && ts.isBlock(body)
    ? countExecutableStatements(body)
    : 1;

  return {
    characterCount: node.getText(sourceFile).length,
    kind: resolveFunctionKind(node),
    lineCount: getLineCount(sourceFile, node),
    name: resolveFunctionName(node, sourceFile),
    startLine: getStartLine(sourceFile, node),
    statementCount,
  };
}

function collectFunctionDescriptors(sourceFile: ts.SourceFile): FunctionDescriptor[] {
  const descriptors: FunctionDescriptor[] = [];

  function visit(node: ts.Node) {
    if (isFunctionLikeWithBody(node)) {
      descriptors.push(describeFunction(node, sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return descriptors;
}

function isStringLike(node: ts.Node | undefined): node is ts.StringLiteralLike {
  return Boolean(node && ts.isStringLiteralLike(node));
}

function getExpressionName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return null;
}

function collectRuntimeCodeHidingViolations(
  file: ScannedSourceFile,
  sourceFile: ts.SourceFile,
): CodeDisciplineViolation[] {
  const violations: CodeDisciplineViolation[] = [];

  function add(kind: string, node: ts.Node) {
    violations.push({
      rule: "evasion-guards",
      fix: false,
      filePath: file.relativeFromProjectRoot,
      message: `runtime code hiding detected via ${kind}`,
      details: {
        kind: "runtime-code-hiding",
        pattern: kind,
        line: getStartLine(sourceFile, node),
      },
    });
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const name = getExpressionName(node.expression);
      const [firstArg] = node.arguments;

      if (name === "eval" && isStringLike(firstArg)) {
        add("eval", node);
      }

      if (name === "Function" && isStringLike(firstArg)) {
        add("Function", node);
      }

      if ((name === "setTimeout" || name === "setInterval") && isStringLike(firstArg)) {
        add(name, node);
      }
    }

    if (ts.isNewExpression(node) && getExpressionName(node.expression) === "Function" && isStringLike(node.arguments?.[0])) {
      add("new Function", node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

async function runEvasionGuardsRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.evasionGuards;
  if (!rule) return [];

  const violations: CodeDisciplineViolation[] = [];

  for (const file of sourceFiles) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const strippedText = stripCommentsAndStrings(text);

    if (rule.packedCode) {
      const rawLines = text.split(/\r?\n/u);
      const strippedLines = strippedText.split(/\r?\n/u);
      const nonEmptyLineCount = rawLines.filter((line) => line.trim().length > 0).length;
      const fileStructuralTokenCount = countStructuralTokens(strippedText);

      if (
        nonEmptyLineCount <= rule.packedCode.maxPackedFileNonEmptyLines
        && text.length >= rule.packedCode.minPackedFileCharacters
        && fileStructuralTokenCount >= rule.packedCode.minPackedFileStructuralTokens
      ) {
        violations.push({
          rule: "evasion-guards",
          fix: false,
          filePath: file.relativeFromProjectRoot,
          message: `file appears packed into ${nonEmptyLineCount} non-empty line(s)`,
          details: {
            kind: "packed-file",
            nonEmptyLineCount,
            characterCount: text.length,
            structuralTokenCount: fileStructuralTokenCount,
            maxNonEmptyLines: rule.packedCode.maxPackedFileNonEmptyLines,
            minCharacters: rule.packedCode.minPackedFileCharacters,
            minStructuralTokens: rule.packedCode.minPackedFileStructuralTokens,
          },
        });
      }

      for (let index = 0; index < rawLines.length; index += 1) {
        const rawLine = rawLines[index] ?? "";
        const strippedLine = strippedLines[index] ?? "";
        const stats = getPackedLineStats(rawLine, strippedLine);

        if (
          stats.columnCount >= rule.packedCode.minPackedLineColumns
          && (
            stats.semicolonCount > rule.packedCode.maxSemicolonsPerLine
            || stats.structuralTokenCount > rule.packedCode.maxStructuralTokensPerLine
          )
        ) {
          violations.push({
            rule: "evasion-guards",
            fix: false,
            filePath: file.relativeFromProjectRoot,
            message: `line ${index + 1} appears packed to avoid line-count rules`,
            details: {
              kind: "packed-line",
              line: index + 1,
              columnCount: stats.columnCount,
              semicolonCount: stats.semicolonCount,
              structuralTokenCount: stats.structuralTokenCount,
              minColumns: rule.packedCode.minPackedLineColumns,
              maxSemicolons: rule.packedCode.maxSemicolonsPerLine,
              maxStructuralTokens: rule.packedCode.maxStructuralTokensPerLine,
            },
          });
        }
      }
    }

    if (!isTypeScriptFamilyExtension(file.extension)) continue;

    const sourceFile = parseSource(text, file.absolutePath);

    if (rule.packedCode) {
      for (const descriptor of collectFunctionDescriptors(sourceFile)) {
        if (
          descriptor.lineCount <= rule.packedCode.maxPackedFunctionLines
          && descriptor.statementCount > rule.packedCode.maxPackedFunctionStatements
          && descriptor.characterCount >= rule.packedCode.minPackedFunctionCharacters
        ) {
          violations.push({
            rule: "evasion-guards",
            fix: false,
            filePath: file.relativeFromProjectRoot,
            message: `${descriptor.kind} ${descriptor.name} appears packed into ${descriptor.lineCount} line(s)`,
            details: {
              kind: "packed-function",
              functionKind: descriptor.kind,
              functionName: descriptor.name,
              line: descriptor.startLine,
              lineCount: descriptor.lineCount,
              statementCount: descriptor.statementCount,
              characterCount: descriptor.characterCount,
              maxLines: rule.packedCode.maxPackedFunctionLines,
              maxStatements: rule.packedCode.maxPackedFunctionStatements,
              minCharacters: rule.packedCode.minPackedFunctionCharacters,
            },
          });
        }
      }
    }

    if (rule.runtimeCodeHiding) {
      violations.push(...collectRuntimeCodeHidingViolations(file, sourceFile));
    }
  }

  return violations;
}

export { runEvasionGuardsRule };
