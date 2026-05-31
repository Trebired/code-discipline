import { resolveLogger as resolveSharedLogger } from "@trebired/logger-adapter";

import { SYNC_IMPORTS_LOG_GROUP } from "./constants.js";
import type {
  LogAdapterFn,
  LoggingOptions,
  NormalizedSyncImportsLogger,
  SyncImportsLogEvent,
  SyncImportsLogLevel,
} from "./logging-types.js";

type LogMethod = (...args: unknown[]) => unknown;

function getMethod(source: unknown, name: string): LogMethod | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[name];
  return typeof value === "function" ? (value as LogMethod) : null;
}

function looksLikeTrebiredLogger(source: unknown): boolean {
  return Boolean(
    getMethod(source, "info")
      && getMethod(source, "warn")
      && (getMethod(source, "fail") || getMethod(source, "error"))
      && getMethod(source, "success"),
  );
}

function buildMetadata(eventName: string, metadata?: Record<string, unknown>): Record<string, unknown> {
  return metadata ? { event: eventName, ...metadata } : { event: eventName };
}

function formatMessage(message: string): string {
  return `[${SYNC_IMPORTS_LOG_GROUP}] ${message}`;
}

function shouldSkipForQuiet(level: SyncImportsLogLevel, quiet: boolean): boolean {
  return quiet && (level === "debug" || level === "info" || level === "success");
}

function writeToConsole(level: SyncImportsLogLevel, eventName: string, message: string, metadata?: Record<string, unknown>) {
  const payload = buildMetadata(eventName, metadata);
  const formatted = formatMessage(message);

  if (level === "error") {
    console.error(formatted, payload);
    return;
  }

  if (level === "warn") {
    console.warn(formatted, payload);
    return;
  }

  console.log(formatted, payload);
}

function writeToGenericLogger(source: unknown, level: SyncImportsLogLevel, eventName: string, message: string, metadata?: Record<string, unknown>) {
  const methodName = level === "success" ? "info" : level;
  const method = getMethod(source, methodName) || getMethod(source, "log") || getMethod(source, "write");

  if (!method) {
    writeToConsole(level, eventName, message, metadata);
    return;
  }

  const payload = buildMetadata(eventName, metadata);
  method.call(source, formatMessage(message), payload);
}

function writeToTrebiredLogger(source: unknown, level: SyncImportsLogLevel, eventName: string, message: string, metadata?: Record<string, unknown>) {
  const methodName = level === "error" ? "fail" : level;
  const method = getMethod(source, methodName) || getMethod(source, level) || getMethod(source, "info");

  if (!method) {
    writeToConsole(level, eventName, message, metadata);
    return;
  }

  method.call(source, SYNC_IMPORTS_LOG_GROUP, message, buildMetadata(eventName, metadata));
}

function writeWithSharedAdapter(
  logger: unknown,
  level: SyncImportsLogLevel,
  eventName: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  const shared = resolveSharedLogger({
    fallback: "console",
    logger: logger as any,
    source: "@trebired/code-discipline",
  });
  const payload = buildMetadata(eventName, metadata);

  if (level === "warn") {
    shared.warn(SYNC_IMPORTS_LOG_GROUP, message, payload);
    return;
  }

  if (level === "error") {
    shared.fail(SYNC_IMPORTS_LOG_GROUP, message, payload);
    return;
  }

  shared.info(SYNC_IMPORTS_LOG_GROUP, message, payload);
}

function resolveWriter(options?: LoggingOptions): (event: SyncImportsLogEvent) => void {
  const adapter = options?.adapter;
  const logger = options?.logger;

  if (typeof adapter === "function") {
    return adapter as LogAdapterFn;
  }

  if (adapter === "console") {
    return (event) => writeToConsole(event.level, event.event, event.message, event.metadata);
  }

  if (adapter === "trebired") {
    return (event) => writeToTrebiredLogger(logger, event.level, event.event, event.message, event.metadata);
  }

  if (adapter === "generic") {
    return (event) => writeToGenericLogger(logger, event.level, event.event, event.message, event.metadata);
  }

  if (looksLikeTrebiredLogger(logger)) {
    return (event) => writeToTrebiredLogger(logger, event.level, event.event, event.message, event.metadata);
  }

  if (logger) {
    return (event) => writeWithSharedAdapter(logger, event.level, event.event, event.message, event.metadata);
  }

  return (event) => writeWithSharedAdapter(undefined, event.level, event.event, event.message, event.metadata);
}

function resolveLogger(options?: LoggingOptions): NormalizedSyncImportsLogger {
  const enabled = options?.enabled ?? Boolean(options?.logger || options?.adapter);
  const quiet = options?.quiet ?? false;
  const writer = resolveWriter(options);

  function emit(level: SyncImportsLogLevel, event: string, message: string, metadata?: Record<string, unknown>) {
    if (!enabled) return;
    if (shouldSkipForQuiet(level, quiet)) return;
    writer({ level, event, message, metadata });
  }

  return {
    enabled,
    debug: (event, message, metadata) => emit("debug", event, message, metadata),
    info: (event, message, metadata) => emit("info", event, message, metadata),
    warn: (event, message, metadata) => emit("warn", event, message, metadata),
    error: (event, message, metadata) => emit("error", event, message, metadata),
    success: (event, message, metadata) => emit("success", event, message, metadata),
  };
}

export { resolveLogger };
