import fs from "node:fs/promises";

import ts from "typescript";

import { parseSource } from "#27pccnhol1ci";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import {
  isCppExtension,
  isCsharpExtension,
  isGoExtension,
  isPythonExtension,
  isQmlExtension,
  isRustExtension,
  isScssExtension,
  isShellExtension,
  isStyleExtension,
  isTypeScriptFamilyExtension,
  supportsMinDeclarationName,
} from "#87jyjzn68rrk";
import { collectLanguageFunctionDescriptors } from "#9tcp2jgf8qlj";
import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { getStartLine } from "#hrlcdim1gtmi";
import { collectWithParseFailure } from "../../parse-failures.js";
import { stripCommentsAndStrings } from "#azin2l86pnk4";
import { updatePythonTripleState } from "#fr9be3qxsdjh";
import { maskQmlCommentsAndStrings } from "#x6956eahfhcm";
import { stripShellStringsAndComments } from "#j00y5takmzho";

type NamedDeclaration = {
  kind: string;
  line: number;
  name: string;
};

function isConstDeclaration(node: ts.VariableDeclaration): boolean {
  return (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0;
}

function collectNamedDeclarations(sourceFile: ts.SourceFile): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      declarations.push({
        kind: "function",
        line: getStartLine(sourceFile, node.name),
        name: node.name.text,
      });
    }

    if (ts.isVariableDeclaration(node) && isConstDeclaration(node) && ts.isIdentifier(node.name)) {
      declarations.push({
        kind: "const",
        line: getStartLine(sourceFile, node.name),
        name: node.name.text,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return declarations;
}

function collectPatternDeclarations(
  text: string,
  patterns: Array<{ kind: string; pattern: RegExp }>,
): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];
  const lines = text.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const entry of patterns) {
      const match = entry.pattern.exec(line);
      if (!match?.[1]) continue;
      declarations.push({
        kind: entry.kind,
        line: index + 1,
        name: match[1],
      });
      break;
    }
  }

  return declarations;
}

function collectGoDeclarations(text: string): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];
  const lines = stripCommentsAndStrings(text).split(/\r?\n/u);
  let blockKind: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const functionMatch = /^\s*func(?:\s*\([^)]*\))?\s+([A-Za-z_]\w*)/u.exec(line);
    if (functionMatch?.[1]) {
      declarations.push({
        kind: /\bfunc\s*\(/u.test(line) ? "method" : "function",
        line: index + 1,
        name: functionMatch[1],
      });
      continue;
    }

    const blockStart = /^\s*(const|var|type)\s*\(/u.exec(line);
    if (blockStart?.[1]) {
      blockKind = blockStart[1];
      continue;
    }
    if (blockKind && /^\s*\)/u.test(line)) {
      blockKind = null;
      continue;
    }

    const declarationMatch = blockKind
      ? /^\s*([A-Za-z_]\w*)\b/u.exec(line)
      : /^\s*(const|var|type)\s+([A-Za-z_]\w*)/u.exec(line);
    const name = blockKind ? declarationMatch?.[1] : declarationMatch?.[2];
    const kind = blockKind ?? declarationMatch?.[1];
    if (!name || !kind) continue;

    declarations.push({
      kind,
      line: index + 1,
      name,
    });
  }

  return declarations;
}

function collectRustDeclarations(text: string): NamedDeclaration[] {
  return collectPatternDeclarations(stripCommentsAndStrings(text), [
    {
      kind: "function",
      pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/u,
    },
    {
      kind: "const",
      pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?const\s+([A-Za-z_]\w*)/u,
    },
    {
      kind: "static",
      pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?static\s+([A-Za-z_]\w*)/u,
    },
    {
      kind: "struct",
      pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)/u,
    },
    {
      kind: "enum",
      pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)/u,
    },
    {
      kind: "trait",
      pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+([A-Za-z_]\w*)/u,
    },
    {
      kind: "type",
      pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?type\s+([A-Za-z_]\w*)/u,
    },
    {
      kind: "module",
      pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)/u,
    },
  ]);
}

function collectCFamilyFunctionDeclarations(text: string, extension: string, filePath: string): NamedDeclaration[] {
  return collectLanguageFunctionDescriptors(text, extension, filePath).map((entry) => ({
    kind: entry.kind,
    line: entry.startLine,
    name: entry.name,
  }));
}

function collectCppDeclarations(text: string, extension: string, filePath: string): NamedDeclaration[] {
  return [
    ...collectCFamilyFunctionDeclarations(text, extension, filePath),
    ...collectPatternDeclarations(stripCommentsAndStrings(text), [
      {
        kind: "namespace",
        pattern: /^\s*namespace\s+([A-Za-z_]\w*)/u,
      },
      {
        kind: "class",
        pattern: /^\s*(?:template\s*<[^>]*>\s*)?class\s+([A-Za-z_]\w*)/u,
      },
      {
        kind: "struct",
        pattern: /^\s*(?:template\s*<[^>]*>\s*)?struct\s+([A-Za-z_]\w*)/u,
      },
      {
        kind: "enum",
        pattern: /^\s*enum(?:\s+class)?\s+([A-Za-z_]\w*)/u,
      },
      {
        kind: "using",
        pattern: /^\s*using\s+([A-Za-z_]\w*)\s*=/u,
      },
    ]),
  ];
}

function collectCsharpDeclarations(text: string, extension: string, filePath: string): NamedDeclaration[] {
  return [
    ...collectCFamilyFunctionDeclarations(text, extension, filePath),
    ...collectPatternDeclarations(stripCommentsAndStrings(text), [
      {
        kind: "namespace",
        pattern: /^\s*namespace\s+([A-Za-z_][\w.]*)/u,
      },
      {
        kind: "class",
        pattern: /^\s*(?:(?:public|private|protected|internal|static|sealed|abstract|partial)\s+)*class\s+([A-Za-z_]\w*)/u,
      },
      {
        kind: "interface",
        pattern: /^\s*(?:(?:public|private|protected|internal|partial)\s+)*interface\s+([A-Za-z_]\w*)/u,
      },
      {
        kind: "struct",
        pattern: /^\s*(?:(?:public|private|protected|internal|readonly|partial)\s+)*struct\s+([A-Za-z_]\w*)/u,
      },
      {
        kind: "enum",
        pattern: /^\s*(?:(?:public|private|protected|internal)\s+)*enum\s+([A-Za-z_]\w*)/u,
      },
    ]),
  ];
}

function collectPythonDeclarations(text: string): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];
  const state = { quote: null as "\"\"\"" | "'''" | null };
  const lines = text.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const insideTripleString = state.quote !== null;
    if (!insideTripleString) {
      const functionMatch = /^\s*(async\s+def|def)\s+([A-Za-z_]\w*)\s*\(/u.exec(line);
      const classMatch = /^\s*class\s+([A-Za-z_]\w*)\s*(?:\(|:)/u.exec(line);
      const assignmentMatch = /^\s*([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/u.exec(line);
      const declaration = functionMatch?.[2]
        ? { kind: functionMatch[1] === "def" ? "function" : "async-function", name: functionMatch[2] }
        : classMatch?.[1]
          ? { kind: "class", name: classMatch[1] }
          : assignmentMatch?.[1]
            ? { kind: "assignment", name: assignmentMatch[1] }
            : null;

      if (declaration) {
        declarations.push({
          ...declaration,
          line: index + 1,
        });
      }
    }
    updatePythonTripleState(line, state);
  }

  return declarations;
}

function collectQmlDeclarations(text: string): NamedDeclaration[] {
  return collectPatternDeclarations(maskQmlCommentsAndStrings(text), [
    {
      kind: "function",
      pattern: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/u,
    },
    {
      kind: "function",
      pattern: /^\s*(?:property\s+\w+\s+)?([A-Za-z_$][\w$]*)\s*:\s*function\s*\(/u,
    },
    {
      kind: "signal-handler",
      pattern: /^\s*(on[A-Z][\w$]*)\s*:/u,
    },
    {
      kind: "property",
      pattern: /^\s*property\s+\w+\s+([A-Za-z_$][\w$]*)\b/u,
    },
    {
      kind: "signal",
      pattern: /^\s*signal\s+([A-Za-z_$][\w$]*)\s*\(/u,
    },
    {
      kind: "id",
      pattern: /^\s*id\s*:\s*([A-Za-z_$][\w$]*)/u,
    },
  ]);
}

function collectShellDeclarations(text: string): NamedDeclaration[] {
  const stripped = text.split(/\r?\n/u).map(stripShellStringsAndComments).join("\n");
  return collectPatternDeclarations(stripped, [
    {
      kind: "function",
      pattern: /^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*(?:\(\s*\))?\s*\{/u,
    },
    {
      kind: "assignment",
      pattern: /^\s*(?:export\s+|local\s+|readonly\s+|declare\s+(?:-[A-Za-z]+\s+)?)?([A-Za-z_]\w*)=/u,
    },
  ]);
}

function collectStyleDeclarations(text: string, extension: string): NamedDeclaration[] {
  const patterns: Array<{ kind: string; pattern: RegExp }> = [
    {
      kind: "custom-property",
      pattern: /^\s*(--[A-Za-z_][\w-]*)\s*:/u,
    },
  ];

  if (isScssExtension(extension)) {
    patterns.unshift(
      {
        kind: "variable",
        pattern: /^\s*(\$[A-Za-z_][\w-]*)\s*:/u,
      },
      {
        kind: "mixin",
        pattern: /^\s*@mixin\s+([A-Za-z_][\w-]*)/u,
      },
      {
        kind: "function",
        pattern: /^\s*@function\s+([A-Za-z_][\w-]*)/u,
      },
      {
        kind: "placeholder",
        pattern: /^\s*(%[A-Za-z_][\w-]*)/u,
      },
    );
  }

  return collectPatternDeclarations(stripCommentsAndStrings(text), patterns);
}

function collectLanguageDeclarations(text: string, extension: string, filePath: string): NamedDeclaration[] {
  if (isTypeScriptFamilyExtension(extension)) return collectNamedDeclarations(parseSource(text, filePath));
  if (isGoExtension(extension)) return collectGoDeclarations(text);
  if (isRustExtension(extension)) return collectRustDeclarations(text);
  if (isCppExtension(extension)) return collectCppDeclarations(text, extension, filePath);
  if (isCsharpExtension(extension)) return collectCsharpDeclarations(text, extension, filePath);
  if (isPythonExtension(extension)) return collectPythonDeclarations(text);
  if (isQmlExtension(extension)) return collectQmlDeclarations(text);
  if (isShellExtension(extension)) return collectShellDeclarations(text);
  if (isStyleExtension(extension)) return collectStyleDeclarations(text, extension);
  return [];
}

function measureDeclarationName(name: string): number {
  return Array.from(name.replace(/^(?:--|[$%])/u, "")).length;
}

function createMinDeclarationNameViolation(
  file: ScannedSourceFile,
  declaration: NamedDeclaration,
  min: number,
  length: number,
): CodeDisciplineViolation {
  return {
    rule: "min-declaration-name",
    fix: false,
    filePath: file.relativeFromProjectRoot,
    message: `${declaration.kind} ${declaration.name} has ${length} character${length === 1 ? "" : "s"} and is below the minimum name length of ${min}`,
    details: {
      declarationKind: declaration.kind,
      declarationName: declaration.name,
      line: declaration.line,
      length,
      min,
    },
  };
}

async function runMinDeclarationNameRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.minDeclarationName) return [];

  const violations: CodeDisciplineViolation[] = [];
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "min-declaration-name",
    totalItems: sourceFiles.length,
  });

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!supportsMinDeclarationName(file.extension)) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    const text = await fs.readFile(file.absolutePath, "utf8");
    const declarations = await collectWithParseFailure(
      "min-declaration-name",
      file.relativeFromProjectRoot,
      violations,
      () => collectLanguageDeclarations(text, file.extension, file.absolutePath),
    );
    for (const declaration of declarations ?? []) {
      const length = measureDeclarationName(declaration.name);
      if (length >= options.rules.minDeclarationName.min) continue;
      violations.push(createMinDeclarationNameViolation(file, declaration, options.rules.minDeclarationName.min, length));
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { runMinDeclarationNameRule };
