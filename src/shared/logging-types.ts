type CodeDisciplineLogLevel = "debug" | "info" | "warn" | "error" | "success";

type CodeDisciplineLogEvent = {
  group?: string;
  level: CodeDisciplineLogLevel;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
};

type CodeDisciplineLogAdapterFn = (event: CodeDisciplineLogEvent) => void;

type LoggingOptions = {
  enabled?: boolean;
  logger?: unknown;
  adapter?: "trebired" | "generic" | "console" | CodeDisciplineLogAdapterFn;
  quiet?: boolean;
};

type NormalizedCodeDisciplineLogger = {
  enabled: boolean;
  debug: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  info: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  warn: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  error: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  success: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  flush: (level: CodeDisciplineLogLevel, event: string, message: string, metadata?: Record<string, unknown>) => void;
};

type SyncImportsLogLevel = CodeDisciplineLogLevel;
type SyncImportsLogEvent = CodeDisciplineLogEvent;
type LogAdapterFn = CodeDisciplineLogAdapterFn;
type NormalizedSyncImportsLogger = NormalizedCodeDisciplineLogger;

export type {
  CodeDisciplineLogAdapterFn,
  CodeDisciplineLogEvent,
  CodeDisciplineLogLevel,
  LoggingOptions,
  LogAdapterFn,
  NormalizedCodeDisciplineLogger,
  NormalizedSyncImportsLogger,
  SyncImportsLogEvent,
  SyncImportsLogLevel,
};
