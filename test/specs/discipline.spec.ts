import { describe, expect, test } from "bun:test";

import { checkCodeDiscipline, defineCodeDisciplineConfig } from "../../src/index.js";
import { captureTrebiredLogger, readFile, readJson, tempProject, writeFile } from "./helpers.js";

describe("code-discipline checks", () => {
  test("exports defineCodeDisciplineConfig as an identity helper", () => {
    const config = defineCodeDisciplineConfig({
      sourceRoot: "src",
      rules: {
        maxFileLines: {
          enabled: true,
          stop: true,
          max: 500,
        },
      },
    });

    expect(config).toEqual({
      sourceRoot: "src",
      rules: {
        maxFileLines: {
          enabled: true,
          stop: true,
          max: 500,
        },
      },
    });
  });

  test("reports max-file-lines violations as failures when stop is true", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        maxFileLines: {
          enabled: true,
          stop: true,
          max: 2,
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      warnings: 0,
      failures: 1,
      violations: [
        {
          rule: "max-file-lines",
          stop: true,
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

  test("logs warnings and keeps the check passing when stop is false", async () => {
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
          enabled: true,
          stop: false,
          max: 2,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toBe(1);
    expect(result.failures).toBe(0);
    expect(rows.map((row) => row.method)).toContain("warn");
  });

  test("detects same-directory compound groups with underscore and dash separators", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
    writeFile(projectRoot, "src/api/user-schema.ts", "export const schema = true;\n");
    writeFile(projectRoot, "src/api/keep.ts", "export const keep = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          enabled: true,
          stop: true,
          separators: ["_", "-"],
        },
      },
    });

    expect(result.violations).toEqual([
      {
        rule: "folderize-compound-files",
        stop: true,
        fix: false,
        filePath: "src/api/user_route.ts",
        message: "file can be grouped under src/api/user/route.ts",
        suggestedPath: "src/api/user/route.ts",
        details: {
          mode: "same-directory-group",
          prefix: "user",
          remainder: "route",
          separator: "_",
        },
      },
      {
        rule: "folderize-compound-files",
        stop: true,
        fix: false,
        filePath: "src/api/user-schema.ts",
        message: "file can be grouped under src/api/user/schema.ts",
        suggestedPath: "src/api/user/schema.ts",
        details: {
          mode: "same-directory-group",
          prefix: "user",
          remainder: "schema",
          separator: "-",
        },
      },
    ]);
  });

  test("detects repeated folder-prefix files even when only one file matches", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/api/user/user_route.ts", "export const route = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          enabled: true,
          stop: true,
        },
      },
    });

    expect(result.violations).toEqual([
      {
        rule: "folderize-compound-files",
        stop: true,
        fix: false,
        filePath: "src/api/user/user_route.ts",
        message: "file can be grouped under src/api/user/route.ts",
        suggestedPath: "src/api/user/route.ts",
        details: {
          mode: "repeated-folder-prefix",
          prefix: "user",
          remainder: "route",
          separator: "_",
        },
      },
    ]);
  });

  test("supports arbitrary suffix names without configured suffix lists", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/api/user_database.ts", "export const database = true;\n");
    writeFile(projectRoot, "src/api/user_presenter.ts", "export const presenter = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          enabled: true,
          stop: false,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.violations.map((violation) => violation.suggestedPath)).toEqual([
      "src/api/user/database.ts",
      "src/api/user/presenter.ts",
    ]);
  });

  test("check mode validates import policy without rewriting imports or tsconfig", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const beforeTsconfig = readFile(projectRoot, "tsconfig.json");
    const beforeSource = readFile(projectRoot, "src/feature/app.ts");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        syncImports: {
          enabled: true,
          stop: true,
          fix: true,
          alias: {
            strategy: "relative-path-slug",
          },
          allowRelative: ["./"],
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.violations.map((violation) => violation.rule)).toEqual([
      "sync-imports",
      "sync-imports",
    ]);
    expect(readFile(projectRoot, "tsconfig.json")).toBe(beforeTsconfig);
    expect(readFile(projectRoot, "src/feature/app.ts")).toBe(beforeSource);
  });

  test("allows same-folder relative imports but reports upward imports when alias syncing is configured", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(
      projectRoot,
      "src/feature/app.ts",
      'import { local } from "./local";\nimport { util } from "../shared/util";\nexport { local, util };\n',
    );
    writeFile(projectRoot, "src/feature/local.ts", "export const local = true;\n");
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        syncImports: {
          enabled: true,
          stop: true,
          alias: {
            strategy: "relative-path-slug",
          },
          allowRelative: ["./"],
        },
      },
    });

    expect(result.violations.some((violation) => JSON.stringify(violation.details).includes("./local"))).toBe(false);
    expect(result.violations.some((violation) => JSON.stringify(violation.details).includes("../shared/util"))).toBe(true);
  });

  test("rejects removed config keys for check rules", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

    await expect(checkCodeDiscipline({
      projectRoot,
      rules: {
        maxFileLines: {
          enabled: true,
          // @ts-expect-error legacy config
          severity: "error",
          max: 5,
        },
      },
    })).rejects.toMatchObject({
      code: "invalid_config",
    });

    await expect(checkCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          enabled: true,
          // @ts-expect-error legacy config
          suffixes: ["route"],
        },
      },
    })).rejects.toMatchObject({
      code: "invalid_config",
    });
  });

  test("check mode can load sync config from JSON-style shape and leaves tsconfig untouched", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }, null, 2));
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    await checkCodeDiscipline({
      projectRoot,
      rules: {
        syncImports: {
          enabled: true,
          stop: false,
          fix: false,
          alias: {
            strategy: "relative-path-slug",
          },
          allowRelative: ["./"],
        },
      },
    });

    expect(readJson(projectRoot, "tsconfig.json")).toEqual({
      compilerOptions: {
        strict: true,
      },
    });
  });
});
