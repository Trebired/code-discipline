import { expect, test } from "bun:test";

import { checkCodeDiscipline, fixCodeDiscipline } from "../../src/index.js";
import { readFile, tempProject, writeFile } from "./helpers.js";

function writeStrictTsconfig(projectRoot: string, overrides: Record<string, unknown> = {}) {
  writeFile(projectRoot, "tsconfig.json", JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "CommonJS",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      ...overrides,
    },
    include: ["src/**/*.ts"],
  }));
}

test("flags a leading @ts-nocheck that produces no diagnostics once removed", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/clean.ts", '// @ts-nocheck\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n');

  const result = await checkCodeDiscipline({ projectRoot, rules: { tsNocheckAudit: {} } });

  expect(result.violations).toEqual([
    {
      rule: "ts-nocheck-audit",
      fix: true,
      filePath: "src/clean.ts",
      message: "@ts-nocheck is unnecessary — no diagnostics are reported without it",
      details: { diagnosticCount: 0 },
    },
  ]);
});

test("leaves a file with real diagnostics untouched", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/broken.ts", '// @ts-nocheck\nexport function broken(): number {\n  return "not a number";\n}\n');

  const result = await checkCodeDiscipline({ projectRoot, rules: { tsNocheckAudit: {} } });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);
});

test("ignores files without a leading @ts-nocheck", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/normal.ts", "export function normal(): number {\n  return 1;\n}\n");

  const result = await checkCodeDiscipline({ projectRoot, rules: { tsNocheckAudit: {} } });

  expect(result.violations).toEqual([]);
});

test("removes the pragma line and nothing else on fix", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/clean.ts", '// @ts-nocheck\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n');
  writeFile(projectRoot, "src/broken.ts", '// @ts-nocheck\nexport function broken(): number {\n  return "not a number";\n}\n');

  const result = await fixCodeDiscipline({ projectRoot, rules: { tsNocheckAudit: {} } });

  expect(result.rewritten_files).toBe(1);
  expect(readFile(projectRoot, "src/clean.ts")).toBe("export function add(a: number, b: number): number {\n  return a + b;\n}\n");
  expect(readFile(projectRoot, "src/broken.ts")).toBe('// @ts-nocheck\nexport function broken(): number {\n  return "not a number";\n}\n');
});

test("is idempotent on a second fix run", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/clean.ts", '// @ts-nocheck\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n');

  const firstFix = await fixCodeDiscipline({ projectRoot, rules: { tsNocheckAudit: {} } });
  expect(firstFix.rewritten_files).toBe(1);

  const secondFix = await fixCodeDiscipline({ projectRoot, rules: { tsNocheckAudit: {} } });
  expect(secondFix.rewritten_files).toBe(0);
  expect(secondFix.violationCount).toBe(0);
});

test("catches a real bug hidden behind @ts-nocheck across files", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/consumer.ts", '// @ts-nocheck\nimport type { MissingType } from "./types";\nexport function useIt(value: MissingType): MissingType {\n  return value;\n}\n');
  writeFile(projectRoot, "src/types.ts", "export type OtherType = string;\n");

  const result = await checkCodeDiscipline({ projectRoot, rules: { tsNocheckAudit: {} } });

  expect(result.violations).toEqual([]);
});

test("supports severity: warning", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/clean.ts", '// @ts-nocheck\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n');

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { tsNocheckAudit: { severity: "warning" } },
  });

  expect(result.ok).toBe(true);
  expect(result.violationCount).toBe(1);
  expect(result.violations[0]).toMatchObject({ rule: "ts-nocheck-audit", severity: "warning" });
});

test("supports rule exclusions", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/clean.ts", '// @ts-nocheck\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n');
  writeFile(projectRoot, "src/skip.ts", '// @ts-nocheck\nexport function subtract(a: number, b: number): number {\n  return a - b;\n}\n');

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      tsNocheckAudit: {
        excludeDirs: [{ type: "file", pattern: "**/skip.ts" }],
      },
    },
  });

  expect(result.violationCount).toBe(1);
  expect(result.violations[0]?.filePath).toBe("src/clean.ts");
});

test("works through targeted check and fix ts-nocheck-audit selectors", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot);
  writeFile(projectRoot, "src/clean.ts", '// @ts-nocheck\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n');

  const checkResult = await checkCodeDiscipline({
    projectRoot,
    onlyRules: ["ts-nocheck-audit"],
    rules: { tsNocheckAudit: {} },
  });
  expect(checkResult.violations[0]?.rule).toBe("ts-nocheck-audit");

  const fixResult = await fixCodeDiscipline({
    projectRoot,
    onlyRules: ["ts-nocheck-audit"],
    rules: { tsNocheckAudit: {} },
  });
  expect(fixResult.rewritten_files).toBe(1);
});

test("honors a custom tsconfigPath", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "config/tsconfig.strict.json", JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "CommonJS",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ["../src/**/*.ts"],
  }));
  writeFile(projectRoot, "src/clean.ts", '// @ts-nocheck\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n');

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { tsNocheckAudit: { tsconfigPath: "config/tsconfig.strict.json" } },
  });

  expect(result.violations).toHaveLength(1);
});

test("rejects a missing tsconfig with a clear config error", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/clean.ts", '// @ts-nocheck\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n');

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: { tsNocheckAudit: {} },
  })).rejects.toMatchObject({
    code: "invalid_tsconfig_path",
  });
});

test("ignores unsupported JS files even with a leading @ts-nocheck", async () => {
  const projectRoot = tempProject();
  writeStrictTsconfig(projectRoot, { allowJs: true });
  writeFile(projectRoot, "src/legacy.js", "// @ts-nocheck\nexport function legacy() {\n  return 1;\n}\n");

  const result = await checkCodeDiscipline({ projectRoot, rules: { tsNocheckAudit: {} } });

  expect(result.violations).toEqual([]);
});
