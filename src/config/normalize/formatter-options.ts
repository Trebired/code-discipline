import type { NormalizedCodeFormatter } from "#uqbg4indzud7";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";

const DEFAULT_CODE_FORMATTER_TARGETS = ["."];
const DEFAULT_CODE_FORMATTER_LINE_LIMIT = 100;

function normalizeFormatter(
  formatter: boolean | undefined,
  defaults: { maxCharactersPerLine?: number } = {},
): NormalizedCodeFormatter | undefined {
  if (formatter === undefined || formatter === false) return undefined;

  if (formatter !== true) {
    throw new InvalidCodeDisciplineConfigError("formatter must be true or false", {
      key: "formatter",
      value: formatter,
    });
  }

  return {
    targets: DEFAULT_CODE_FORMATTER_TARGETS,
    ignore: true,
    maxCharactersPerLine: defaults.maxCharactersPerLine ?? DEFAULT_CODE_FORMATTER_LINE_LIMIT,
    finalNewline: true,
    trimTrailingWhitespace: true,
    collapseBlankLines: true,
  };
}

export { normalizeFormatter };
