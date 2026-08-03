import type { ResultLike } from "@package/result";

type CodeDisciplineRuleName =
  | "banned-patterns"
  | "banned-files"
  | "min-file-lines"
  | "min-declaration-name"
  | "max-file-lines"
  | "max-characters-per-line"
  | "max-function-lines"
  | "folderize-compound-files"
  | "imports"
  | "remove-comments"
  | "structural-blank-lines"
  | "dry"
  | "format";

type CodeDisciplineFormatterName = "format";
type CodeDisciplineCheckName = CodeDisciplineRuleName | CodeDisciplineFormatterName;
type CodeDisciplineViolationSeverity = "fail" | "warning";

type CodeDisciplineViolation = {
  rule: CodeDisciplineCheckName;
  fix: boolean;
  filePath: string;
  message: string;
  details: Record<string, unknown>;
  suggestedPath?: string;
  severity?: CodeDisciplineViolationSeverity;
};

type CodeDisciplineResult = {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  result?: ResultLike<{
    violationCount: number;
  }, {
    rules: CodeDisciplineCheckName[];
  }>;
};

export type {
  CodeDisciplineCheckName,
  CodeDisciplineFormatterName,
  CodeDisciplineResult,
  CodeDisciplineRuleName,
  CodeDisciplineViolation,
  CodeDisciplineViolationSeverity,
};
