import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import type { LoggingOptions } from "#uljkt8i26p4t";

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
