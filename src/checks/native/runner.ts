import path from "node:path";

import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { planTsconfigAliases } from "#vgknapauto04";
import { collectPackageJsonImportsSyncState, collectPackageJsonImportsSyncStateFromAliasMap } from "#51kcncizdqcz";
import { filterSourceFilesForRule } from "#jizekc8duh4i";
import type { NormalizedImportsOptions, ScannedSourceFile } from "#pkb9x3eo56l7";
import { supportsImports } from "#87jyjzn68rrk";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleChunkAt, emitRuleChunkStarted, emitRuleCompleted } from "#efe33sls019o";
import { shouldRunRule } from "#ydyygm5y7vgb";
import { buildNormalizedSyncOptions } from "#ug46qontqfe9";
import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import { runProgressiveNativeDryRule } from "./dry.js";

const CHUNKABLE_NATIVE_RULES = new Set<NativeCheckRuleKey>([
    "bannedPatterns",
    "bannedFiles",
    "minFileLines",
    "minDeclarationName",
    "maxDeclarationName",
    "maxFileLines",
    "maxCharactersPerLine",
    "maxFunctionLines",
    "removeComments",
    "structuralBlankLines",
]);
const DEFAULT_NATIVE_RULE_CHUNK_LIMITS = {
  maxBytes: 1024 * 1024,
  maxFiles: 128,
};
const HEAVY_NATIVE_RULE_CHUNK_LIMITS: Partial<Record<NativeCheckRuleKey, NativeRuleChunkLimits>> = {
  bannedPatterns: { maxBytes: 256 * 1024, maxFiles: 64 },
  dry: { maxBytes: 1024 * 1024, maxFiles: 256 },
  minDeclarationName: { maxBytes: 128 * 1024, maxFiles: 64 },
  maxDeclarationName: { maxBytes: 128 * 1024, maxFiles: 64 },
  maxFunctionLines: { maxBytes: 128 * 1024, maxFiles: 64 },
  removeComments: { maxBytes: 256 * 1024, maxFiles: 64 },
  structuralBlankLines: { maxBytes: 256 * 1024, maxFiles: 64 },
};

type NativeCheckRulesResponse = {
  violations: CodeDisciplineViolation[];
};

type NativeCheckRules = ReturnType<typeof selectNativeRules>;
type NativeCheckRuleKey = keyof NativeCheckRules;
type NativeRuleChunkLimits = {
  maxBytes: number;
  maxFiles: number;
};
type NativeRuleBatch = {
  byteSize: number;
  files: ScannedSourceFile[];
};
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
  const progress = createRuleProgress({
      chunkSize: 1,
      observer: options.progressObserver,
      rule: "imports",
      stage: "sync",
      totalItems: sourceFiles.length,
  });
  const normalized = await buildNormalizedSyncOptions(options, false);
  if (!normalized) {
    emitRuleCompleted(progress, 0);
    return { syncViolations: [] };
  }
  if (!Array.isArray(normalized.allowRelative)) {
    throw new Error("imports.allowRelative functions are not supported by the native check backend");
  }
  const supportedSourceFiles = filterSourceFilesForRule(sourceFiles, options.rules.imports)
  .filter((file) => supportsImports(file.extension));
  emitRuleChunkAt(progress, 1, sourceFiles.length, 0, {
      chunkBytes: 0,
      chunkItems: supportedSourceFiles.length,
      currentFile: "imports source filter",
  });
  const aliasPlan = await planTsconfigAliases(normalized, supportedSourceFiles);
  emitRuleChunkAt(progress, 2, sourceFiles.length, 0, {
      chunkBytes: 0,
      chunkItems: aliasPlan.aliasRecords.length,
      currentFile: "tsconfig alias plan",
  });
  const packageJsonSyncState = await collectPackageSyncState(normalized, aliasPlan);
  const syncViolations = createImportSyncViolation({
      aliasesChanged: aliasPlan.aliasesChanged,
      aliasPlan,
      normalized,
      packageJsonSyncState,
  });
  emitRuleCompleted(progress, syncViolations.length);
  return {
    syncViolations,
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
    maxDeclarationName: shouldRunRule("max-declaration-name", options.onlyRules) ? options.rules.maxDeclarationName : undefined,
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

function runNativeCheckRule(entry: NativeCheckRuleEntry, sourceFiles = entry.sourceFiles): CodeDisciplineViolation[] {
  const response = JSON.parse(requireNativeBinding().runCheckRules(JSON.stringify({
          sourceFiles,
          rules: {
            [entry.key]: entry.ruleConfig,
          },
  }))) as NativeCheckRulesResponse;
  return Array.isArray(response.violations) ? response.violations : [];
}

function canChunkNativeCheckRule(entry: NativeCheckRuleEntry): boolean {
  if (!CHUNKABLE_NATIVE_RULES.has(entry.key)) return false;
  const limits = nativeRuleChunkLimits(entry.key);
  return entry.sourceFiles.length > limits.maxFiles || entry.sourceFiles.reduce((sum, file) => sum + sourceFileByteSize(file), 0) > limits.maxBytes;
}

function runChunkedNativeCheckRule(entry: NativeCheckRuleEntry, progress: ReturnType<typeof createRuleProgress>): CodeDisciplineViolation[] {
  const violations: CodeDisciplineViolation[] = [];
  let completedItems = 0;
  let chunkIndex = 0;

  for (const batch of createNativeRuleBatches(entry.sourceFiles, nativeRuleChunkLimits(entry.key))) {
    chunkIndex += 1;
    emitRuleChunkStarted(progress, chunkIndex, completedItems, {
        chunkBytes: batch.byteSize,
        chunkItems: batch.files.length,
        currentFile: batch.files[0]?.relativeFromProjectRoot,
    });
    violations.push(...runNativeCheckRule(entry, batch.files));
    completedItems += batch.files.length;
    emitRuleChunkAt(progress, chunkIndex, completedItems, violations.length, {
        chunkBytes: batch.byteSize,
        chunkItems: batch.files.length,
        currentFile: batch.files[0]?.relativeFromProjectRoot,
    });
  }

  return violations;
}

function nativeRuleChunkLimits(key: NativeCheckRuleKey): NativeRuleChunkLimits {
  return HEAVY_NATIVE_RULE_CHUNK_LIMITS[key] ?? DEFAULT_NATIVE_RULE_CHUNK_LIMITS;
}

function sourceFileByteSize(file: ScannedSourceFile): number {
  return Math.max(1, file.byteSize ?? 0);
}

function createNativeRuleBatches(sourceFiles: ScannedSourceFile[], limits: NativeRuleChunkLimits): NativeRuleBatch[] {
  const batches: NativeRuleBatch[] = [];
  let files: ScannedSourceFile[] = [];
  let byteSize = 0;

  for (const file of sourceFiles) {
    const nextSize = sourceFileByteSize(file);
    if (files.length > 0 && (files.length >= limits.maxFiles || byteSize + nextSize > limits.maxBytes)) {
      batches.push({ byteSize, files });
      files = [];
      byteSize = 0;
    }
    files.push(file);
    byteSize += nextSize;
  }

  if (files.length > 0) {
    batches.push({ byteSize, files });
  }
  return batches;
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
  pushNativeCheckRule(entries, sourceFiles, "maxDeclarationName", "max-declaration-name", rules.maxDeclarationName);
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
        chunkSize: nativeRuleChunkLimits(entry.key).maxFiles,
        observer: options.progressObserver,
        rule: entry.rule,
        totalItems: entry.sourceFiles.length,
    });
    const ruleViolations = entry.key === "dry"
    ? runProgressiveNativeDryRule(entry, nativeRuleChunkLimits(entry.key), progress)
    : canChunkNativeCheckRule(entry)
    ? runChunkedNativeCheckRule(entry, progress)
    : runNativeCheckRule(entry);
    violations.push(...(entry.syncViolations ?? []), ...ruleViolations);
    emitRuleCompleted(progress, (entry.syncViolations?.length ?? 0) + ruleViolations.length);
  }
  return violations;
}

export { collectNativeCheckViolations };
