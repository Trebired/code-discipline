import type { LoggingOptions } from "../shared/logging-types.js";
import type { SourceScanOptions, SyncImportsRuleOptions } from "../imports/types.js";
import type { CodeDisciplineResult, CodeDisciplineSeverity } from "../shared/discipline-types.js";

type CodeDisciplineMode = "check" | "fix" | "sync";
type CodeDisciplineRuntimeMode = CodeDisciplineMode | "startup";

type SeverityRuleOptions = {
  severity?: CodeDisciplineSeverity;
};

type MaxFileLinesRuleOptions = SeverityRuleOptions & {
  max?: number;
};

type MaxFunctionLinesRuleOptions = SeverityRuleOptions & {
  max?: number;
};

type FolderizeCompoundFilesRuleOptions = SeverityRuleOptions & {
  fix?: boolean;
  separators?: string[];
};

type CodeDisciplineRules = {
  maxFileLines?: MaxFileLinesRuleOptions;
  maxFunctionLines?: MaxFunctionLinesRuleOptions;
  folderizeCompoundFiles?: FolderizeCompoundFilesRuleOptions;
  syncImports?: SyncImportsRuleOptions;
};

type TsconfigPathsNormalizeMode = "relative-dot-prefix" | "strip-dot-prefix" | "none";

type CodeDisciplineTsconfigPathsOptions = {
  tsconfigPath?: string;
  normalize?: TsconfigPathsNormalizeMode;
  restoreAfterRun?: boolean;
};

type CodeDisciplineRuntimeImportsSyncOptions = {
  enabled?: boolean;
  source?: "tsconfig.paths";
  target?: "package.json.imports";
  aliasPrefix?: string | string[];
  packageJsonPath?: string;
  tsconfigPath?: string;
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
  sourceRoot?: string;
  sourceExtensions?: string[];
  excludeDirs?: string[];
  logging?: LoggingOptions;
  rules?: CodeDisciplineRules;
  lifecycle?: CodeDisciplineLifecycleHooks;
  tsconfigPaths?: CodeDisciplineTsconfigPathsOptions;
  runtimeImportsSync?: CodeDisciplineRuntimeImportsSyncOptions;
};

type FixCodeDisciplineOptions = CheckCodeDisciplineOptions;

type CodeDisciplineConfig = Omit<CheckCodeDisciplineOptions, "projectRoot">;

type NormalizedMaxFileLinesRule = {
  severity: CodeDisciplineSeverity;
  max: number;
};

type NormalizedMaxFunctionLinesRule = {
  severity: CodeDisciplineSeverity;
  max: number;
};

type NormalizedFolderizeCompoundFilesRule = {
  severity: CodeDisciplineSeverity;
  fix: boolean;
  separators: string[];
};

type NormalizedCheckCodeDisciplineOptions = SourceScanOptions & {
  sourceRootRelative: string;
  logging: LoggingOptions;
  rules: {
    maxFileLines?: NormalizedMaxFileLinesRule;
    maxFunctionLines?: NormalizedMaxFunctionLinesRule;
    folderizeCompoundFiles?: NormalizedFolderizeCompoundFilesRule;
    syncImports?: SyncImportsRuleOptions;
  };
};

type CheckCodeDisciplineResult = CodeDisciplineResult;

type FixCodeDisciplineResult = CodeDisciplineResult & {
  moved_files: number;
  rewritten_files: number;
  rewritten_imports: number;
};

export type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineLifecycleContext,
  CodeDisciplineLifecycleHookResult,
  CodeDisciplineLifecycleHooks,
  CodeDisciplineMode,
  CodeDisciplineRuntimeImportsSyncOptions,
  CodeDisciplineRuntimeMode,
  CodeDisciplineRules,
  CodeDisciplineTsconfigPathsOptions,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxFileLinesRule,
  NormalizedMaxFunctionLinesRule,
  SeverityRuleOptions,
  TsconfigPathsNormalizeMode,
};
