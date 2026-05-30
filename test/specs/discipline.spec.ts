import { describe, expect, test } from "bun:test";

import { checkCodeDiscipline, defineCodeDisciplineConfig } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

describe("code-discipline checks", () => {
  test("exports defineCodeDisciplineConfig as an identity helper", () => {
    const config = defineCodeDisciplineConfig({
      sourceRoot: "src",
      rules: {
        maxFileLines: {
          enabled: true,
          max: 500,
        },
      },
    });

    expect(config).toEqual({
      sourceRoot: "src",
      rules: {
        maxFileLines: {
          enabled: true,
          max: 500,
        },
      },
    });
  });

  test("reports max-file-lines violations when files exceed the configured limit", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/ok.ts", "export const ok = true;\n");
    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "src/generated/ignored.ts", "one\n2\n3\n4\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      excludeDirs: ["generated"],
      rules: {
        maxFileLines: {
          enabled: true,
          max: 3,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(0);
    expect(result.violations).toEqual([
      {
        rule: "max-file-lines",
        severity: "error",
        filePath: "src/too-long.ts",
        message: "file has 4 lines and exceeds the limit of 3",
        details: {
          lineCount: 4,
          max: 3,
        },
      },
    ]);
  });

  test("supports warning severity for discipline checks", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/app.ts", "one\n2\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        maxFileLines: {
          enabled: true,
          max: 1,
          severity: "warn",
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(1);
    expect(result.violations[0]?.severity).toBe("warn");
  });

  test("detects folderizable compound filenames with default separators", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/feature/user_start.ts", "export const start = true;\n");
    writeFile(projectRoot, "src/feature/user-start.ts", "export const alt = true;\n");
    writeFile(projectRoot, "src/feature/keep.ts", "export const keep = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          enabled: true,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      {
        rule: "folderize-compound-files",
        severity: "error",
        filePath: "src/feature/user_start.ts",
        message: "file can be grouped under src/feature/user/start.ts",
        suggestedPath: "src/feature/user/start.ts",
        details: {
          separator: "_",
          suffix: "start",
          stem: "user",
        },
      },
      {
        rule: "folderize-compound-files",
        severity: "error",
        filePath: "src/feature/user-start.ts",
        message: "file can be grouped under src/feature/user/start.ts",
        suggestedPath: "src/feature/user/start.ts",
        details: {
          separator: "-",
          suffix: "start",
          stem: "user",
        },
      },
    ]);
  });

  test("supports custom folderize separators and suffixes", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/feature/user.service.ts", "export const service = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          enabled: true,
          separators: ["."],
          suffixes: ["service"],
          severity: "warn",
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([
      {
        rule: "folderize-compound-files",
        severity: "warn",
        filePath: "src/feature/user.service.ts",
        message: "file can be grouped under src/feature/user/service.ts",
        suggestedPath: "src/feature/user/service.ts",
        details: {
          separator: ".",
          suffix: "service",
          stem: "user",
        },
      },
    ]);
  });
});
