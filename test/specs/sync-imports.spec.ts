import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  AliasCollisionError,
  createRelativePathHashAlias,
  createRelativePathSlugAlias,
  syncImports,
} from "../../src/index.js";
import { captureCallbackLogger, captureTrebiredLogger, readFile, readJson, tempProject, writeFile } from "./helpers.js";

describe("code-discipline syncImports", () => {
  test("exports stable slug and hash strategies", () => {
    expect(createRelativePathSlugAlias({
      absolutePath: "/repo/src/shared/http-client.ts",
      relativeFromProjectRoot: "src/shared/http-client.ts",
      relativeFromSourceRoot: "shared/http-client",
      existingIds: [],
      prefix: "#",
    })).toBe("#shared-http-client");

    expect(createRelativePathHashAlias({
      absolutePath: "/repo/src/shared/http-client.ts",
      relativeFromProjectRoot: "src/shared/http-client.ts",
      relativeFromSourceRoot: "shared/http-client",
      existingIds: [],
      prefix: "#",
    })).toBe(`#${createHash("sha1").update("shared/http-client").digest("hex").slice(0, 12)}`);
  });

  test("rejects removed syncImports config keys", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

    await expect(syncImports({
      projectRoot,
      // @ts-expect-error legacy config
      imports: { rewrite: true },
    })).rejects.toMatchObject({ code: "invalid_config" });

    await expect(syncImports({
      projectRoot,
      // @ts-expect-error legacy config
      rewrite: true,
    })).rejects.toMatchObject({ code: "invalid_config" });

    await expect(syncImports({
      projectRoot,
      // @ts-expect-error legacy config
      keepRelative: ["./"],
    })).rejects.toMatchObject({ code: "invalid_config" });

    await expect(syncImports({
      projectRoot,
      // @ts-expect-error legacy config
      enabled: true,
    })).rejects.toMatchObject({ code: "invalid_config" });

    await expect(syncImports({
      projectRoot,
      // @ts-expect-error legacy config
      stop: true,
    })).rejects.toMatchObject({ code: "invalid_config" });
  });

  test("generates aliases and rewrites imports when fix is true", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { local } from "./local";\nimport { util } from "../shared/util";\nexport { local, util };\n');
    writeFile(projectRoot, "src/feature/local.ts", "export const local = true;\n");
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await syncImports({
      projectRoot,
      fix: true,
      alias: { strategy: "relative-path-slug" },
      allowRelative: ["./"],
    });

    expect(result).toEqual({
      ok: true,
      violationCount: 0,
      violations: [],
      mutations_allowed: true,
      aliases_changed: true,
      aliases_count: 3,
      import_violations: 0,
      rewritten_files: 1,
      rewritten_imports: 1,
    });
    expect(readJson(projectRoot, "tsconfig.json").compilerOptions.paths).toEqual({
      "#feature-app": ["./src/feature/app.ts"],
      "#feature-local": ["./src/feature/local.ts"],
      "#shared-util": ["./src/shared/util.ts"],
    });
    expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "#shared-util"');
    expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "./local"');
  });

  test("returns drift without mutating when fix is disabled", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const beforeTsconfig = readFile(projectRoot, "tsconfig.json");
    const beforeSource = readFile(projectRoot, "src/feature/app.ts");

    const result = await syncImports({
      projectRoot,
      fix: false,
      alias: { strategy: "relative-path-slug" },
      allowRelative: ["./"],
    });

    expect(result.ok).toBe(false);
    expect(result.violationCount).toBe(2);
    expect(result.import_violations).toBe(2);
    expect(readFile(projectRoot, "tsconfig.json")).toBe(beforeTsconfig);
    expect(readFile(projectRoot, "src/feature/app.ts")).toBe(beforeSource);
  });

  test("resolves .js relative specifiers to .ts source files for drift detection and rewrites", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/auth.ts", 'import { credentials } from "../shared/credentials.js";\nexport { credentials };\n');
    writeFile(projectRoot, "src/shared/credentials.ts", "export const credentials = true;\n");

    const checkResult = await syncImports({
      projectRoot,
      fix: false,
      alias: { strategy: "relative-path-slug" },
      allowRelative: ["./"],
    });

    expect(checkResult.ok).toBe(false);
    expect(checkResult.import_violations).toBe(2);
    expect(checkResult.violations).toContainEqual(expect.objectContaining({
      filePath: "src/feature/auth.ts",
      message: "relative import ../shared/credentials.js should be rewritten to #shared-credentials",
      details: expect.objectContaining({
        specifier: "../shared/credentials.js",
        aliasId: "#shared-credentials",
        resolvedFile: "src/shared/credentials.ts",
      }),
    }));

    const fixResult = await syncImports({
      projectRoot,
      fix: true,
      alias: { strategy: "relative-path-slug" },
      allowRelative: ["./"],
    });

    expect(fixResult.ok).toBe(true);
    expect(fixResult.rewritten_files).toBe(1);
    expect(fixResult.rewritten_imports).toBe(1);
    expect(readFile(projectRoot, "src/feature/auth.ts")).toContain('from "#shared-credentials"');
  });

  test("returns drift and logs a warning when fix is disabled", async () => {
    const projectRoot = tempProject();
    const { logger, rows } = captureTrebiredLogger();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await syncImports({
      projectRoot,
      fix: false,
      alias: { strategy: "relative-path-slug" },
      logging: {
        enabled: true,
        logger,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.violationCount).toBe(2);
    expect(rows.map((row) => row.method)).toContain("warn");
  });

  test("buffers unresolved rewrite diagnostics into one final report", async () => {
    const projectRoot = tempProject();
    const { adapter, rows } = captureCallbackLogger();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { one } from "../missing/one";\nimport { two } from "../missing/two";\nexport { one, two };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await syncImports({
      projectRoot,
      fix: true,
      alias: { strategy: "relative-path-slug" },
      logging: {
        enabled: true,
        adapter,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      event: "package-initialized",
      group: "code-discipline.initialize",
      level: "success",
    });
    expect(rows[1]).toMatchObject({
      event: "sync-finished",
      level: "success",
    });
    const diagnostics = rows[1].metadata?.diagnostics as {
      events: Array<{ count: number; event: string }>;
    };
    expect(diagnostics.events).toContainEqual(expect.objectContaining({
      event: "rewrite-skipped-unresolved",
      count: 2,
    }));
  });

  test("supports custom alias strategies", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    await syncImports({
      projectRoot,
      fix: true,
      alias: {
        strategy(input) {
          return `@${input.relativeFromSourceRoot.replace(/\//g, "__")}`;
        },
      },
    });

    const tsconfig = readJson(projectRoot, "tsconfig.json");
    expect(tsconfig.compilerOptions.paths).toEqual({
      "@shared__util": ["./src/shared/util.ts"],
    });
  });

  test("writes dot-prefixed tsconfig path targets so baseUrl is not required", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
      },
    }, null, 2));
    writeFile(projectRoot, "src/feature/app.ts", "export const app = true;\n");

    await syncImports({
      projectRoot,
      fix: true,
      alias: { strategy: "relative-path-slug" },
    });

    const tsconfig = readJson(projectRoot, "tsconfig.json");
    expect(tsconfig.compilerOptions.paths).toEqual({
      "#feature-app": ["./src/feature/app.ts"],
    });
    expect(tsconfig.compilerOptions.baseUrl).toBeUndefined();
  });

  test("fails clearly on alias collisions", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/one.ts", "export const one = true;\n");
    writeFile(projectRoot, "src/two.ts", "export const two = true;\n");

    await expect(syncImports({
      projectRoot,
      fix: true,
      alias: {
        strategy() {
          return "#same";
        },
      },
    })).rejects.toBeInstanceOf(AliasCollisionError);
  });
});
