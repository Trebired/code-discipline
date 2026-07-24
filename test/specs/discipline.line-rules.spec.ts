import { expect, test } from "bun:test";

import { checkCodeDiscipline, fixCodeDiscipline } from "../../src/index.js";
import { expectedViolationResult, tempProject, writeFile } from "./helpers.js";

test("reports files with one or fewer code lines through min-file-lines", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/legacy.ts", "export { legacy } from \"./legacy/index.js\";\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      minFileLines: {},
    },
  });

  expect(result).toEqual({
    ok: false,
    result: expectedViolationResult(["min-file-lines"]),
    violationCount: 1,
    violations: [
      {
        rule: "min-file-lines",
        fix: false,
        filePath: "src/legacy.ts",
        message: "file has 1 line and is at or below the banned minimum of 1",
        details: {
          lineCount: 1,
          min: 1,
        },
      },
    ],
  });
});

test("allows files above the configured minimum code line count", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/real.ts", [
    "export function realWork() {",
    "  const one = 1;",
    "  const two = 2;",
    "  const three = 3;",
    "  const four = 4;",
    "  return one + two + three + four;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      minFileLines: {},
    },
  });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);
});

test("reports physical lines above the max characters per line default", async () => {
  const projectRoot = tempProject();
  const longExpression = "x".repeat(151);

  writeFile(projectRoot, "src/long-line.ts", `export const value = "${longExpression}";\n`);

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxCharactersPerLine: {},
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: "max-characters-per-line",
      filePath: "src/long-line.ts",
      message: "line 1 has 175 characters and exceeds the limit of 150",
      details: {
        line: 1,
        characterCount: 175,
        max: 150,
      },
    }),
  ]);
});

test("supports max characters per line selectors only when configured", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/long-line.ts", `export const value = "${"x".repeat(151)}";\n`);

  const result = await checkCodeDiscipline({
    projectRoot,
    onlyRules: ["max-characters-per-line"],
    rules: {
      maxCharactersPerLine: {},
      maxFileLines: {
        max: 1,
      },
    },
  });

  expect(result.violationCount).toBe(1);
  expect(result.violations[0]?.rule).toBe("max-characters-per-line");

  await expect(checkCodeDiscipline({
    projectRoot,
    onlyRules: ["max-characters-per-line"],
  })).rejects.toThrow("Selected rule is not configured: max-characters-per-line");
});

test("rejects check-only line rules as fix selectors", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(fixCodeDiscipline({
    projectRoot,
    rules: {
      maxCharactersPerLine: {},
    },
    // @ts-expect-error max characters per line is check-only
    onlyRules: ["max-characters-per-line"],
  })).rejects.toThrow("Selected rule is not fixable: max-characters-per-line");
});
