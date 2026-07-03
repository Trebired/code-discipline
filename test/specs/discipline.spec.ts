import { expect, test } from "bun:test";

import { checkCodeDiscipline, defineCodeDisciplineConfig } from "../../src/index.js";
import { captureTrebiredLogger, tempProject, writeFile } from "./helpers.js";

test("exports defineCodeDisciplineConfig as an identity helper", () => {
  const config = defineCodeDisciplineConfig({
    sourceRoot: "src",
    rules: {
      maxFileLines: {
        max: 500,
      },
    },
  });

  expect(config).toEqual({
    sourceRoot: "src",
    rules: {
      maxFileLines: {
        max: 500,
      },
    },
  });
});

test("returns error violations as ok=false", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result).toEqual({
    ok: false,
    violationCount: 1,
    violations: [
      {
        rule: "max-file-lines",
        fix: false,
        filePath: "src/too-long.ts",
        message: "file has 4 lines and exceeds the limit of 2",
        details: {
          lineCount: 4,
          max: 2,
        },
      },
    ],
  });
});

test("returns violations as ok=false and logs a warning transport event", async () => {
  const projectRoot = tempProject();
  const { logger, rows } = captureTrebiredLogger();

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    logging: {
      enabled: true,
      logger,
    },
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violationCount).toBe(1);
  expect(rows.map((row) => row.method)).toContain("warn");
});

test("reports oversized functions with name and line span details", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/functions.ts", [
    "export const buildPayload = () => {",
    "  const user = \"sam\";",
    "  const role = \"admin\";",
    "  const scope = \"global\";",
    "  return { user, role, scope };",
    "};",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFunctionLines: {
        max: 5,
      },
    },
  });

  expect(result).toEqual({
    ok: false,
    violationCount: 1,
    violations: [
      {
        rule: "max-function-lines",
        fix: false,
        filePath: "src/functions.ts",
        message: "arrow-function buildPayload has 6 lines and exceeds the limit of 5",
        details: {
          functionKind: "arrow-function",
          functionName: "buildPayload",
          lineCount: 6,
          max: 5,
          startLine: 1,
          endLine: 6,
        },
      },
    ],
  });
});

test("reports oversized Go functions when Go source files are present", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/service.go", [
    "package demo",
    "",
    "func buildPayload() string {",
    "  one := \"sam\"",
    "  two := \"admin\"",
    "  three := \"global\"",
    "  return one + two + three",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFunctionLines: {
        max: 5,
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violationCount).toBe(1);
  expect(result.violations).toEqual([
    expect.objectContaining({
      filePath: "src/service.go",
      details: expect.objectContaining({
        functionKind: "function",
        functionName: "buildPayload",
        lineCount: 6,
        startLine: 3,
        endLine: 8,
      }),
    }),
  ]);
});

test("reports oversized Rust functions when Rust source files are present", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/lib.rs", [
    "pub fn build_payload() -> String {",
    "    let one = \"sam\";",
    "    let two = \"admin\";",
    "    let three = \"global\";",
    "    format!(\"{one}{two}{three}\")",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFunctionLines: {
        max: 5,
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violationCount).toBe(1);
  expect(result.violations).toEqual([
    expect.objectContaining({
      filePath: "src/lib.rs",
      details: expect.objectContaining({
        functionKind: "function",
        functionName: "build_payload",
        lineCount: 6,
        startLine: 1,
        endLine: 6,
      }),
    }),
  ]);
});
