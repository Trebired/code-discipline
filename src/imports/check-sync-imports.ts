import fs from "node:fs/promises";
import path from "node:path";

import type { NormalizedCodeDisciplineLogger } from "../shared/logging-types.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";
import { collectPackageJsonImportsSyncState } from "../runtime/runtime-imports-sync.js";
import { supportsSyncImports } from "../shared/languages.js";
import { planTsconfigAliases } from "./aliases.js";
import { collectModuleSpecifiers } from "./module-specifiers.js";
import { resolveRelativeImport } from "./resolve.js";
import { isAllowedRelative } from "./rewrite.js";
import type { NormalizedSyncImportsOptions, ScannedSourceFile } from "./types.js";

async function collectSyncImportViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedSyncImportsOptions,
  logger?: NormalizedCodeDisciplineLogger,
): Promise<CodeDisciplineViolation[]> {
  const supportedSourceFiles = sourceFiles.filter((file) => supportsSyncImports(file.extension));
  const aliasPlan = await planTsconfigAliases(options, supportedSourceFiles, logger);
  const aliasIdsByFilePath = new Map(aliasPlan.aliasRecords.map((record) => [record.absolutePath, record.id]));
  const violations: CodeDisciplineViolation[] = [];

  if (aliasPlan.aliasesChanged) {
    violations.push({
      rule: "sync-imports",
      fix: true,
      filePath: path.relative(options.projectRoot, options.tsconfigPath) || "tsconfig.json",
      message: "tsconfig paths are out of sync with the current source tree",
      details: {
        aliasesCount: aliasPlan.aliasesCount,
      },
    });
  }

  const packageJsonSyncState = await collectPackageJsonImportsSyncState({
    configPath: options.configPath,
    options: options.packageJsonImports,
    projectRoot: options.projectRoot,
    tsconfigPath: options.tsconfigPath,
  });

  if (packageJsonSyncState?.changed) {
    violations.push({
      rule: "sync-imports",
      fix: true,
      filePath: path.relative(options.projectRoot, packageJsonSyncState.packageJsonPath) || "package.json",
      message: "package.json imports are out of sync with tsconfig paths",
      details: {
        importsCount: packageJsonSyncState.importsCount,
      },
    });
  }

  for (const file of supportedSourceFiles) {
    const text = await fs.readFile(file.absolutePath, "utf8");

    for (const occurrence of collectModuleSpecifiers(text, file.absolutePath)) {
      if (!occurrence.specifier.startsWith(".")) continue;

      const resolvedFile = await resolveRelativeImport(occurrence.specifier, file.absolutePath, options);
      if (!resolvedFile) continue;

      if (isAllowedRelative(occurrence.specifier, file.absolutePath, resolvedFile, options)) continue;

      const aliasId = aliasIdsByFilePath.get(resolvedFile);
      if (!aliasId) continue;

      violations.push({
        rule: "sync-imports",
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
  }

  return violations;
}

export { collectSyncImportViolations };
