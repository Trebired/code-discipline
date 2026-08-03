import type {
  CodeFormatterOptions,
  CodeDisciplineFormatters,
  NormalizedCodeFormatter,
} from "#uqbg4indzud7";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";

const DEFAULT_CODE_FORMATTER_TARGETS = ["."];
const DEFAULT_CODE_FORMATTER_LINE_LIMIT = 100;

function normalizeStringList(value: unknown, fallback: string[], label: string, allowEmpty = false): string[] {
  if (value === undefined) return fallback;

  if (!Array.isArray(value)) {
    throw new InvalidCodeDisciplineConfigError(`${label} must be an array of strings`, {
      key: label,
      value,
    });
  }

  const normalized = value
    .map((entry) => {
      if (typeof entry !== "string") return "";
      const trimmed = entry.trim();
      return trimmed === "." ? "." : normalizeRelativePath(trimmed);
    })
    .filter(Boolean);

  if (!allowEmpty && normalized.length === 0) {
    throw new InvalidCodeDisciplineConfigError(`${label} must contain at least one non-empty string`, {
      key: label,
      value,
    });
  }

  return uniqueStrings(normalized);
}

function normalizeFormatterIgnore(value: CodeFormatterOptions["ignore"]): boolean {
  if (value === undefined) return true;
  if (typeof value === "boolean") return value;

  throw new InvalidCodeDisciplineConfigError("formatters.code.ignore must be boolean when provided", {
    key: "formatters.code.ignore",
    value,
  });
}

function normalizeBoolean(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;

  throw new InvalidCodeDisciplineConfigError(`${key} must be boolean when provided`, {
    key,
    value,
  });
}

function normalizePositiveInteger(value: unknown, fallback: number | undefined, key: string): number {
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new InvalidCodeDisciplineConfigError(`${key} must be a finite number when provided`, {
      key,
      value,
    });
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidCodeDisciplineConfigError(`${key} must be a finite number when provided`, {
      key,
      value,
    });
  }
  return Math.max(1, Math.floor(value));
}

function normalizeOptionalPositiveInteger(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined;
  return normalizePositiveInteger(value, undefined, key);
}

function normalizeCodeFormatter(
  rule: CodeFormatterOptions | undefined,
  defaults: { maxCharactersPerLine?: number } = {},
): NormalizedCodeFormatter | undefined {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  const unsupportedKeys = Object.keys(source).filter((key) => ![
    "targets",
    "ignore",
    "maxCharactersPerLine",
    "indentWidth",
    "finalNewline",
    "trimTrailingWhitespace",
    "collapseBlankLines",
  ].includes(key));

  if (unsupportedKeys.length > 0) {
    throw new InvalidCodeDisciplineConfigError("formatters.code contains unsupported option(s)", {
      key: "formatters.code",
      keys: unsupportedKeys,
    });
  }

  return {
    targets: normalizeStringList(rule.targets, DEFAULT_CODE_FORMATTER_TARGETS, "formatters.code.targets"),
    ignore: normalizeFormatterIgnore(rule.ignore),
    maxCharactersPerLine: normalizePositiveInteger(
      rule.maxCharactersPerLine,
      defaults.maxCharactersPerLine ?? DEFAULT_CODE_FORMATTER_LINE_LIMIT,
      "formatters.code.maxCharactersPerLine",
    ),
    indentWidth: normalizeOptionalPositiveInteger(rule.indentWidth, "formatters.code.indentWidth"),
    finalNewline: normalizeBoolean(rule.finalNewline, true, "formatters.code.finalNewline"),
    trimTrailingWhitespace: normalizeBoolean(rule.trimTrailingWhitespace, true, "formatters.code.trimTrailingWhitespace"),
    collapseBlankLines: normalizeBoolean(rule.collapseBlankLines, true, "formatters.code.collapseBlankLines"),
  };
}

function normalizeFormatters(
  formatters: CodeDisciplineFormatters | undefined,
  defaults: { maxCharactersPerLine?: number } = {},
) {
  const source = (formatters ?? {}) as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    if (key !== "code") {
      throw new InvalidCodeDisciplineConfigError(`Unknown formatter: ${key}`, {
        key,
      });
    }
  }

  return {
    code: normalizeCodeFormatter(formatters?.code, defaults),
  };
}

export { normalizeCodeFormatter, normalizeFormatters };
