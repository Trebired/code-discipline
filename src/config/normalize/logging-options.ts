import { InvalidCodeDisciplineConfigError } from "../../shared/errors.js";
import type { LoggingOptions } from "../../shared/logging-types.js";

function normalizeLoggingOptions(options: LoggingOptions | undefined, label: string): LoggingOptions {
  const source = (options ?? {}) as Record<string, unknown>;

  for (const key of ["enabled", "quiet"]) {
    if (key in source) {
      throw new InvalidCodeDisciplineConfigError(`${label}.${key} is no longer supported`, {
        key,
      });
    }
  }

  return {
    logger: options?.logger,
    adapter: options?.adapter,
  };
}

export { normalizeLoggingOptions };
