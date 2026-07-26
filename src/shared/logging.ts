import { createLog, type LogInstance } from "@package/logger";

import { CODE_DISCIPLINE_LOG_GROUP } from "./constants.js";
import type {
  CodeDisciplineLogAdapterFn,
  CodeDisciplineLogContext,
  CodeDisciplineLogEvent,
  CodeDisciplineLogLevel,
  LoggingOptions,
  NormalizedCodeDisciplineLogger,
} from "./logging-types.js";

type LogMethod = (...args: unknown[]) => unknown;

type BufferedEventAggregate = {
  count: number;
  event: string;
  group: string;
};

type BufferedEventStore = {
  aggregates: Map<string, BufferedEventAggregate>;
  levelCounts: Record<CodeDisciplineLogLevel, number>;
  totalEvents: number;
};

let consoleOnlyLogger: LogInstance | null = null;

function getConsoleOnlyLogger(): LogInstance {
  consoleOnlyLogger ??= createLog({
    console: true,
    quiet: true,
    save: false,
    source: "@package/code-discipline",
  });
  return consoleOnlyLogger;
}

function getMethod(source: unknown, name: string): LogMethod | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[name];
  return typeof value === "function" ? (value as LogMethod) : null;
}

function looksLikePackageLogger(source: unknown): boolean {
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

function formatMessage(group: string, message: string): string {
  return `[${group}] ${message}`;
}

function eventGroup(event: CodeDisciplineLogEvent): string {
  return String(event.group || CODE_DISCIPLINE_LOG_GROUP);
}

function buildEvent(
  level: CodeDisciplineLogLevel,
  event: string,
  message: string,
  metadata?: Record<string, unknown>,
  context?: CodeDisciplineLogContext,
): CodeDisciplineLogEvent {
  return {
    event,
    group: context?.group,
    level,
    message,
    metadata,
  };
}

function writeToConsole(event: CodeDisciplineLogEvent) {
  writeToPackageLogger(getConsoleOnlyLogger(), event);
}

function writeToGenericLogger(source: unknown, event: CodeDisciplineLogEvent) {
  const methodName = event.level === "success" ? "info" : event.level;
  const method = getMethod(source, methodName) || getMethod(source, "log") || getMethod(source, "write");

  if (!method) {
    writeToConsole(event);
    return;
  }

  const payload = buildMetadata(event.event, event.metadata);
  method.call(source, formatMessage(eventGroup(event), event.message), payload);
}

function writeToPackageLogger(source: unknown, event: CodeDisciplineLogEvent) {
  const methodName = event.level === "error" ? "fail" : event.level;
  const target = source || getConsoleOnlyLogger();
  const method = getMethod(target, methodName) || getMethod(target, event.level) || getMethod(target, "info");

  if (!method) {
    writeToGenericLogger(console, event);
    return;
  }

  method.call(target, eventGroup(event), event.message, buildMetadata(event.event, event.metadata));
}

function resolveWriter(options?: LoggingOptions): (event: CodeDisciplineLogEvent) => void {
  const adapter = options?.adapter;
  const logger = options?.logger;

  if (typeof adapter === "function") {
    return adapter as CodeDisciplineLogAdapterFn;
  }

  if (adapter === "console") {
    return writeToConsole;
  }

  if (adapter === "logger") {
    return (event) => writeToPackageLogger(logger, event);
  }

  if (adapter === "generic") {
    return (event) => writeToGenericLogger(logger, event);
  }

  if (looksLikePackageLogger(logger)) {
    return (event) => writeToPackageLogger(logger, event);
  }

  if (logger) {
    return (event) => writeToGenericLogger(logger, event);
  }

  return () => {};
}

function createBufferedEventStore(): BufferedEventStore {
  return {
    aggregates: new Map(),
    levelCounts: {
      debug: 0,
      error: 0,
      fail: 0,
      info: 0,
      success: 0,
      warn: 0,
    },
    totalEvents: 0,
  };
}

function bufferEvent(store: BufferedEventStore, event: CodeDisciplineLogEvent) {
  const group = eventGroup(event);
  const key = `${group}::${event.event}`;
  const existing = store.aggregates.get(key) ?? {
    count: 0,
    event: event.event,
    group,
  };

  existing.count += 1;
  store.aggregates.set(key, existing);
  store.levelCounts[event.level] += 1;
  store.totalEvents += 1;
}

function summarizeBufferedEvents(store: BufferedEventStore): Record<string, unknown> {
  return {
    total_events: store.totalEvents,
    level_counts: store.levelCounts,
    events: Array.from(store.aggregates.values())
      .sort((left, right) => left.group.localeCompare(right.group) || left.event.localeCompare(right.event))
      .map((entry) => ({
        count: entry.count,
        event: entry.event,
        group: entry.group,
      })),
  };
}

function writeInitializedEvent(enabled: boolean, writer: (event: CodeDisciplineLogEvent) => void): void {
  if (enabled) {
    writer({
      event: "package-initialized",
      group: `${CODE_DISCIPLINE_LOG_GROUP}.initialize`,
      level: "success",
      message: "@package/code-discipline initialized",
    });
  }
}

function createEmitter(args: {
  enabled: boolean;
  getStore: () => BufferedEventStore;
}) {
  return (
    level: CodeDisciplineLogLevel,
    event: string,
    message: string,
    metadata?: Record<string, unknown>,
    context?: CodeDisciplineLogContext,
  ) => {
    const bufferedEvents = args.getStore();
    if (!args.enabled) return;

    bufferEvent(bufferedEvents, buildEvent(level, event, message, metadata, context));
  };
}

function createFlusher(args: {
  enabled: boolean;
  getStore: () => BufferedEventStore;
  resetStore: () => void;
  writer: (event: CodeDisciplineLogEvent) => void;
}) {
  return (
    level: CodeDisciplineLogLevel,
    event: string,
    message: string,
    metadata?: Record<string, unknown>,
    context?: CodeDisciplineLogContext,
  ) => {
    if (!args.enabled) return;

    const bufferedEvents = args.getStore();
    const diagnostics = summarizeBufferedEvents(bufferedEvents);
    const finalMetadata = bufferedEvents.totalEvents > 0
      ? {
          ...(metadata ?? {}),
          diagnostics,
      }
      : metadata;

    args.writer(buildEvent(level, event, message, finalMetadata, context));
    args.resetStore();
  };
}

function resolveLogger(options?: LoggingOptions): NormalizedCodeDisciplineLogger {
  const enabled = Boolean(options?.logger || options?.adapter);
  const writer = resolveWriter(options);
  let bufferedEvents = createBufferedEventStore();
  const getStore = () => bufferedEvents;
  const resetStore = () => {
    bufferedEvents = createBufferedEventStore();
  };
  const emit = createEmitter({ enabled, getStore });
  const flush = createFlusher({ enabled, getStore, resetStore, writer });

  writeInitializedEvent(enabled, writer);

  return {
    enabled,
    debug: (event, message, metadata) => emit("debug", event, message, metadata),
    info: (event, message, metadata) => emit("info", event, message, metadata),
    warn: (event, message, metadata) => emit("warn", event, message, metadata),
    error: (event, message, metadata) => emit("error", event, message, metadata),
    success: (event, message, metadata) => emit("success", event, message, metadata),
    flush,
  };
}

export { resolveLogger };
