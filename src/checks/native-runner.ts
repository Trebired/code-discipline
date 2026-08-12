import path from "node:path";

import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { planTsconfigAliases } from "#vgknapauto04";
import { collectPackageJsonImportsSyncState, collectPackageJsonImportsSyncStateFromAliasMap } from "#51kcncizdqcz";
import { filterSourceFilesForRule } from "#jizekc8duh4i";
import type { NormalizedImportsOptions, ScannedSourceFile } from "#pkb9x3eo56l7";
import { supportsImports } from "#87jyjzn68rrk";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleCompleted } from "./progress.js";
import { shouldRunRule } from "./rule-slugs.js";
import { buildNormalizedSyncOptions } from "./sync-options.js";
import type { NormalizedCheckCodeDisciplineOptions } from "./types.js";

type NativeCheckRulesResponse = {
  violations: CodeDisciplineViolation[];
};

type NativeCheckRules = ReturnType<typeof selectNativeRules>;
type NativeCheckRuleKey = keyof NativeCheckRules;
type NativeCheckRuleEntry = {
  key: NativeCheckRuleKey;
  rule: string;
  ruleConfig: NonNullable<NativeCheckRules[NativeCheckRuleKey]>;
  sourceFiles: ScannedSourceFile[];
  syncViolations?: CodeDisciplineViolation[];
};

type NativeImportsRule = {
  excludeDirs: NormalizedCheckCodeDisciplineOptions["rules"]["imports"] extends infer T ? T extends { excludeDirs?: infer E } ? E : never : never;
  allowRelative: string[];
  aliasIdsByFilePath: Record<string, string>;
  removeDeadImports: boolean;
  sourceRoot: string;
  sourceExtensions: string[];
};

type NativeImportState = {
  rule?: NativeImportsRule;
  syncViolations: CodeDisciplineViolation[];
};

function createImportSyncViolation(args: {
    aliasesChanged?: boolean;
    aliasPlan?: Awaited<ReturnType<typeof planTsconfigAliases>>;
    normalized: NormalizedImportsOptions;
    packageJsonSyncState?: Awaited<ReturnType<typeof collectPackageJsonImportsSyncState>>;
}): CodeDisciplineViolation[] {
  const violations: CodeDisciplineViolation[] = [];
  if (args.aliasesChanged && args.aliasPlan) {
    violations.push({
        rule: "imports",
        fix: true,
        filePath: path.relative(args.normalized.projectRoot, args.normalized.tsconfigPath) || "tsconfig.json",
        message: args.normalized.output.type === "alias-map"
        ? "imports folder and generated tsconfig are out of sync"
        : "tsconfig paths are out of sync with the current source tree",
        details: {
          aliasesCount: args.aliasPlan.aliasesCount,
          drift: args.aliasPlan.drift,
        },
    });
  }
  if (args.packageJsonSyncState?.changed) {
    violations.push({
        rule: "imports",
        fix: true,
        filePath: path.relative(args.normalized.projectRoot, args.packageJsonSyncState.packageJsonPath) || "package.json",
        message: "package.json imports are out of sync with tsconfig paths",
        details: {
          importsCount: args.packageJsonSyncState.importsCount,
        },
    });
  }
  return violations;
}

async function collectPackageSyncState(
  normalized: NormalizedImportsOptions,
  aliasPlan: Awaited<ReturnType<typeof planTsconfigAliases>>,
) {
  if (normalized.output.type === "alias-map" && aliasPlan.aliasPathMap) {
    return collectPackageJsonImportsSyncStateFromAliasMap({
        aliasPathMap: aliasPlan.aliasPathMap,
        cleanWhenDisabled: true,
        configPath: normalized.configPath,
        options: {
          ...normalized.packageJsonImports,
          enabled: false,
        },
        projectRoot: normalized.projectRoot,
    });
  }
  return collectPackageJsonImportsSyncState({
      configPath: normalized.configPath,
      options: normalized.packageJsonImports,
      projectRoot: normalized.projectRoot,
      tsconfigPath: normalized.tsconfigPath,
  });
}

async function createNativeImportState(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<NativeImportState> {
  if (!options.rules.imports || !shouldRunRule("imports", options.onlyRules)) {
    return { syncViolations: [] };
  }
  const normalized = await buildNormalizedSyncOptions(options, false);
  if (!normalized) return { syncViolations: [] };
  if (!Array.isArray(normalized.allowRelative)) {
    throw new Error("imports.allowRelative functions are not supported by the native check backend");
  }
  const supportedSourceFiles = filterSourceFilesForRule(sourceFiles, options.rules.imports)
  .filter((file) => supportsImports(file.extension));
  const aliasPlan = await planTsconfigAliases(normalized, supportedSourceFiles);
  const packageJsonSyncState = await collectPackageSyncState(normalized, aliasPlan);
  return {
    syncViolations: createImportSyncViolation({
        aliasesChanged: aliasPlan.aliasesChanged,
        aliasPlan,
        normalized,
        packageJsonSyncState,
    }),
    rule: {
      excludeDirs: options.rules.imports.excludeDirs,
      allowRelative: normalized.allowRelative,
      aliasIdsByFilePath: Object.fromEntries(aliasPlan.aliasRecords.map((record) => [path.resolve(record.absolutePath), record.id])),
      removeDeadImports: normalized.removeDeadImports,
      sourceExtensions: normalized.sourceExtensions,
      sourceRoot: normalized.sourceRoot,
    },
  };
}

function selectNativeRules(
  options: NormalizedCheckCodeDisciplineOptions,
  importsRule: NativeImportsRule | undefined,
) {
  return {
    bannedPatterns: shouldRunRule("banned-patterns", options.onlyRules) ? options.rules.bannedPatterns : undefined,
    bannedFiles: shouldRunRule("banned-files", options.onlyRules) ? options.rules.bannedFiles : undefined,
    minFileLines: shouldRunRule("min-file-lines", options.onlyRules) ? options.rules.minFileLines : undefined,
    minDeclarationName: shouldRunRule("min-declaration-name", options.onlyRules) ? options.rules.minDeclarationName : undefined,
    maxFileLines: shouldRunRule("max-file-lines", options.onlyRules) ? options.rules.maxFileLines : undefined,
    maxCharactersPerLine: shouldRunRule("max-characters-per-line", options.onlyRules) ? options.rules.maxCharactersPerLine : undefined,
    maxFunctionLines: shouldRunRule("max-function-lines", options.onlyRules) ? options.rules.maxFunctionLines : undefined,
    redundantPathSegments: shouldRunRule("redundant-path-segments", options.onlyRules) ? options.rules.redundantPathSegments : undefined,
    imports: importsRule,
    removeComments: shouldRunRule("remove-comments", options.onlyRules) ? options.rules.removeComments : undefined,
    structuralBlankLines: shouldRunRule("structural-blank-lines", options.onlyRules) ? options.rules.structuralBlankLines : undefined,
    dry: shouldRunRule("dry", options.onlyRules) ? options.rules.dry : undefined,
  };
}

function runNativeCheckRule(entry: NativeCheckRuleEntry): CodeDisciplineViolation[] {
  const response = JSON.parse(requireNativeBinding().runCheckRules(JSON.stringify({
          sourceFiles: entry.sourceFiles,
          rules: {
            [entry.key]: entry.ruleConfig,
          },
  }))) as NativeCheckRulesResponse;
  return Array.isArray(response.violations) ? response.violations : [];
}

function pushNativeCheckRule(
  entries: NativeCheckRuleEntry[],
  sourceFiles: ScannedSourceFile[],
  key: NativeCheckRuleKey,
  rule: string,
  ruleConfig: NativeCheckRules[NativeCheckRuleKey],
  syncViolations: CodeDisciplineViolation[] = [],
): void {
  if (!ruleConfig) return;
  entries.push({
      key,
      rule,
      ruleConfig,
      sourceFiles: filterSourceFilesForRule(sourceFiles, ruleConfig),
      syncViolations,
  });
}

function createNativeCheckRuleEntries(
  sourceFiles: ScannedSourceFile[],
  rules: NativeCheckRules,
  importState: NativeImportState,
): NativeCheckRuleEntry[] {
  const entries: NativeCheckRuleEntry[] = [];
  pushNativeCheckRule(entries, sourceFiles, "bannedPatterns", "banned-patterns", rules.bannedPatterns);
  pushNativeCheckRule(entries, sourceFiles, "bannedFiles", "banned-files", rules.bannedFiles);
  pushNativeCheckRule(entries, sourceFiles, "minFileLines", "min-file-lines", rules.minFileLines);
  pushNativeCheckRule(entries, sourceFiles, "minDeclarationName", "min-declaration-name", rules.minDeclarationName);
  pushNativeCheckRule(entries, sourceFiles, "maxFileLines", "max-file-lines", rules.maxFileLines);
  pushNativeCheckRule(entries, sourceFiles, "maxCharactersPerLine", "max-characters-per-line", rules.maxCharactersPerLine);
  pushNativeCheckRule(entries, sourceFiles, "maxFunctionLines", "max-function-lines", rules.maxFunctionLines);
  pushNativeCheckRule(entries, sourceFiles, "redundantPathSegments", "redundant-path-segments", rules.redundantPathSegments);
  pushNativeCheckRule(entries, sourceFiles, "imports", "imports", rules.imports, importState.syncViolations);
  pushNativeCheckRule(entries, sourceFiles, "removeComments", "remove-comments", rules.removeComments);
  pushNativeCheckRule(entries, sourceFiles, "structuralBlankLines", "structural-blank-lines", rules.structuralBlankLines);
  pushNativeCheckRule(entries, sourceFiles, "dry", "dry", rules.dry);
  return entries;
}

async function collectNativeCheckViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const importState = await createNativeImportState(sourceFiles, options);
  const ruleEntries = createNativeCheckRuleEntries(
    sourceFiles,
    selectNativeRules(options, importState.rule),
    importState,
  );
  const violations: CodeDisciplineViolation[] = [];
  for (const entry of ruleEntries) {
    const progress = createRuleProgress({
        observer: options.progressObserver,
        rule: entry.rule,
        totalItems: entry.sourceFiles.length,
    });
    const ruleViolations = runNativeCheckRule(entry);
    violations.push(...(entry.syncViolations ?? []), ...ruleViolations);
    emitRuleCompleted(progress, (entry.syncViolations?.length ?? 0) + ruleViolations.length);
  }
  return violations;
}

export { collectNativeCheckViolations };
