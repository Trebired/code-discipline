import { expect, test } from "bun:test";

import { codeDiscipline, createCodeDiscipline } from "../../src/index.js";
import { captureTrebiredLogger, readFile, readJson, tempProject, writeFile } from "./helpers.js";

test("dispatches check through one package-owned entrypoint", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

  const result = await codeDiscipline({
    mode: "check",
    projectRoot,
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violationCount).toBe(1);
  expect(result.violations[0]?.rule).toBe("max-file-lines");
});

test("fix runs sync-imports and accepts logger shorthand", async () => {
  const projectRoot = tempProject();
  const { logger, rows } = captureTrebiredLogger();

  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
  writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

  const discipline = createCodeDiscipline({
    sourceRoot: "src",
    rules: {
      syncImports: {
        alias: {
          strategy: "relative-path-slug",
        },
        allowRelative: ["./"],
      },
    },
  });

  const result = await discipline.fix({
    projectRoot,
    logger,
    onlyRules: ["sync-imports"],
  });

  expect(result.ok).toBe(true);
  expect(result.ruleResults["sync-imports"]?.ok).toBe(true);
  expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "#shared-util"');
  expect(rows).toContainEqual(expect.objectContaining({
    group: "trebired.code-discipline.rules.sync-imports",
    method: "success",
  }));
});

test("runs lifecycle hooks around a direct package-owned command", async () => {
  const projectRoot = tempProject();
  const seen: string[] = [];

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

  const result = await codeDiscipline({
    mode: "check",
    projectRoot,
    lifecycle: {
      async beforeRun(context) {
        seen.push(`beforeRun:${context.mode}`);
      },
      async beforeMode(context) {
        seen.push(`beforeMode:${context.mode}`);
      },
      async afterMode(context, summary) {
        seen.push(`afterMode:${context.mode}:${(summary as { violationCount: number }).violationCount}`);
      },
      async afterRun(context, summary) {
        seen.push(`afterRun:${context.mode}:${(summary as { violationCount: number }).violationCount}`);
      },
    },
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(seen).toEqual([
    "beforeRun:check",
    "beforeMode:check",
    "afterMode:check:1",
    "afterRun:check:1",
  ]);
});

test("temporarily normalizes tsconfig compilerOptions.paths for a run and restores afterwards", async () => {
  const projectRoot = tempProject();
  let capturedPaths: Record<string, string[]> | undefined;

  writeFile(projectRoot, "tsconfig.json", JSON.stringify({
    compilerOptions: {
      paths: {
        "#shared/*": ["src/shared/*"],
      },
    },
  }, null, 2));
  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await codeDiscipline({
    mode: "check",
    projectRoot,
    tsconfigPaths: {
      normalize: "relative-dot-prefix",
      restoreAfterRun: true,
    },
    lifecycle: {
      beforeMode() {
        capturedPaths = readJson(projectRoot, "tsconfig.json").compilerOptions.paths;
      },
    },
    rules: {
      maxFileLines: {
        max: 50,
      },
    },
  });

  expect(capturedPaths).toEqual({
    "#shared/*": ["./src/shared/*"],
  });
  expect(readJson(projectRoot, "tsconfig.json").compilerOptions.paths).toEqual({
    "#shared/*": ["src/shared/*"],
  });
});

test("fix syncs package.json imports from tsconfig paths and preserves unrelated imports", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "package.json", JSON.stringify({
    name: "example-package",
    imports: {
      "#external": "./vendor/external.js",
    },
  }, null, 2));
  writeFile(projectRoot, "tsconfig.json", JSON.stringify({
    compilerOptions: {
      paths: {
        "#app": ["src/app.ts"],
        "#pages/*": ["src/pages/*"],
        "@other": ["src/other.ts"],
      },
    },
  }, null, 2));
  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
  writeFile(projectRoot, "src/pages/home.ts", "export const home = true;\n");
  writeFile(projectRoot, "src/other.ts", "export const other = true;\n");

  const result = await codeDiscipline({
    mode: "fix",
    projectRoot,
    rules: {
      syncImports: {
        alias: {
          prefix: "#",
          strategy: "relative-path-slug",
        },
        packageJsonImports: {
          enabled: true,
          aliasPrefix: "#",
        },
      },
    },
  });

  expect(result.ok).toBe(true);
  expect(readJson(projectRoot, "package.json").imports).toEqual({
    "#app": "./src/app.ts",
    "#external": "./vendor/external.js",
    "#pages/*": "./src/pages/*",
    "#pages-home": "./src/pages/home.ts",
  });
});
