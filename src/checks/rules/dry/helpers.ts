async function resolveDryHelperModulePath(reference: DryHelperReference, options: NormalizedCheckCodeDisciplineOptions): Promise<string> {
  const baseDir = options.configPath ? path.dirname(options.configPath) : options.projectRoot;
  const basePath = path.isAbsolute(reference.from)
    ? path.resolve(reference.from)
    : path.resolve(baseDir, reference.from);
  const candidates = [basePath];

  if (!path.extname(basePath)) {
    for (const extension of DRY_RESOLUTION_EXTENSIONS) {
      candidates.push(`${basePath}${extension}`);
    }

    for (const extension of DRY_RESOLUTION_EXTENSIONS) {
      candidates.push(path.join(basePath, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }

  throw new InvalidCodeDisciplineConfigError(`dry helper module was not found: ${reference.from}`, {
    rule: "dry",
    from: reference.from,
  });
}

function extractSupportedExportedFunction(
  sourceFile: ts.SourceFile,
  exportName: string,
): ts.FunctionLikeDeclaration | null {
  for (const statement of sourceFile.statements) {
    if (exportName === "default" && ts.isExportAssignment(statement)) {
      const expression = statement.expression;
      if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
        return expression;
      }
    }

    if (ts.isFunctionDeclaration(statement) && statement.name?.text === exportName && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      return statement;
    }

    if (ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName || !declaration.initializer) continue;
        if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
          return declaration.initializer;
        }
      }
    }

    if (exportName === "default" && ts.isFunctionDeclaration(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      return statement;
    }
  }

  return null;
}

async function resolveDryHelpers(
  rule: NormalizedDryRule,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<Map<string, DryHelperDescriptor>> {
  const helpers = new Map<string, DryHelperDescriptor>();

  for (const reference of rule.helpers) {
    const absolutePath = await resolveDryHelperModulePath(reference, options);
    const sourceText = await fs.readFile(absolutePath, "utf8");
    const sourceFile = parseSource(sourceText, absolutePath);
    const exportedFunction = extractSupportedExportedFunction(sourceFile, reference.exportName);

    if (!exportedFunction) {
      throw new InvalidCodeDisciplineConfigError(`dry helper export is not a supported function: ${reference.from}#${reference.exportName}`, {
        rule: "dry",
        exportName: reference.exportName,
        from: reference.from,
      });
    }

    const fingerprintState = createFunctionFingerprint(exportedFunction, sourceFile);
    const helperKey = reference.key || `${reference.from}#${reference.exportName}`;
    const localName = reference.exportName === "default"
      ? resolveStandaloneName(exportedFunction) || "default"
      : reference.exportName;

    if (helpers.has(fingerprintState.fingerprint)) {
      const existing = helpers.get(fingerprintState.fingerprint)!;
      throw new InvalidCodeDisciplineConfigError(`dry helper fingerprint collision: ${helperKey} conflicts with ${existing.helperKey}`, {
        rule: "dry",
      });
    }

    helpers.set(fingerprintState.fingerprint, {
      absolutePath,
      exportName: reference.exportName,
      fingerprint: fingerprintState.fingerprint,
      filePath: toPosixPath(path.relative(options.projectRoot, absolutePath)),
      helperKey,
      importPath: reference.from,
      localName,
      nodeEnd: exportedFunction.getEnd(),
      nodeStart: exportedFunction.getStart(sourceFile),
    });
  }

  return helpers;
}

export { resolveDryHelpers };
import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import type { DryHelperReference, NormalizedCheckCodeDisciplineOptions, NormalizedDryRule } from "../../types.js";
import { parseSource } from "../../../imports/module-specifiers.js";
import { InvalidCodeDisciplineConfigError } from "../../../shared/errors.js";
import { isFile, toPosixPath } from "../../../shared/utils.js";
import { createFunctionFingerprint, resolveStandaloneName } from "./fingerprint.js";
import { DRY_RESOLUTION_EXTENSIONS } from "./model.js";
import type { DryHelperDescriptor } from "./model.js";
