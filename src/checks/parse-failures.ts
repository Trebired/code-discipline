import { ParseFailureError } from "#4f8hale01wb4";
import type { CodeDisciplineRuleName, CodeDisciplineViolation } from "#bsmch74up4fm";

function isParseFailureError(error: unknown): error is ParseFailureError {
  return error instanceof ParseFailureError;
}

function parseFailureDiagnostics(error: ParseFailureError): string[] {
  const diagnostics = (error.details as { diagnostics?: unknown } | undefined)?.diagnostics;
  if (Array.isArray(diagnostics)) return diagnostics.map((entry) => String(entry));
  if (typeof diagnostics === "string") return [diagnostics];
  return [];
}

function createParseFailureViolation(
  rule: CodeDisciplineRuleName,
  filePath: string,
  error: ParseFailureError,
): CodeDisciplineViolation {
  const diagnostics = parseFailureDiagnostics(error);
  const summary = diagnostics[0] ?? "unknown parse error";

  return {
    rule,
    fix: false,
    filePath,
    message: `file could not be parsed and was skipped by ${rule}: ${summary}`,
    details: {
      parseFailure: true,
      diagnostics,
    },
  };
}

async function collectWithParseFailure<T>(
  rule: CodeDisciplineRuleName,
  filePath: string,
  violations: CodeDisciplineViolation[],
  run: () => Promise<T>|T,
): Promise<T|null> {
  try {
    return await run();
  } catch (caught) {
    if (!isParseFailureError(caught)) throw caught;
    violations.push(createParseFailureViolation(rule, filePath, caught));
    return null;
  }
}

export {
  collectWithParseFailure,
  createParseFailureViolation,
  isParseFailureError,
  parseFailureDiagnostics,
};
