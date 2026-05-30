export {
  DEFAULT_ALIAS_PREFIX,
  DEFAULT_ALIAS_RANDOM_LENGTH,
  DEFAULT_ALIAS_STRATEGY,
  DEFAULT_FOLDERIZE_COMPOUND_FILES_SEVERITY,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SUFFIXES,
  DEFAULT_EXCLUDE_DIRS,
  DEFAULT_IMPORTS_REWRITE,
  DEFAULT_KEEP_RELATIVE,
  DEFAULT_MAX_FILE_LINES_SEVERITY,
  DEFAULT_SOURCE_EXTENSIONS,
  DEFAULT_SOURCE_ROOT,
} from "./shared/constants.js";

export { checkCodeDiscipline } from "./checks/index.js";
export { defineCodeDisciplineConfig, loadCodeDisciplineConfig } from "./config/index.js";
export { normalizeSyncImportsOptions } from "./config/normalize-sync-imports-options.js";
export { syncTsconfigAliases } from "./imports/aliases.js";
export { resolveRelativeImport } from "./imports/resolve.js";
export { rewriteSourceImports } from "./imports/rewrite.js";
export { scanSourceFiles } from "./imports/scan.js";
export { createRandomAlias, createRelativePathHashAlias, createRelativePathSlugAlias } from "./imports/strategies.js";
export { syncImports } from "./imports/sync-imports.js";
export { resolveLogger } from "./shared/logging.js";

export {
  AliasCollisionError,
  InvalidCodeDisciplineConfigError,
  InvalidAliasError,
  InvalidProjectRootError,
  InvalidSourceRootError,
  InvalidTsconfigPathError,
  ParseFailureError,
  RewriteFailureError,
  SyncImportsError,
  isSyncImportsError,
} from "./shared/errors.js";

export type {
  LogAdapterFn,
  NormalizedSyncImportsLogger,
  SyncImportsLogEvent,
  SyncImportsLogLevel,
} from "./shared/logging-types.js";

export type {
  AliasRecord,
  AliasStrategyFn,
  AliasStrategyInput,
  KeepRelativeContext,
  KeepRelativeFn,
  NormalizedSyncImportsOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
  SourceScanOptions,
  SyncAliasesResult,
  SyncImportsOptions,
  SyncImportsResult,
  TsconfigJson,
} from "./imports/types.js";

export type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineRuleName,
  CodeDisciplineRuleSeverity,
  CodeDisciplineRules,
  CodeDisciplineViolation,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxFileLinesRule,
  SyncImportsRuleOptions,
} from "./checks/types.js";
