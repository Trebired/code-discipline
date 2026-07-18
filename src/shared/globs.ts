import { normalizeRelativePath } from "./utils.js";

const REGEXP_SPECIALS = /[\\^$+?.()|[\]{}]/g;

function escapeRegExp(value: string): string {
  return value.replace(REGEXP_SPECIALS, "\\$&");
}

function globToRegExp(glob: string): RegExp {
  const normalized = normalizeRelativePath(glob);
  let pattern = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    const afterNext = normalized[index + 2];

    if (char === "*" && next === "*" && afterNext === "/") {
      pattern += "(?:.*/)?";
      index += 2;
      continue;
    }

    if (char === "*" && next === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }

    if (char === "?") {
      pattern += "[^/]";
      continue;
    }

    pattern += escapeRegExp(char);
  }

  return new RegExp(`${pattern}$`);
}

function matchesGlob(filePath: string, glob: string): boolean {
  return globToRegExp(glob).test(normalizeRelativePath(filePath));
}

export { globToRegExp, matchesGlob };
