import type { SourceScanOptions, SyncImportsOptions } from "../imports/types.js";

type CodeDisciplineRuleSeverity = "warn" | "error";

type SyncImportsRuleOptions = Omit<SyncImportsOptions, "projectRoot"> & {
  enabled?: boolean;
};

type MaxFileLinesRuleOptions = {
  enabled?: boolean;
  max?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type FolderizeCompoundFilesRuleOptions = {
  enabled?: boolean;
  separators?: string[];
  suffixes?: string[];
  severity?: CodeDisciplineRuleSeverity;
};

type CodeDisciplineRules = {
  maxFileLines?: MaxFileLinesRuleOptions;
  folderizeCompoundFiles?: FolderizeCompoundFilesRuleOptions;
  syncImports?: SyncImportsRuleOptions;
};

type CheckCodeDisciplineOptions = {
  projectRoot: string;
  sourceRoot?: string;
  sourceExtensions?: string[];
  excludeDirs?: string[];
  rules?: CodeDisciplineRules;
};

type CodeDisciplineConfig = Omit<CheckCodeDisciplineOptions, "projectRoot">;

type NormalizedMaxFileLinesRule = {
  enabled: boolean;
  max: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedFolderizeCompoundFilesRule = {
  enabled: boolean;
  separators: string[];
  suffixes: string[];
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedCheckCodeDisciplineOptions = SourceScanOptions & {
  sourceRootRelative: string;
  rules: {
    maxFileLines: NormalizedMaxFileLinesRule;
    folderizeCompoundFiles: NormalizedFolderizeCompoundFilesRule;
  };
};

type CodeDisciplineRuleName = "max-file-lines" | "folderize-compound-files";

type CodeDisciplineViolation = {
  rule: CodeDisciplineRuleName;
  severity: CodeDisciplineRuleSeverity;
  filePath: string;
  message: string;
  details: Record<string, unknown>;
  suggestedPath?: string;
};

type CheckCodeDisciplineResult = {
  ok: boolean;
  warnings: number;
  errors: number;
  violations: CodeDisciplineViolation[];
};

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
};
