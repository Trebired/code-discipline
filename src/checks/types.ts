import type { LoggingOptions } from "../shared/logging-types.js";
import type {
  PackageJsonImportsSyncOptions,
  SourceScanOptions,
  SyncImportsRuleOptions,
} from "../imports/types.js";
import type {
  CodeDisciplineResult,
  CodeDisciplineRuleName,
  CodeDisciplineViolation,
} from "../shared/discipline-types.js";

type CodeDisciplineRuleSlug = CodeDisciplineRuleName;
type FixableRuleSlug = "folderize-compound-files" | "sync-imports" | "dry";
type CodeDisciplineMode = "check" | "fix";
type CodeDisciplineRuntimeMode = CodeDisciplineMode;
type MaxFileLinesRuleOptions = {
  max?: number;
};

type MaxFunctionLinesRuleOptions = {
  max?: number;
};

type FolderizeCompoundFilesRuleOptions = {
  separators?: string[];
};

type DryHelperReference = {
  from: string;
  exportName: string;
  key?: string;
};

type DryRuleOptions = {
  helpers: DryHelperReference[];
};

type CodeDisciplinePackageJsonImportsOptions = PackageJsonImportsSyncOptions;

type CodeDisciplineSyncImportsRuleOptions = Omit<SyncImportsRuleOptions, "fix"> & {
  packageJsonImports?: CodeDisciplinePackageJsonImportsOptions;
};

type CodeDisciplineRules = {
  maxFileLines?: MaxFileLinesRuleOptions;
  maxFunctionLines?: MaxFunctionLinesRuleOptions;
  folderizeCompoundFiles?: FolderizeCompoundFilesRuleOptions;
  syncImports?: CodeDisciplineSyncImportsRuleOptions;
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
  sourceExtensions?: string[];
  excludeDirs?: string[];
  excludeGitIgnoredDirs?: boolean;
  gitignorePath?: string;
  logging?: LoggingOptions;
  rules?: CodeDisciplineRules;
  lifecycle?: CodeDisciplineLifecycleHooks;
  tsconfigPaths?: CodeDisciplineTsconfigPathsOptions;
  onlyRules?: CodeDisciplineRuleSlug[];
};

type FixCodeDisciplineOptions = Omit<CheckCodeDisciplineOptions, "onlyRules"> & {
  onlyRules?: FixableRuleSlug[];
};

type CodeDisciplineConfig = Omit<CheckCodeDisciplineOptions, "projectRoot">;

type NormalizedMaxFileLinesRule = {
  max: number;
};

type NormalizedMaxFunctionLinesRule = {
  max: number;
};

type NormalizedFolderizeCompoundFilesRule = {
  separators: string[];
};

type NormalizedDryRule = {
  helpers: DryHelperReference[];
};

type NormalizedCheckCodeDisciplineOptions = SourceScanOptions & {
  configPath?: string;
  sourceRootRelative: string;
  logging: LoggingOptions;
  onlyRules?: CodeDisciplineRuleSlug[] | FixableRuleSlug[];
  rules: {
    maxFileLines?: NormalizedMaxFileLinesRule;
    maxFunctionLines?: NormalizedMaxFunctionLinesRule;
    folderizeCompoundFiles?: NormalizedFolderizeCompoundFilesRule;
    syncImports?: CodeDisciplineSyncImportsRuleOptions;
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
  removed_duplicates?: number;
  added_imports?: number;
};

type FixCodeDisciplineResult = CodeDisciplineResult & {
  moved_files: number;
  rewritten_files: number;
  rewritten_imports: number;
  ruleResults: Partial<Record<FixableRuleSlug, FixCodeDisciplineRuleResult>>;
};

export type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineLifecycleContext,
  CodeDisciplineLifecycleHookResult,
  CodeDisciplineLifecycleHooks,
  CodeDisciplineMode,
  CodeDisciplinePackageJsonImportsOptions,
  CodeDisciplineRuleSlug,
  CodeDisciplineRuntimeMode,
  CodeDisciplineRules,
  CodeDisciplineSyncImportsRuleOptions,
  CodeDisciplineTsconfigPathsOptions,
  DryHelperReference,
  DryRuleOptions,
  FixableRuleSlug,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FixCodeDisciplineRuleResult,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedDryRule,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxFileLinesRule,
  NormalizedMaxFunctionLinesRule,
  TsconfigPathsNormalizeMode,
};
