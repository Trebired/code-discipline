type SyncImportsLogLevel = "debug" | "info" | "warn" | "error" | "success";

type SyncImportsLogEvent = {
  level: SyncImportsLogLevel;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
};

type LogAdapterFn = (event: SyncImportsLogEvent) => void;

type LoggingOptions = {
  enabled?: boolean;
  logger?: unknown;
  adapter?: "trebired" | "generic" | "console" | LogAdapterFn;
  quiet?: boolean;
};

type NormalizedSyncImportsLogger = {
  enabled: boolean;
  debug: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  info: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  warn: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  error: (event: string, message: string, metadata?: Record<string, unknown>) => void;
  success: (event: string, message: string, metadata?: Record<string, unknown>) => void;
};

export type {
  LogAdapterFn,
  LoggingOptions,
  NormalizedSyncImportsLogger,
  SyncImportsLogEvent,
  SyncImportsLogLevel,
};
