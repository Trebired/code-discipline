import type { ResultLike } from "@trebired/result";

type CodeDisciplineRuleName =
  | "max-file-lines"
  | "max-function-lines"
  | "folderize-compound-files"
  | "sync-imports"
  | "remove-comments"
  | "dry"
  | "evasion-guards";

type CodeDisciplineViolation = {
  rule: CodeDisciplineRuleName;
  fix: boolean;
  filePath: string;
  message: string;
  details: Record<string, unknown>;
  suggestedPath?: string;
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
};
