import { createLog, type LogInstance } from "@trebired/logger";

import { CODE_DISCIPLINE_LOG_GROUP } from "../shared/constants.js";

type CliLogLevel = "fail" | "info" | "warn";

function createDefaultCliLogger(): LogInstance {
  return createLog({
    console: {
      metadata: false,
      timestamp: false,
    },
    quiet: true,
    save: false,
    source: "@trebired/code-discipline",
  });
}

function writeLogText(logger: LogInstance, level: CliLogLevel, text: string): void {
  const method = level === "fail" ? logger.fail : level === "warn" ? logger.warn : logger.info;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    method.call(logger, `${CODE_DISCIPLINE_LOG_GROUP}.cli`, line);
  }
}

export { createDefaultCliLogger, writeLogText };
