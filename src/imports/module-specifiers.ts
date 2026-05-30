import path from "node:path";

import ts from "typescript";

import { ParseFailureError } from "../shared/errors.js";
import { formatDiagnostics } from "../shared/utils.js";

type ModuleSpecifierOccurrence = {
  specifier: string;
  start: number;
  end: number;
};

type TextReplacement = {
  start: number;
  end: number;
  value: string;
};

function resolveScriptKind(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseSource(text: string, filePath: string): ts.SourceFile {
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, resolveScriptKind(filePath));
  const diagnostics = ((sourceFile as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[];
  }).parseDiagnostics ?? []);
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

  if (errors.length > 0) {
    throw new ParseFailureError(filePath, formatDiagnostics(errors));
  }

  return sourceFile;
}

function collectModuleSpecifiers(text: string, filePath: string): ModuleSpecifierOccurrence[] {
  const sourceFile = parseSource(text, filePath);
  const occurrences: ModuleSpecifierOccurrence[] = [];

  function addLiteral(node: ts.StringLiteralLike) {
    occurrences.push({
      specifier: node.text,
      start: node.getStart(sourceFile) + 1,
      end: node.getEnd() - 1,
    });
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        addLiteral(node.moduleSpecifier);
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [firstArg] = node.arguments;
      if (firstArg && ts.isStringLiteralLike(firstArg)) {
        addLiteral(firstArg);
      }
    }

    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      addLiteral(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return occurrences;
}

function applyTextReplacements(text: string, replacements: TextReplacement[]): { text: string; count: number } {
  if (replacements.length === 0) {
    return { text, count: 0 };
  }

  const sorted = [...replacements].sort((left, right) => right.start - left.start);
  let nextText = text;

  for (const replacement of sorted) {
    nextText = `${nextText.slice(0, replacement.start)}${replacement.value}${nextText.slice(replacement.end)}`;
  }

  return {
    text: nextText,
    count: replacements.length,
  };
}

export { applyTextReplacements, collectModuleSpecifiers, parseSource };
export type { ModuleSpecifierOccurrence, TextReplacement };
