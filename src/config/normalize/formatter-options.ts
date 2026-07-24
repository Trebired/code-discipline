import type {
  CodeDisciplineFormatters,
  NormalizedPrettierFormatter,
  PrettierFormatterOptions,
} from "../../checks/types.js";
import { InvalidCodeDisciplineConfigError } from "../../shared/errors.js";
import { normalizeRelativePath, uniqueStrings } from "../../shared/utils.js";

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
    ignore: normalizeStringList(rule.ignore, [], "formatters.prettier.ignore", true),
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
