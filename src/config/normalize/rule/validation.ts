import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";

function assertRemovedKeys(ruleName: string, source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in source) {
      throw new InvalidCodeDisciplineConfigError(`${ruleName}.${key} is no longer supported`, {
          rule: ruleName,
          key,
      });
    }
  }
}

function normalizeSeverity(
  value: unknown,
  ruleName: string,
): "warning" | "fail" {
  if (value === undefined) return "fail";
  if (value === "warning" || value === "fail") return value;
  throw new InvalidCodeDisciplineConfigError(`${ruleName}.severity must be "warning" or "fail" when provided`, {
      rule: ruleName,
      value,
  });
}

function normalizeMinDuplicateCharacters(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidCodeDisciplineConfigError("dry.minDuplicateCharacters must be a finite number when provided", {
        rule: "dry",
        value,
    });
  }
  return Math.max(0, Math.floor(value as number));
}

function normalizeThreshold(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) {
    throw new InvalidCodeDisciplineConfigError(`${label} must be a finite number`, {
        value,
    });
  }
  return Math.max(1, Math.floor(value as number));
}

export {
  assertRemovedKeys,
  normalizeMinDuplicateCharacters,
  normalizeSeverity,
  normalizeThreshold,
};
