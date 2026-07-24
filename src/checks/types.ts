import type { LoggingOptions } from "../shared/logging-types.js";
import type {
  ExcludeFoldersOptions,
  PackageJsonImportsSyncOptions,
  SourceProgressObserver,
  SourceScanObserver,
  SourceScanOptions,
  SyncImportsRuleOptions,
} from "../imports/types.js";
import type {
  CodeDisciplineResult,
  CodeDisciplineRuleName,
  CodeDisciplineViolation,
} from "../shared/discipline-types.js";

type CodeDisciplineRuleSlug = CodeDisciplineRuleName;
type FixableRuleSlug = "banned-files" | "min-file-lines" | "folderize-compound-files" | "sync-imports" | "remove-comments";
type CodeDisciplineMode = "check" | "fix";
type CodeDisciplineRuntimeMode = CodeDisciplineMode;
type CodeDisciplineRuleSeverity = "warning" | "fail";

type RuleExclusionOptions = {
  excludeFiles?: string[];
  excludeFolders?: string[];
};

type BannedPatternRuleEntry = string | {
  value: string;
  allowedFiles?: string[];
};

type BannedPatternsRuleOptions = RuleExclusionOptions & {
  patterns: BannedPatternRuleEntry[];
  severity?: CodeDisciplineRuleSeverity;
};

type BannedFileRuleEntry = string | {
  glob: string;
};

type BannedFilesRuleOptions = RuleExclusionOptions & {
  patterns: BannedFileRuleEntry[];
  severity?: CodeDisciplineRuleSeverity;
};

type MinFileLinesRuleOptions = RuleExclusionOptions & {
  min?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type MaxFileLinesRuleOptions = RuleExclusionOptions & {
  max?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type MaxCharactersPerLineRuleOptions = RuleExclusionOptions & {
  max?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type MaxFunctionLinesRuleOptions = RuleExclusionOptions & {
  max?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type FolderizeCompoundFilesRuleOptions = RuleExclusionOptions & {
  separators?: string[];
  severity?: CodeDisciplineRuleSeverity;
};

type RemoveCommentsRuleOptions = RuleExclusionOptions & {
  severity?: CodeDisciplineRuleSeverity;
  exclude?: string[];
};

type DryRuleOptions = RuleExclusionOptions & {
  minDuplicateCharacters?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type CodeDisciplinePackageJsonImportsOptions = PackageJsonImportsSyncOptions;

type CodeDisciplineSyncImportsRuleOptions = RuleExclusionOptions & Omit<SyncImportsRuleOptions, "fix" | "excludeFiles" | "excludeFolders"> & {
  packageJsonImports?: CodeDisciplinePackageJsonImportsOptions;
  severity?: CodeDisciplineRuleSeverity;
};

type CodeDisciplineRules = {
  bannedFiles?: BannedFilesRuleOptions;
  bannedPatterns?: BannedPatternsRuleOptions;
  minFileLines?: MinFileLinesRuleOptions;
  maxFileLines?: MaxFileLinesRuleOptions;
  maxCharactersPerLine?: MaxCharactersPerLineRuleOptions;
  maxFunctionLines?: MaxFunctionLinesRuleOptions;
  folderizeCompoundFiles?: FolderizeCompoundFilesRuleOptions;
  syncImports?: CodeDisciplineSyncImportsRuleOptions;
  removeComments?: RemoveCommentsRuleOptions;
  dry?: DryRuleOptions;
};

type TsconfigPathsNormalizeMode = "relative-dot-prefix" | "strip-dot-prefix" | "none";

type CodeDisciplineTsconfigPathsOptions = {
  tsconfigPath?: string;
  normalize?: TsconfigPathsNormalizeMode;
  restoreAfterRun?: boolean;
};

type CodeDisciplineLifecycleContext = {
  mode: CodeDisciplineRuntimeMode;
  projectRoot: string;
  configPath?: string;
  config: CodeDisciplineConfig;
  state: Record<string, unknown>;
};

type CodeDisciplineLifecycleHookResult = void | Promise<void>;

type CodeDisciplineLifecycleHooks = {
  beforeRun?: (context: CodeDisciplineLifecycleContext) => CodeDisciplineLifecycleHookResult;
  afterRun?: (context: CodeDisciplineLifecycleContext, result: unknown) => CodeDisciplineLifecycleHookResult;
  beforeMode?: (context: CodeDisciplineLifecycleContext) => CodeDisciplineLifecycleHookResult;
  afterMode?: (context: CodeDisciplineLifecycleContext, result: unknown) => CodeDisciplineLifecycleHookResult;
};

type CheckCodeDisciplineOptions = {
  projectRoot: string;
  configPath?: string;
  sourceRoot?: string;
  excludeSourceExtensions?: string[];
  excludeFolders?: ExcludeFoldersOptions;
  gitignorePath?: string;
  logging?: LoggingOptions;
  rules?: CodeDisciplineRules;
  lifecycle?: CodeDisciplineLifecycleHooks;
  tsconfigPaths?: CodeDisciplineTsconfigPathsOptions;
  onlyRules?: CodeDisciplineRuleSlug[];
  progressObserver?: SourceProgressObserver;
  scanObserver?: SourceScanObserver;
};

type FixCodeDisciplineOptions = Omit<CheckCodeDisciplineOptions, "onlyRules"> & {
  onlyRules?: FixableRuleSlug[];
};

type CodeDisciplineConfig = Omit<CheckCodeDisciplineOptions, "projectRoot">;

type NormalizedBannedPatternRuleEntry = {
  value: string;
  normalizedValue: string;
  allowedFiles: string[];
};

type NormalizedBannedPatternsRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  patterns: NormalizedBannedPatternRuleEntry[];
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedBannedFileRuleEntry = {
  glob: string;
};

type NormalizedBannedFilesRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  patterns: NormalizedBannedFileRuleEntry[];
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMinFileLinesRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  min: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMaxFileLinesRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  max: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMaxCharactersPerLineRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  max: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMaxFunctionLinesRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  max: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedFolderizeCompoundFilesRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  separators: string[];
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedDryRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  minDuplicateCharacters: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedRemoveCommentsRule = {
  excludeFiles: string[];
  excludeFolders: string[];
  severity: CodeDisciplineRuleSeverity;
  exclude: string[];
};

type NormalizedCheckCodeDisciplineOptions = SourceScanOptions & {
  configPath?: string;
  sourceRootRelative: string;
  logging: LoggingOptions;
  onlyRules?: CodeDisciplineRuleSlug[] | FixableRuleSlug[];
  progressObserver?: SourceProgressObserver;
  rules: {
    bannedFiles?: NormalizedBannedFilesRule;
    bannedPatterns?: NormalizedBannedPatternsRule;
    minFileLines?: NormalizedMinFileLinesRule;
    maxFileLines?: NormalizedMaxFileLinesRule;
    maxCharactersPerLine?: NormalizedMaxCharactersPerLineRule;
    maxFunctionLines?: NormalizedMaxFunctionLinesRule;
    folderizeCompoundFiles?: NormalizedFolderizeCompoundFilesRule;
    syncImports?: CodeDisciplineSyncImportsRuleOptions;
    removeComments?: NormalizedRemoveCommentsRule;
    dry?: NormalizedDryRule;
  };
};

type CheckCodeDisciplineResult = CodeDisciplineResult;

type FixCodeDisciplineRuleResult = {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  moved_files?: number;
  rewritten_files?: number;
  rewritten_imports?: number;
  removed_comments?: number;
  removed_duplicates?: number;
  added_imports?: number;
  deleted_files?: number;
};

type FixCodeDisciplineResult = CodeDisciplineResult & {
  deleted_files: number;
  moved_files: number;
  rewritten_files: number;
  rewritten_imports: number;
  removed_comments: number;
  ruleResults: Partial<Record<FixableRuleSlug, FixCodeDisciplineRuleResult>>;
};

export type {
  BannedPatternRuleEntry,
  BannedFileRuleEntry,
  BannedFilesRuleOptions,
  BannedPatternsRuleOptions,
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineLifecycleContext,
  CodeDisciplineLifecycleHookResult,
  CodeDisciplineLifecycleHooks,
  CodeDisciplineMode,
  CodeDisciplinePackageJsonImportsOptions,
  CodeDisciplineRuleSlug,
  CodeDisciplineRuleSeverity,
  CodeDisciplineRuntimeMode,
  CodeDisciplineRules,
  CodeDisciplineSyncImportsRuleOptions,
  CodeDisciplineTsconfigPathsOptions,
  DryRuleOptions,
  FixableRuleSlug,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FixCodeDisciplineRuleResult,
  FolderizeCompoundFilesRuleOptions,
  MaxCharactersPerLineRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  MinFileLinesRuleOptions,
  NormalizedBannedFileRuleEntry,
  NormalizedBannedFilesRule,
  NormalizedBannedPatternRuleEntry,
  NormalizedBannedPatternsRule,
  RemoveCommentsRuleOptions,
  RuleExclusionOptions,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedDryRule,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxCharactersPerLineRule,
  NormalizedMaxFileLinesRule,
  NormalizedMaxFunctionLinesRule,
  NormalizedMinFileLinesRule,
  NormalizedRemoveCommentsRule,
  TsconfigPathsNormalizeMode,
};
