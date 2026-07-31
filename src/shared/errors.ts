type ImportsErrorCode =
  | "invalid_project_root"
  | "invalid_source_root"
  | "invalid_tsconfig_path"
  | "invalid_config"
  | "alias_collision"
  | "invalid_alias"
  | "rewrite_failure"
  | "parse_failure"
  | "file_conflict"
  | "fix_failure";

class ImportsError extends Error {
  code: ImportsErrorCode | string;
  details: Record<string, unknown>;

  constructor(code: ImportsErrorCode | string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ImportsError";
    this.code = code;
    this.details = details;
  }
}

class InvalidProjectRootError extends ImportsError {
  constructor(projectRoot: string) {
    super("invalid_project_root", `Invalid project root: ${projectRoot}`, { projectRoot });
    this.name = "InvalidProjectRootError";
  }
}

class InvalidSourceRootError extends ImportsError {
  constructor(sourceRoot: string) {
    super("invalid_source_root", `Invalid source root: ${sourceRoot}`, { sourceRoot });
    this.name = "InvalidSourceRootError";
  }
}

class InvalidTsconfigPathError extends ImportsError {
  constructor(tsconfigPath: string) {
    super("invalid_tsconfig_path", `Invalid tsconfig path: ${tsconfigPath}`, { tsconfigPath });
    this.name = "InvalidTsconfigPathError";
  }
}

class InvalidCodeDisciplineConfigError extends ImportsError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("invalid_config", message, details);
    this.name = "InvalidCodeDisciplineConfigError";
  }
}

class AliasCollisionError extends ImportsError {
  constructor(aliasId: string, details: Record<string, unknown> = {}) {
    super("alias_collision", `Alias collision: ${aliasId}`, { aliasId, ...details });
    this.name = "AliasCollisionError";
  }
}

class InvalidAliasError extends ImportsError {
  constructor(aliasId: unknown, details: Record<string, unknown> = {}) {
    super("invalid_alias", `Invalid alias id: ${String(aliasId)}`, { aliasId, ...details });
    this.name = "InvalidAliasError";
  }
}

class RewriteFailureError extends ImportsError {
  constructor(filePath: string, cause?: unknown) {
    super("rewrite_failure", `Failed to rewrite imports in ${filePath}`, {
      filePath,
      cause: cause instanceof Error ? cause.message : cause,
    });
    this.name = "RewriteFailureError";
  }
}

class ParseFailureError extends ImportsError {
  constructor(filePath: string, diagnostics: unknown) {
    super("parse_failure", `Failed to parse ${filePath}`, { filePath, diagnostics });
    this.name = "ParseFailureError";
  }
}

class FileConflictError extends ImportsError {
  constructor(filePath: string, details: Record<string, unknown> = {}) {
    super("file_conflict", `File conflict: ${filePath}`, { filePath, ...details });
    this.name = "FileConflictError";
  }
}

class FixFailureError extends ImportsError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("fix_failure", message, details);
    this.name = "FixFailureError";
  }
}

function isImportsError(value: unknown): value is ImportsError {
  return value instanceof ImportsError;
}

export {
  AliasCollisionError,
  FileConflictError,
  FixFailureError,
  InvalidCodeDisciplineConfigError,
  InvalidAliasError,
  InvalidProjectRootError,
  InvalidSourceRootError,
  InvalidTsconfigPathError,
  ParseFailureError,
  RewriteFailureError,
  ImportsError,
  isImportsError,
};
export type { ImportsErrorCode };
