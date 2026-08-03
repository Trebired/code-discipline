import type { FormattingRuleOptions, NormalizedFormattingRule } from "#uqbg4indzud7";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { normalizeRuleExclusions } from "./exclusions.js";
import { normalizeSeverity } from "./rule-options.js";

const DEFAULT_CODE_FORMATTER_TARGETS = ["."];
const DEFAULT_CODE_FORMATTER_LINE_LIMIT = 100;

function normalizeFormatter(
  formatting: FormattingRuleOptions | undefined,
  legacyFormatter: boolean | undefined,
  defaults: { maxCharactersPerLine?: number } = {},
): NormalizedFormattingRule | undefined {
  if (legacyFormatter !== undefined && typeof legacyFormatter !== "boolean") {
    throw new InvalidCodeDisciplineConfigError("formatter must be true or false when provided; use rules.formatting for new config", {
      key: "formatter",
      value: legacyFormatter,
    });
  }

  if (formatting === undefined && !legacyFormatter) return undefined;

  if (formatting !== undefined && (!formatting || typeof formatting !== "object" || Array.isArray(formatting))) {
    throw new InvalidCodeDisciplineConfigError("formatting must be an object when configured under rules", {
      rule: "formatting",
      value: formatting,
    });
  }

  const source = (formatting ?? {}) as Record<string, unknown>;
  const unsupportedKeys = Object.keys(source).filter((key) => !["severity", "excludeDirs", "excludeFiles", "excludeFolders"].includes(key));
  if (unsupportedKeys.length > 0) {
    throw new InvalidCodeDisciplineConfigError("formatting does not accept formatter options", {
      rule: "formatting",
      keys: unsupportedKeys,
    });
  }

  return {
    ...normalizeRuleExclusions("formatting", source),
    targets: DEFAULT_CODE_FORMATTER_TARGETS,
    ignore: true,
    maxCharactersPerLine: defaults.maxCharactersPerLine ?? DEFAULT_CODE_FORMATTER_LINE_LIMIT,
    finalNewline: true,
    trimTrailingWhitespace: true,
    collapseBlankLines: true,
    severity: normalizeSeverity(formatting?.severity, "formatting"),
  };
}

export { normalizeFormatter };
