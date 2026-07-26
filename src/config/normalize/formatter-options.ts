import type {
  CodeDisciplineFormatters,
  NormalizedPrettierFormatter,
  PrettierFormatterOptions,
} from "#uqbg4indzud7";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";

const DEFAULT_PRETTIER_TARGETS = ["."];

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

function normalizePrettierIgnore(value: PrettierFormatterOptions["ignore"]): boolean {
  if (value === undefined) return true;
  if (typeof value === "boolean") return value;

  throw new InvalidCodeDisciplineConfigError("formatters.prettier.ignore must be boolean when provided", {
    key: "formatters.prettier.ignore",
    value,
  });
}

function normalizePrettierFormatter(rule: PrettierFormatterOptions | undefined): NormalizedPrettierFormatter | undefined {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;

  if ("enabled" in source) {
    throw new InvalidCodeDisciplineConfigError("formatters.prettier.enabled is not supported; configure formatters.prettier to enable it", {
      key: "formatters.prettier.enabled",
    });
  }

  if (rule.options !== undefined && (!rule.options || typeof rule.options !== "object" || Array.isArray(rule.options))) {
    throw new InvalidCodeDisciplineConfigError("formatters.prettier.options must be a Prettier options object", {
      key: "formatters.prettier.options",
    });
  }

  return {
    targets: normalizeStringList(rule.targets, DEFAULT_PRETTIER_TARGETS, "formatters.prettier.targets"),
    ignore: normalizePrettierIgnore(rule.ignore),
    options: rule.options ?? {},
  };
}

function normalizeFormatters(formatters: CodeDisciplineFormatters | undefined) {
  const source = (formatters ?? {}) as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    if (key !== "prettier") {
      throw new InvalidCodeDisciplineConfigError(`Unknown formatter: ${key}`, {
        key,
      });
    }
  }

  return {
    prettier: normalizePrettierFormatter(formatters?.prettier),
  };
}

export { normalizeFormatters, normalizePrettierFormatter };
