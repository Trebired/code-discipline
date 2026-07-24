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

test("supports rule-local file and folder exclusions", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/client.ts", "export const client = true;\n");
  writeFile(projectRoot, "src/legacy.ts", "export const legacy = true;\n");
  writeFile(projectRoot, "src/generated/tiny.ts", "export const generated = true;\n");
  writeFile(projectRoot, "src/generated/long.ts", "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n");
  writeFile(projectRoot, "src/long.ts", "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      minFileLines: {
        min: 2,
        excludeFiles: ["**/client.ts"],
        excludeFolders: ["generated"],
      },
      maxFileLines: {
        max: 2,
        excludeFolders: ["**/generated"],
      },
    },
  });

  expect(result.violations.map((violation) => `${violation.rule}:${violation.filePath}`)).toEqual([
    "min-file-lines:src/legacy.ts",
    "max-file-lines:src/long.ts",
  ]);
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

test("ignores inline jsx svg regions while checking other max character lines", async () => {
  const projectRoot = tempProject();
  const longPath = "M " + "1 ".repeat(90);
  const longExpression = "x".repeat(151);

  writeFile(projectRoot, "src/logo.tsx", [
    "function Logo() {",
    "  return (",
    "    <span>",
    `      <svg width="188.73555mm" height="46.200558mm" viewBox="0 0 188.73555 46.200558" version="1.1" xmlns="http://www.w3.org/2000/svg">`,
    "        <path",
    "          style={{ fill: \"currentColor\", stroke: \"none\" }}",
    `          d="${longPath}"`,
    "        />",
    "      </svg>",
    "    </span>",
    "  );",
    "}",
    "",
    `export const stillChecked = "${longExpression}";`,
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/svg-string.ts", `export const markup = "<svg data-value='${longExpression}'></svg>";\n`);

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxCharactersPerLine: {},
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toHaveLength(2);
  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: "max-characters-per-line",
      filePath: "src/logo.tsx",
      details: expect.objectContaining({
        line: 14,
      }),
    }),
    expect.objectContaining({
      rule: "max-characters-per-line",
      filePath: "src/svg-string.ts",
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
