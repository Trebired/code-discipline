import fs from "node:fs/promises";
import path from "node:path";

import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import type { NormalizedCodeDisciplineLogger } from "#uljkt8i26p4t";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { collectPackageJsonImportsSyncState, collectPackageJsonImportsSyncStateFromAliasMap } from "#51kcncizdqcz";
import { isTypeScriptFamilyExtension, supportsImports } from "#87jyjzn68rrk";
import { planTsconfigAliases } from "./aliases.js";
import { collectDeadImportViolations } from "./dead.js";
import { collectModuleSpecifiers } from "./module-specifiers.js";
import { resolveRelativeImport } from "./resolve.js";
import { isAllowedRelative } from "./rewrite.js";
import type { NormalizedImportsOptions, ScannedSourceFile } from "./types.js";
import { collectWithParseFailure } from "../checks/parse-failures.js";

async function collectImportViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedImportsOptions,
  logger?: NormalizedCodeDisciplineLogger,
): Promise<CodeDisciplineViolation[]> {
  const supportedSourceFiles = sourceFiles.filter((file) => supportsImports(file.extension));
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "imports",
    totalItems: supportedSourceFiles.length,
  });
  const aliasPlan = await planTsconfigAliases(options, supportedSourceFiles, logger);
  const aliasIdsByFilePath = new Map(aliasPlan.aliasRecords.map((record) => [record.absolutePath, record.id]));
  const violations: CodeDisciplineViolation[] = [];

  if (aliasPlan.aliasesChanged) {
    violations.push({
      rule: "imports",
      fix: true,
      filePath: path.relative(options.projectRoot, options.tsconfigPath) || "tsconfig.json",
      message: options.output.type === "alias-map"
        ? "imports folder and generated tsconfig are out of sync"
        : "tsconfig paths are out of sync with the current source tree",
      details: {
        aliasesCount: aliasPlan.aliasesCount,
        drift: aliasPlan.drift,
      },
    });
  }

  const packageJsonSyncState = options.output.type === "alias-map" && aliasPlan.aliasPathMap
    ? await collectPackageJsonImportsSyncStateFromAliasMap({
      aliasPathMap: aliasPlan.aliasPathMap,
      cleanWhenDisabled: true,
      configPath: options.configPath,
      options: {
        ...options.packageJsonImports,
        enabled: false,
      },
      projectRoot: options.projectRoot,
    })
    : await collectPackageJsonImportsSyncState({
      configPath: options.configPath,
      options: options.packageJsonImports,
      projectRoot: options.projectRoot,
      tsconfigPath: options.tsconfigPath,
    });

  if (packageJsonSyncState?.changed) {
    violations.push({
      rule: "imports",
      fix: true,
      filePath: path.relative(options.projectRoot, packageJsonSyncState.packageJsonPath) || "package.json",
      message: "package.json imports are out of sync with tsconfig paths",
      details: {
        importsCount: packageJsonSyncState.importsCount,
      },
    });
  }

  for (let index = 0; index < supportedSourceFiles.length; index += 1) {
    const file = supportedSourceFiles[index]!;
    const text = await fs.readFile(file.absolutePath, "utf8");

    const occurrences = await collectWithParseFailure(
      "imports",
      file.relativeFromProjectRoot,
      violations,
      () => collectModuleSpecifiers(text, file.absolutePath),
    );

    for (const occurrence of occurrences ?? []) {
      if (!occurrence.specifier.startsWith(".")) continue;

      const resolvedFile = await resolveRelativeImport(occurrence.specifier, file.absolutePath, options);
      if (!resolvedFile) {
        violations.push({
          rule: "imports",
          fix: Boolean(occurrence.removalStart !== undefined && occurrence.removalEnd !== undefined),
          filePath: file.relativeFromProjectRoot,
          message: `unresolved import ${occurrence.specifier} should be removed`,
          details: {
            specifier: occurrence.specifier,
          },
        });
        continue;
      }

      if (isAllowedRelative(occurrence.specifier, file.absolutePath, resolvedFile, options)) continue;

      const aliasId = aliasIdsByFilePath.get(resolvedFile);
      if (!aliasId) continue;

      violations.push({
        rule: "imports",
        fix: true,
        filePath: file.relativeFromProjectRoot,
        message: `relative import ${occurrence.specifier} should be rewritten to ${aliasId}`,
        details: {
          specifier: occurrence.specifier,
          aliasId,
          resolvedFile: path.relative(options.projectRoot, resolvedFile),
        },
      });
    }

    if (options.removeDeadImports && isTypeScriptFamilyExtension(file.extension) && occurrences) {
      const deadImports = await collectWithParseFailure(
        "imports",
        file.relativeFromProjectRoot,
        violations,
        () => collectDeadImportViolations(text, file.absolutePath),
      );
      for (const deadImport of deadImports ?? []) {
        violations.push({
          rule: "imports",
          fix: true,
          filePath: file.relativeFromProjectRoot,
          message: `unused import ${deadImport.name} should be removed`,
          details: {
            name: deadImport.name,
          },
        });
      }
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { collectImportViolations };
