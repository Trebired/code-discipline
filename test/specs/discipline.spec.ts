import { describe, expect, test } from "bun:test";

import { checkCodeDiscipline, defineCodeDisciplineConfig } from "../../src/index.js";
import { captureTrebiredLogger, readFile, readJson, tempProject, writeFile } from "./helpers.js";

describe("code-discipline checks", () => {
  test("exports defineCodeDisciplineConfig as an identity helper", () => {
    const config = defineCodeDisciplineConfig({
      sourceRoot: "src",
      rules: {
        maxFileLines: {
          severity: "warning",
          max: 500,
        },
      },
    });

    expect(config).toEqual({
      sourceRoot: "src",
      rules: {
        maxFileLines: {
          severity: "warning",
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
      errors: 1,
      warnings: 0,
      violations: [
        {
          rule: "max-file-lines",
          severity: "error",
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

  test("returns warning violations as ok=true and logs a warning transport event", async () => {
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
          severity: "warning",
          max: 2,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(1);
    expect(result.violations[0]?.severity).toBe("warning");
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
      errors: 1,
      warnings: 0,
      violations: [
        {
          rule: "max-function-lines",
          severity: "error",
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

  test("detects same-directory compound groups with configured severity", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
    writeFile(projectRoot, "src/api/user-schema.ts", "export const schema = true;\n");
    writeFile(projectRoot, "src/api/keep.ts", "export const keep = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          severity: "error",
          separators: ["_", "-"],
        },
      },
    });

    expect(result.violations).toEqual([
      {
        rule: "folderize-compound-files",
        severity: "error",
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
        severity: "error",
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

  test("treats rule presence as enablement", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/api/user_database.ts", "export const database = true;\n");
    writeFile(projectRoot, "src/api/user_presenter.ts", "export const presenter = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          severity: "warning",
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(2);
    expect(result.violations.map((violation) => violation.suggestedPath)).toEqual([
      "src/api/user/database.ts",
      "src/api/user/presenter.ts",
    ]);
  });

  test("check mode validates sync import policy without mutating files", async () => {
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
          severity: "error",
          fix: true,
          alias: {
            strategy: "relative-path-slug",
          },
          allowRelative: ["./"],
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toBe(2);
    expect(result.warnings).toBe(0);
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

  test("check mode resolves .js specifiers to .ts source files for sync-import violations", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/auth.ts", 'import { credentials } from "../shared/credentials.js";\nexport { credentials };\n');
    writeFile(projectRoot, "src/shared/credentials.ts", "export const credentials = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        syncImports: {
          severity: "error",
          alias: {
            strategy: "relative-path-slug",
          },
          allowRelative: ["./"],
        },
      },
    });

    expect(result.violations).toContainEqual(expect.objectContaining({
      filePath: "src/feature/auth.ts",
      message: "relative import ../shared/credentials.js should be rewritten to #shared-credentials",
      details: expect.objectContaining({
        specifier: "../shared/credentials.js",
        resolvedFile: "src/shared/credentials.ts",
      }),
    }));
  });

  test("rejects removed config keys for rules", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

    await expect(checkCodeDiscipline({
      projectRoot,
      rules: {
        maxFileLines: {
          // @ts-expect-error legacy config
          enabled: true,
          max: 5,
        },
      },
    })).rejects.toMatchObject({
      code: "invalid_config",
    });

    await expect(checkCodeDiscipline({
      projectRoot,
      rules: {
        maxFunctionLines: {
          // @ts-expect-error legacy config
          enabled: true,
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
          // @ts-expect-error legacy config
          stop: true,
        },
      },
    })).rejects.toMatchObject({
      code: "invalid_config",
    });

    await expect(checkCodeDiscipline({
      projectRoot,
      rules: {
        syncImports: {
          // @ts-expect-error legacy config
          enabled: true,
          alias: {
            strategy: "relative-path-slug",
          },
        },
      },
    })).rejects.toMatchObject({
      code: "invalid_config",
    });
  });

  test("reports DRY duplicates despite renamed parameters and comments", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/shared/to-text.ts", [
      "export function toText(value: unknown) {",
      "  return String(value == null ? \"\" : value).trim();",
      "}",
      "",
    ].join("\n"));
    writeFile(projectRoot, "src/app.ts", [
      "export function clean(input: unknown) {",
      "  // normalize the text",
      "  return String(input == null ? \"\" : input).trim();",
      "}",
      "",
    ].join("\n"));

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        dry: {
          fix: true,
          helpers: [
            {
              from: "./src/shared/to-text.ts",
              exportName: "toText",
            },
          ],
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      rule: "dry",
      filePath: "src/app.ts",
      details: {
        fixable: true,
        helper: "./src/shared/to-text.ts#toText",
      },
    });
  });

  test("fails clearly when a DRY helper export cannot be resolved", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/shared/to-text.ts", "export const value = 1;\n");
    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

    await expect(checkCodeDiscipline({
      projectRoot,
      rules: {
        dry: {
          helpers: [
            {
              from: "./src/shared/to-text.ts",
              exportName: "toText",
            },
          ],
        },
      },
    })).rejects.toThrow("dry helper export is not a supported function");
  });

  test("check mode leaves tsconfig untouched for warning-only sync drift", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }, null, 2));
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await checkCodeDiscipline({
      projectRoot,
      rules: {
        syncImports: {
          severity: "warning",
          fix: false,
          alias: {
            strategy: "relative-path-slug",
          },
          allowRelative: ["./"],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(readJson(projectRoot, "tsconfig.json")).toEqual({
      compilerOptions: {
        strict: true,
      },
    });
  });
});
