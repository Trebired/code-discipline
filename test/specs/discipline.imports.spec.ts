import { expect, test } from "bun:test";

import { checkCodeDiscipline } from "#co5e63fhc1wb";
import { readFile, readJson, tempProject, writeFile } from "./helpers.js";

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
        alias: {
          strategy: "relative-path-slug",
        },
        allowRelative: ["./"],
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violationCount).toBe(2);
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

test("sync-imports respects rule-local file and folder exclusions", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
  writeFile(projectRoot, "src/client.ts", 'import { util } from "./shared/util";\nexport { util };\n');
  writeFile(projectRoot, "src/generated/report.ts", 'import { util } from "../shared/util";\nexport { util };\n');
  writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      syncImports: {
        alias: {
          strategy: "relative-path-slug",
        },
        allowRelative: ["./"],
        excludeDirs: [
          { type: "file", pattern: "src/client.ts" },
          { type: "folder", pattern: "generated" },
        ],
      },
    },
  });

  expect(result.violations.some((violation) => violation.filePath === "src/client.ts")).toBe(false);
  expect(result.violations.some((violation) => violation.filePath === "src/generated/report.ts")).toBe(false);
  expect(result.violations).toContainEqual(expect.objectContaining({
    filePath: "src/feature/app.ts",
    message: "relative import ../shared/util should be rewritten to #src-shared-util",
  }));
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
        alias: {
          strategy: "relative-path-slug",
        },
        allowRelative: ["./"],
      },
    },
  });

  expect(result.violations).toContainEqual(expect.objectContaining({
    filePath: "src/feature/auth.ts",
    message: "relative import ../shared/credentials.js should be rewritten to #src-shared-credentials",
    details: expect.objectContaining({
      specifier: "../shared/credentials.js",
      resolvedFile: "src/shared/credentials.ts",
    }),
  }));
});

test("check mode leaves tsconfig untouched for sync drift", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }, null, 2));
  writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
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

  expect(result.ok).toBe(false);
  expect(readJson(projectRoot, "tsconfig.json")).toEqual({
    compilerOptions: {
      strict: true,
    },
  });
});
