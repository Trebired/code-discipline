type SyncImportsErrorCode =
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

class SyncImportsError extends Error {
  code: SyncImportsErrorCode | string;
  details: Record<string, unknown>;

  constructor(code: SyncImportsErrorCode | string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "SyncImportsError";
    this.code = code;
    this.details = details;
  }
}

class InvalidProjectRootError extends SyncImportsError {
  constructor(projectRoot: string) {
    super("invalid_project_root", `Invalid project root: ${projectRoot}`, { projectRoot });
    this.name = "InvalidProjectRootError";
  }
}

class InvalidSourceRootError extends SyncImportsError {
  constructor(sourceRoot: string) {
    super("invalid_source_root", `Invalid source root: ${sourceRoot}`, { sourceRoot });
    this.name = "InvalidSourceRootError";
  }
}

class InvalidTsconfigPathError extends SyncImportsError {
  constructor(tsconfigPath: string) {
    super("invalid_tsconfig_path", `Invalid tsconfig path: ${tsconfigPath}`, { tsconfigPath });
    this.name = "InvalidTsconfigPathError";
  }
}

class InvalidCodeDisciplineConfigError extends SyncImportsError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("invalid_config", message, details);
    this.name = "InvalidCodeDisciplineConfigError";
  }
}

class AliasCollisionError extends SyncImportsError {
  constructor(aliasId: string, details: Record<string, unknown> = {}) {
    super("alias_collision", `Alias collision: ${aliasId}`, { aliasId, ...details });
    this.name = "AliasCollisionError";
  }
}

class InvalidAliasError extends SyncImportsError {
  constructor(aliasId: unknown, details: Record<string, unknown> = {}) {
    super("invalid_alias", `Invalid alias id: ${String(aliasId)}`, { aliasId, ...details });
    this.name = "InvalidAliasError";
  }
}

class RewriteFailureError extends SyncImportsError {
  constructor(filePath: string, cause?: unknown) {
    super("rewrite_failure", `Failed to rewrite imports in ${filePath}`, {
      filePath,
      cause: cause instanceof Error ? cause.message : cause,
    });
    this.name = "RewriteFailureError";
  }
}

class ParseFailureError extends SyncImportsError {
  constructor(filePath: string, diagnostics: unknown) {
    super("parse_failure", `Failed to parse ${filePath}`, { filePath, diagnostics });
    this.name = "ParseFailureError";
  }
}

class FileConflictError extends SyncImportsError {
  constructor(filePath: string, details: Record<string, unknown> = {}) {
    super("file_conflict", `File conflict: ${filePath}`, { filePath, ...details });
    this.name = "FileConflictError";
  }
}

class FixFailureError extends SyncImportsError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("fix_failure", message, details);
    this.name = "FixFailureError";
  }
}

function isSyncImportsError(value: unknown): value is SyncImportsError {
  return value instanceof SyncImportsError;
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
  SyncImportsError,
  isSyncImportsError,
};
export type { SyncImportsErrorCode };
