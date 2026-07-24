import { expect, test } from "bun:test";

import { checkCodeDiscipline, resetNativeBindingForTests, scanSourceFiles } from "../../src/index.js";
import { expectedViolationResult, tempProject, writeFile } from "./helpers.js";

function forceTypeScriptRulePath(event: unknown): void {
  void event;
}

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
    progressObserver: forceTypeScriptRulePath,
    rules: {
      removeComments: {},
    },
  });

  expect(result).toEqual({
    ok: false,
    result: expectedViolationResult(["remove-comments"]),
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

test("ignores excluded comments in remove-comments checks", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    "// @ts-nocheck",
    "export const app = true;",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      removeComments: {
        exclude: ["@ts-nocheck"],
      },
    },
  });

  expect(result.ok).toBe(true);
  expect(result.violationCount).toBe(0);
  expect(result.violations).toEqual([]);
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
    ignore: {
      entries: [],
      use_gitignore: true,
    },
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(enabled).toEqual({
    ok: false,
    result: expectedViolationResult(["max-file-lines"]),
    violationCount: 1,
    violations: [
      {
        rule: "max-file-lines",
        fix: false,
        filePath: "src/app.ts",
        message: "file has 3 lines and exceeds the limit of 2",
        details: {
          lineCount: 3,
          max: 2,
        },
      },
    ],
  });
});

test("filters default source extensions through excludeSourceExtensions", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/lib.rs", "one\n2\n3\n");

  const includeAll = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(includeAll.violationCount).toBe(2);
  expect(includeAll.violations.map((entry) => entry.filePath)).toEqual([
    "src/app.ts",
    "src/lib.rs",
  ]);

  const excludeTypeScript = await checkCodeDiscipline({
    projectRoot,
    excludeSourceExtensions: [".ts"],
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(excludeTypeScript.violationCount).toBe(1);
  expect(excludeTypeScript.violations[0]?.filePath).toBe("src/lib.rs");
});

test("treats comment and blank line overflow as warnings for max line rules", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    "export function app() {",
    "  // comment",
    "",
    "  return true;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        max: 3,
      },
      maxFunctionLines: {
        max: 3,
      },
    },
  });

  expect(result.ok).toBe(true);
  expect(result.violationCount).toBe(2);
  expect(result.violations.every((violation) => violation.severity === "warning")).toBe(true);
});

test("supports scss files in the max-file-lines rule", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/styles.scss", [
    ".button {",
    "  /* comment */",
    "",
    "  color: red;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations[0]).toMatchObject({
    rule: "max-file-lines",
    filePath: "src/styles.scss",
    details: {
      lineCount: 3,
      max: 2,
    },
  });
});

test("supports css files in source scanning and removable comments", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/styles.css", [
    ".button {",
    "  /* remove */",
    "  color: red;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    progressObserver: forceTypeScriptRulePath,
    rules: {
      removeComments: {},
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toContainEqual(expect.objectContaining({
    rule: "max-file-lines",
    filePath: "src/styles.css",
  }));
  expect(result.violations).toContainEqual(expect.objectContaining({
    rule: "remove-comments",
    filePath: "src/styles.css",
    details: expect.objectContaining({
      blockComments: 1,
    }),
  }));
});

test("combines default ignores, explicit ignore entries, and opt-in .gitignore excludes", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, ".gitignore", "src/generated/\n");
  writeFile(projectRoot, "dist/out.ts", "one\n2\n3\n");
  writeFile(projectRoot, "tmp/out.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/generated/out.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/app.ts", "one\n2\n3\n");

  const additive = await checkCodeDiscipline({
    projectRoot,
    ignore: {
      entries: [{ type: "folder", pattern: "tmp" }],
      use_gitignore: true,
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
    ignore: {
      entries: [{ type: "folder", pattern: "tmp" }],
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

test("supports top-level ignore folder names, file globs, and folder globs", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/app.client.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/generated/out.ts", "one\n2\n3\n");
  writeFile(projectRoot, "src/features/cache-files/out.ts", "one\n2\n3\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    ignore: {
      entries: [
        { type: "file", pattern: "**/*.client.ts" },
        { type: "folder", pattern: "generated" },
        { type: "folder", pattern: "**/*-files" },
      ],
    },
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  });

  expect(result.violations.map((entry) => entry.filePath)).toEqual([
    "src/app.ts",
  ]);
});

test("emits chunked fallback scan progress for larger directory trees", async () => {
  const projectRoot = tempProject();
  const previousDisableNative = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
  const previousConcurrency = process.env.TB_CODE_DISCIPLINE_SCAN_CONCURRENCY;

  try {
    process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
    process.env.TB_CODE_DISCIPLINE_SCAN_CONCURRENCY = "1";
    resetNativeBindingForTests();

    for (let index = 0; index < 4; index += 1) {
      writeFile(projectRoot, `src/group-${index}/feature/app.ts`, `export const value${index} = ${index};\n`);
    }

    const events: Array<{ phase: string; backend: string }> = [];
    const rows = await scanSourceFiles({
      projectRoot,
      sourceRoot: `${projectRoot}/src`,
      sourceExtensions: [".ts"],
      excludeDirs: [
        { type: "folder", pattern: "node_modules" },
        { type: "folder", pattern: "dist" },
        { type: "folder", pattern: ".git" },
      ],
      excludeGitignoreDirs: false,
      gitignorePath: `${projectRoot}/.gitignore`,
      scanObserver: (event) => events.push({ phase: event.phase, backend: event.backend }),
    });

    expect(rows).toHaveLength(4);
    expect(events.some((event) => event.phase === "chunk" && event.backend === "ts")).toBe(true);
    expect(events[events.length - 1]).toEqual({
      phase: "completed",
      backend: "ts",
    });
  } finally {
    resetNativeBindingForTests();

    if (previousDisableNative === undefined) {
      delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
    } else {
      process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisableNative;
    }

    if (previousConcurrency === undefined) {
      delete process.env.TB_CODE_DISCIPLINE_SCAN_CONCURRENCY;
    } else {
      process.env.TB_CODE_DISCIPLINE_SCAN_CONCURRENCY = previousConcurrency;
    }
  }
});
