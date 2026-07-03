function formatRelativeImport(fromAbsolutePath: string, toAbsolutePath: string, extensions: string[]): string {
  let relativePath = toPosixPath(path.relative(path.dirname(fromAbsolutePath), toAbsolutePath));
  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }

  const withoutExtension = stripKnownExtension(relativePath, extensions);
  return withoutExtension.replace(/\/index$/, "") || ".";
}

async function collectExistingImports(
  sourceFile: ts.SourceFile,
  filePath: string,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<Map<string, ImportBinding[]>> {
  const bindingsByTarget = new Map<string, ImportBinding[]>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const resolved = await resolveRelativeImport(statement.moduleSpecifier.text, filePath, {
      sourceRoot: options.sourceRoot,
      sourceExtensions: options.sourceExtensions,
    });
    if (!resolved) continue;

    const bindings = bindingsByTarget.get(resolved) ?? [];
    const clause = statement.importClause;
    if (!clause) continue;

    if (clause.name) {
        bindings.push({
          exportName: "default",
          localName: clause.name.text,
        });
    }

    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        bindings.push({
          exportName: element.propertyName?.text ?? element.name.text,
          localName: element.name.text,
        });
      }
    }

    bindingsByTarget.set(resolved, bindings);
  }

  return bindingsByTarget;
}

function collectTopLevelValueBindings(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.add(statement.name.text);
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      names.add(statement.name.text);
      continue;
    }

    if (ts.isImportDeclaration(statement) && statement.importClause) {
      if (statement.importClause.name) {
        names.add(statement.importClause.name.text);
      }

      if (statement.importClause.namedBindings) {
        if (ts.isNamespaceImport(statement.importClause.namedBindings)) {
          names.add(statement.importClause.namedBindings.name.text);
        } else {
          for (const element of statement.importClause.namedBindings.elements) {
            names.add(element.name.text);
          }
        }
      }

      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBoundNamesFromBindingName(declaration.name, names);
      }
    }
  }

  return names;
}

function collectBoundNamesFromBindingName(name: ts.BindingName, target: Set<string>): void {
  if (ts.isIdentifier(name)) {
    target.add(name.text);
    return;
  }

  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (!element || !ts.isBindingElement(element)) continue;
      collectBoundNamesFromBindingName(element.name, target);
    }
  }
}

function findImportInsertionOffset(sourceFile: ts.SourceFile, text: string): number {
  const imports = sourceFile.statements.filter((statement) => ts.isImportDeclaration(statement));
  if (imports.length > 0) {
    return imports[imports.length - 1]!.getEnd();
  }

  let offset = 0;
  if (text.startsWith("#!")) {
    const newlineIndex = text.indexOf("\n");
    offset = newlineIndex >= 0 ? newlineIndex + 1 : text.length;
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      offset = statement.getEnd();
      continue;
    }

    break;
  }

  return offset;
}

async function fixDryRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const rule = options.rules.dry;
  if (!rule) {
    return {
      ok: true,
      violationCount: 0,
      violations: [],
    };
  }

  const helpers = await resolveDryHelpers(rule, options);
  const candidates = await collectDryCandidates(filterDrySourceFiles(sourceFiles), helpers, options);
  const violations = candidates.map((candidate) => createDryViolation(candidate, options));

  if (violations.length === 0) {
    return {
      ok: true,
      violationCount: 0,
      violations: [],
      added_imports: 0,
      removed_duplicates: 0,
    };
  }

  const candidatesByFile = new Map<string, DryCandidateDescriptor[]>();
  const fixedCandidates = new Set<DryCandidateDescriptor>();

  for (const candidate of candidates.filter((entry) => entry.safeToFix)) {
    const rows = candidatesByFile.get(candidate.absolutePath) ?? [];
    rows.push(candidate);
    candidatesByFile.set(candidate.absolutePath, rows);
  }

  let addedImports = 0;
  let removedDuplicates = 0;
  let rewrittenFiles = 0;

  try {
    for (const [absolutePath, fileCandidates] of candidatesByFile) {
      const originalText = await fs.readFile(absolutePath, "utf8");
      const sourceFile = fileCandidates[0]!.sourceFile;
      const existingImports = await collectExistingImports(sourceFile, absolutePath, options);
      const topLevelBindings = collectTopLevelValueBindings(sourceFile);
      const pendingImports = new Map<string, string>();
      const removals: Array<{ start: number; end: number }> = [];

      for (const statement of sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name) {
          const matchingCandidate = fileCandidates.find((candidate) => candidate.localName === statement.name?.text && candidate.removalStart === statement.getFullStart());
          if (matchingCandidate) {
            topLevelBindings.delete(statement.name.text);
          }
        }

        if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
          const declaration = statement.declarationList.declarations[0]!;
          if (!ts.isIdentifier(declaration.name)) continue;
          const variableName = declaration.name.text;
          const matchingCandidate = fileCandidates.find((candidate) => candidate.localName === variableName && candidate.removalStart === statement.getFullStart());
          if (matchingCandidate) {
            topLevelBindings.delete(variableName);
          }
        }
      }

      for (const candidate of fileCandidates.sort((left, right) => right.removalStart - left.removalStart)) {
        if (!candidate.localName) continue;

        if (candidate.helper.absolutePath === absolutePath) {
          if (candidate.localName !== candidate.helper.localName) {
            continue;
          }

          removals.push({
            start: candidate.removalStart,
            end: candidate.removalEnd,
          });
          fixedCandidates.add(candidate);
          removedDuplicates += 1;
          continue;
        }

        const existingHelperBindings = existingImports.get(candidate.helper.absolutePath) ?? [];
        const alreadyImported = existingHelperBindings.some((binding) => binding.exportName === candidate.helper.exportName && binding.localName === candidate.localName);

        if (!alreadyImported) {
          if (topLevelBindings.has(candidate.localName)) {
            continue;
          }

          const importSpecifier = formatRelativeImport(absolutePath, candidate.helper.absolutePath, options.sourceExtensions);
          const importLine = candidate.helper.exportName === "default"
            ? `import ${candidate.localName} from "${importSpecifier}";\n`
            : candidate.localName === candidate.helper.exportName
              ? `import { ${candidate.helper.exportName} } from "${importSpecifier}";\n`
              : `import { ${candidate.helper.exportName} as ${candidate.localName} } from "${importSpecifier}";\n`;

          pendingImports.set(`${candidate.helper.absolutePath}::${candidate.localName}`, importLine);
          topLevelBindings.add(candidate.localName);
        }

        removals.push({
          start: candidate.removalStart,
          end: candidate.removalEnd,
        });
        fixedCandidates.add(candidate);
        removedDuplicates += 1;
      }

      if (removals.length === 0 && pendingImports.size === 0) {
        continue;
      }

      let nextText = originalText;
      for (const removal of removals.sort((left, right) => right.start - left.start)) {
        nextText = `${nextText.slice(0, removal.start)}${nextText.slice(removal.end)}`;
      }

      if (pendingImports.size > 0) {
        const insertionOffset = findImportInsertionOffset(sourceFile, originalText);
        const prefix = nextText.slice(0, insertionOffset);
        const suffix = nextText.slice(insertionOffset);
        const importBlock = `${prefix.endsWith("\n") || insertionOffset === 0 ? "" : "\n"}${[...pendingImports.values()].join("")}`;
        nextText = `${prefix}${importBlock}${suffix.startsWith("\n") ? "" : "\n"}${suffix}`;
        addedImports += pendingImports.size;
      }

      if (nextText !== originalText) {
        await fs.writeFile(absolutePath, nextText);
        rewrittenFiles += 1;
      }
    }
  } catch (error) {
    throw new FixFailureError("DRY fix failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const remainingViolations = candidates
    .filter((candidate) => !fixedCandidates.has(candidate))
    .map((candidate) => createDryViolation(candidate, options));

  return {
    ok: remainingViolations.length === 0,
    violationCount: remainingViolations.length,
    violations: remainingViolations,
    added_imports: addedImports,
    removed_duplicates: removedDuplicates,
    rewritten_files: rewrittenFiles,
  };
}

export { fixDryRule };
import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import { resolveRelativeImport } from "../../../imports/resolve.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import { FixFailureError } from "../../../shared/errors.js";
import { stripKnownExtension, toPosixPath } from "../../../shared/utils.js";
import { collectDryCandidates, createDryViolation } from "./candidates.js";
import { resolveDryHelpers } from "./helpers.js";
import { filterDrySourceFiles } from "./model.js";
import type { DryCandidateDescriptor, ImportBinding } from "./model.js";
