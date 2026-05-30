import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import { ParseFailureError, RewriteFailureError } from "../shared/errors.js";
import { resolveRelativeImport } from "./resolve.js";
import type {
  AliasRecord,
  KeepRelativeFn,
  NormalizedSyncImportsOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
} from "./types.js";
import type { NormalizedSyncImportsLogger } from "../shared/logging-types.js";
import { formatDiagnostics } from "../shared/utils.js";

type Replacement = {
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

function shouldKeepRelative(
  specifier: string,
  sourceFile: string,
  resolvedFile: string,
  options: NormalizedSyncImportsOptions,
): boolean {
  const policy = options.imports.keepRelative;

  if (Array.isArray(policy)) {
    return policy.some((entry) => specifier === entry || specifier.startsWith(entry));
  }

  return (policy as KeepRelativeFn)(specifier, {
    sourceFile,
    resolvedFile,
    projectRoot: options.projectRoot,
    sourceRoot: options.sourceRoot,
  });
}

function collectReplacements(
  sourceFile: ts.SourceFile,
  sourcePath: string,
  options: NormalizedSyncImportsOptions,
  aliasIdsByFilePath: Map<string, string>,
  logger: NormalizedSyncImportsLogger,
): Promise<Replacement[]> {
  const replacements: Promise<Replacement | null>[] = [];

  function queueLiteralRewrite(node: ts.StringLiteralLike) {
    const specifier = node.text;

    replacements.push((async () => {
      if (!specifier.startsWith(".")) return null;

      const resolvedFile = await resolveRelativeImport(specifier, sourcePath, options);
      if (!resolvedFile) {
        logger.debug("rewrite-skipped-unresolved", `skipped unresolved import ${specifier}`, {
          sourceFile: sourcePath,
          specifier,
        });
        return null;
      }

      if (shouldKeepRelative(specifier, sourcePath, resolvedFile, options)) {
        return null;
      }

      const aliasId = aliasIdsByFilePath.get(resolvedFile);
      if (!aliasId) return null;

      return {
        start: node.getStart(sourceFile) + 1,
        end: node.getEnd() - 1,
        value: aliasId,
      };
    })());
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        queueLiteralRewrite(node.moduleSpecifier);
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [firstArg] = node.arguments;
      if (firstArg && ts.isStringLiteralLike(firstArg)) {
        queueLiteralRewrite(firstArg);
      }
    }

    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      queueLiteralRewrite(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return Promise.all(replacements).then((rows) => rows.filter(Boolean) as Replacement[]);
}

function applyReplacements(text: string, replacements: Replacement[]): { text: string; rewrittenImports: number } {
  if (replacements.length === 0) return { text, rewrittenImports: 0 };

  const sorted = [...replacements].sort((left, right) => right.start - left.start);
  let nextText = text;

  for (const replacement of sorted) {
    nextText = `${nextText.slice(0, replacement.start)}${replacement.value}${nextText.slice(replacement.end)}`;
  }

  return {
    text: nextText,
    rewrittenImports: replacements.length,
  };
}

async function rewriteSourceFile(
  file: ScannedSourceFile,
  options: NormalizedSyncImportsOptions,
  aliasIdsByFilePath: Map<string, string>,
  logger: NormalizedSyncImportsLogger,
): Promise<RewriteFileResult> {
  try {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(text, file.absolutePath);
    const replacements = await collectReplacements(sourceFile, file.absolutePath, options, aliasIdsByFilePath, logger);
    const applied = applyReplacements(text, replacements);

    if (applied.rewrittenImports === 0) {
      return {
        rewritten: false,
        rewrittenImports: 0,
      };
    }

    await fs.writeFile(file.absolutePath, applied.text);

    return {
      rewritten: true,
      rewrittenImports: applied.rewrittenImports,
    };
  } catch (error) {
    if (error instanceof ParseFailureError) throw error;
    throw new RewriteFailureError(file.absolutePath, error);
  }
}

async function rewriteSourceImports(
  sourceFiles: ScannedSourceFile[],
  aliasRecords: AliasRecord[],
  options: NormalizedSyncImportsOptions,
  logger: NormalizedSyncImportsLogger,
): Promise<RewriteResult> {
  const aliasIdsByFilePath = new Map(aliasRecords.map((record) => [record.absolutePath, record.id]));
  let rewrittenFiles = 0;
  let rewrittenImports = 0;

  for (const file of sourceFiles) {
    const result = await rewriteSourceFile(file, options, aliasIdsByFilePath, logger);
    if (result.rewritten) rewrittenFiles += 1;
    rewrittenImports += result.rewrittenImports;
  }

  return {
    rewrittenFiles,
    rewrittenImports,
  };
}

export { rewriteSourceImports };
