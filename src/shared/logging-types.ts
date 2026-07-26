type CodeDisciplineLogLevel = "debug" | "info" | "warn" | "fail" | "error" | "success";

type CodeDisciplineLogEvent = {
  group?: string;
  level: CodeDisciplineLogLevel;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
};

type CodeDisciplineLogContext = {
  group?: string;
};

type CodeDisciplineLogAdapterFn = (event: CodeDisciplineLogEvent) => void;

type LoggingOptions = {
  adapter?: "logger" | "generic" | "console" | CodeDisciplineLogAdapterFn;
  logger?: unknown;
  warnings?: boolean;
};

type NormalizedCodeDisciplineLogger = {
  enabled: boolean;
  debug: (event: string, message: string, metadata?: Record<string, unknown>, context?: CodeDisciplineLogContext) => void;
  info: (event: string, message: string, metadata?: Record<string, unknown>, context?: CodeDisciplineLogContext) => void;
  warn: (event: string, message: string, metadata?: Record<string, unknown>, context?: CodeDisciplineLogContext) => void;
  error: (event: string, message: string, metadata?: Record<string, unknown>, context?: CodeDisciplineLogContext) => void;
  success: (event: string, message: string, metadata?: Record<string, unknown>, context?: CodeDisciplineLogContext) => void;
  flush: (
    level: CodeDisciplineLogLevel,
    event: string,
    message: string,
    metadata?: Record<string, unknown>,
    context?: CodeDisciplineLogContext,
  ) => void;
};

type SyncImportsLogLevel = CodeDisciplineLogLevel;
type SyncImportsLogEvent = CodeDisciplineLogEvent;
type LogAdapterFn = CodeDisciplineLogAdapterFn;
type NormalizedSyncImportsLogger = NormalizedCodeDisciplineLogger;

export type {
  CodeDisciplineLogAdapterFn,
  CodeDisciplineLogContext,
  CodeDisciplineLogEvent,
  CodeDisciplineLogLevel,
  LoggingOptions,
  LogAdapterFn,
  NormalizedCodeDisciplineLogger,
  NormalizedSyncImportsLogger,
  SyncImportsLogEvent,
  SyncImportsLogLevel,
};
