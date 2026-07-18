import type { ResultLike } from "@trebired/result";

type CodeDisciplineRuleName =
  | "banned-patterns"
  | "banned-files"
  | "max-file-lines"
  | "max-function-lines"
  | "folderize-compound-files"
  | "sync-imports"
  | "remove-comments"
  | "dry"
  | "evasion-guards";

type CodeDisciplineViolationSeverity = "fail" | "warning";

type CodeDisciplineViolation = {
  rule: CodeDisciplineRuleName;
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
    rules: CodeDisciplineRuleName[];
  }>;
};

export type {
  CodeDisciplineResult,
  CodeDisciplineRuleName,
  CodeDisciplineViolation,
  CodeDisciplineViolationSeverity,
};
