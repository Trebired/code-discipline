import { resolveLogger as resolveSharedLogger } from "@trebired/logger-adapter";

import { CODE_DISCIPLINE_LOG_GROUP } from "./constants.js";
import type {
  CodeDisciplineLogAdapterFn,
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

function formatMessage(group: string, message: string): string {
  return `[${group}] ${message}`;
}

function eventGroup(event: CodeDisciplineLogEvent): string {
  return String(event.group || CODE_DISCIPLINE_LOG_GROUP);
}

function shouldSkipForQuiet(level: CodeDisciplineLogLevel, quiet: boolean): boolean {
  return quiet && (level === "debug" || level === "info" || level === "success");
}

function writeToConsole(event: CodeDisciplineLogEvent) {
  const formatted = formatMessage(eventGroup(event), event.message);
  const payload = event.metadata ? buildMetadata(event.event, event.metadata) : null;

  if (event.level === "error") {
    if (payload) {
      console.error(formatted, payload);
      return;
    }

    console.error(formatted);
    return;
  }

  if (event.level === "warn") {
    if (payload) {
      console.warn(formatted, payload);
      return;
    }

    console.warn(formatted);
    return;
  }

  if (payload) {
    console.log(formatted, payload);
    return;
  }

  console.log(formatted);
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

function writeToTrebiredLogger(source: unknown, event: CodeDisciplineLogEvent) {
  const methodName = event.level === "error" ? "fail" : event.level;
  const method = getMethod(source, methodName) || getMethod(source, event.level) || getMethod(source, "info");

  if (!method) {
    writeToConsole(event);
    return;
  }

  method.call(source, eventGroup(event), event.message, buildMetadata(event.event, event.metadata));
}

function writeWithSharedAdapter(logger: unknown, event: CodeDisciplineLogEvent) {
  const shared = resolveSharedLogger({
    fallback: "console",
    logger: logger as any,
    source: "@trebired/code-discipline",
  });
  const payload = buildMetadata(event.event, event.metadata);
  const group = eventGroup(event);

  if (event.level === "warn") {
    shared.warn(group, event.message, payload);
    return;
  }

  if (event.level === "error") {
    shared.fail(group, event.message, payload);
    return;
  }

  shared.info(group, event.message, payload);
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

  if (adapter === "trebired") {
    return (event) => writeToTrebiredLogger(logger, event);
  }

  if (adapter === "generic") {
    return (event) => writeToGenericLogger(logger, event);
  }

  if (looksLikeTrebiredLogger(logger)) {
    return (event) => writeToTrebiredLogger(logger, event);
  }

  if (logger) {
    return (event) => writeWithSharedAdapter(logger, event);
  }

  return () => {};
}

function createBufferedEventStore(): BufferedEventStore {
  return {
    aggregates: new Map(),
    levelCounts: {
      debug: 0,
      error: 0,
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

function resolveLogger(options?: LoggingOptions): NormalizedCodeDisciplineLogger {
  const enabled = options?.enabled ?? Boolean(options?.logger || options?.adapter);
  const quiet = options?.quiet ?? false;
  const writer = resolveWriter(options);
  let bufferedEvents = createBufferedEventStore();

  if (enabled) {
    writer({
      event: "package-initialized",
      group: `${CODE_DISCIPLINE_LOG_GROUP}.initialize`,
      level: "success",
      message: "@trebired/code-discipline initialized",
    });
  }

  function emit(level: CodeDisciplineLogLevel, event: string, message: string, metadata?: Record<string, unknown>) {
    if (!enabled) return;
    if (shouldSkipForQuiet(level, quiet)) return;

    bufferEvent(bufferedEvents, {
      event,
      level,
      message,
      metadata,
    });
  }

  function flush(level: CodeDisciplineLogLevel, event: string, message: string, metadata?: Record<string, unknown>) {
    if (!enabled) return;

    const diagnostics = summarizeBufferedEvents(bufferedEvents);
    const finalMetadata = bufferedEvents.totalEvents > 0
      ? {
          ...(metadata ?? {}),
          diagnostics,
        }
      : metadata;

    writer({
      event,
      level,
      message,
      metadata: finalMetadata,
    });
    bufferedEvents = createBufferedEventStore();
  }

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
