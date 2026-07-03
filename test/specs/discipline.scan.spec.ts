import { expect, test } from "bun:test";

import { checkCodeDiscipline } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

test("reports removable comments without mistaking literal contents for comments", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    'const url = "https://example.com";',
    'const regex = /https?:\\/\\/example\\.com/;',
    "// remove this",
    "/* and this */",
    "export const app = { url, regex };",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      removeComments: {},
    },
  });

  expect(result).toEqual({
    ok: false,
    violationCount: 1,
    violations: [
      {
        rule: "remove-comments",
        fix: true,
        filePath: "src/app.ts",
        message: "file contains 2 removable comment(s)",
        details: {
          commentCount: 2,
          lineComments: 1,
          blockComments: 1,
        },
      },
    ],
  });
});

test("scans .gitignore directories by default", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, ".gitignore", "src/generated/\n");
  writeFile(projectRoot, "src/app.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/generated/big.ts", "one\n2\n3\n4\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result.violationCount).toBe(2);
  expect(result.violations.map((entry) => entry.filePath)).toEqual([
    "src/app.ts",
    "src/generated/big.ts",
  ]);
});

test("merges directory excludes from .gitignore when explicitly enabled", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, ".gitignore", "src/generated/\n");
  writeFile(projectRoot, "src/app.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/generated/big.ts", "one\n2\n3\n4\n");

  const enabled = await checkCodeDiscipline({
    projectRoot,
    excludeDirs: {
      gitignore: true,
    },
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(enabled).toEqual({
    ok: false,
    violationCount: 1,
    violations: [
      {
        rule: "max-file-lines",
        fix: false,
        filePath: "src/app.ts",
        message: "file has 4 lines and exceeds the limit of 2",
        details: {
          lineCount: 4,
          max: 2,
        },
      },
    ],
  });
});

test("combines default and custom source extensions unless explicitly disabled", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/lib.rs", "one\n2\n3\n");

  const additive = await checkCodeDiscipline({
    projectRoot,
    sourceExtensions: [".rs"],
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(additive.violationCount).toBe(2);
  expect(additive.violations.map((entry) => entry.filePath)).toEqual([
    "src/app.ts",
    "src/lib.rs",
  ]);

  const overrideOnlyRust = await checkCodeDiscipline({
    projectRoot,
    sourceExtensions: [".rs"],
    includeDefaultSourceExtensions: false,
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(overrideOnlyRust.violationCount).toBe(1);
  expect(overrideOnlyRust.violations[0]?.filePath).toBe("src/lib.rs");
});

test("combines default excludeDirs, explicit excludeDirs, and opt-in .gitignore excludes", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, ".gitignore", "src/generated/\n");
  writeFile(projectRoot, "dist/out.ts", "one\n2\n3\n");
  writeFile(projectRoot, "tmp/out.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/generated/out.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/app.ts", "one\n2\n3\n");

  const additive = await checkCodeDiscipline({
    projectRoot,
    excludeDirs: {
      dirs: ["tmp"],
      gitignore: true,
    },
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(additive.violationCount).toBe(1);
  expect(additive.violations[0]?.filePath).toBe("src/app.ts");

  const explicitOnly = await checkCodeDiscipline({
    projectRoot,
    excludeDirs: {
      dirs: ["tmp"],
    },
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(explicitOnly.violationCount).toBe(2);
  expect(explicitOnly.violations.map((entry) => entry.filePath)).toEqual([
    "src/app.ts",
    "src/generated/out.ts",
  ]);
});
