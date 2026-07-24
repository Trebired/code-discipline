import { expect, test } from "bun:test";

import { runCli } from "../../src/cli.js";
import { resetNativeBindingForTests } from "../../src/index.js";
import { fileExists, readFile, tempProject, writeFile } from "./helpers.js";

function writeMaxFileLinesConfig(projectRoot: string) {
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    maxFileLines: {",
    "      max: 2,",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));
}

function restoreScanEnv(previousDisableNative: string | undefined, previousConcurrency: string | undefined) {
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

function expectChunkedScanLogs(stdout: string[], stderr: string[]) {
  expect(stdout.join("")).toContain("Found 4 discipline violation(s).");
  expect(stderr.join("")).toContain("Scan 1:");
  expect(stderr.join("")).toContain("Scan: 4 files in");
  expect(stderr.join("")).toContain("Total check:");
}

test("auto-discovers a config module for plain cli usage", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];
  const stderr: string[] = [];

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
  writeFile(projectRoot, "code-discipline.ts", [
    "export default {",
    "  rules: {",
    "    maxFileLines: {",
    "      max: 2,",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["check"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });

  expect(result.exitCode).toBe(1);
  expect(stderr.join("")).toContain("Total check:");
  expect(stdout.join("")).toContain("Found 1 discipline violation(s).");
});

test("runs check through an explicit config module and exits non-zero when violations exist", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];
  const stderr: string[] = [];

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    maxFileLines: {",
    "      max: 2,",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["check", "--config", "./discipline.config.mjs"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });

  expect(result.exitCode).toBe(1);
  expect(stderr.join("")).toContain("Total check:");
  expect(stdout.join("")).toContain("Found 1 discipline violation(s).");
});

test("logs chunked scan progress and completion timing to stderr", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const previousDisableNative = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
  const previousConcurrency = process.env.TB_CODE_DISCIPLINE_SCAN_CONCURRENCY;

  try {
    process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
    process.env.TB_CODE_DISCIPLINE_SCAN_CONCURRENCY = "1";
    resetNativeBindingForTests();

    for (let index = 0; index < 4; index += 1) {
      writeFile(projectRoot, `src/group-${index}/feature/app.ts`, "one\n2\n3\n");
    }
    writeMaxFileLinesConfig(projectRoot);

    const result = await runCli(["check", "--config", "./discipline.config.mjs"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(result.exitCode).toBe(1);
    expectChunkedScanLogs(stdout, stderr);
  } finally {
    restoreScanEnv(previousDisableNative, previousConcurrency);
  }
});

test("runs check through an explicit config module and prints concise violations", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    maxFileLines: {",
    "      max: 2,",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["check", "--config", "./discipline.config.mjs"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
  });

  expect(result.exitCode).toBe(1);
  expect(stdout.join("")).toContain("max-file-lines src/too-long.ts");
  expect(stdout.join("")).toContain("Found 1 discipline violation(s).");
});

test("prints human-readable DRY duplicate function groups", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];

  writeFile(projectRoot, "src/a.ts", [
    "export function buildUserLabel(value: unknown) {",
    "  return String(value ?? \"\").trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/b.ts", [
    "export function formatUserLabel(input: unknown) {",
    "  if (input == null) return \"\";",
    "  return String(input).trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    dry: {},",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["check", "--config", "./discipline.config.mjs"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
  });

  const output = stdout.join("");

  expect(result.exitCode).toBe(1);
  expect(output).toContain("dry duplicate function group: 2 functions, confidence 1, signals: normalized-behavior");
  expect(output).toContain("  - src/a.ts:1 buildUserLabel");
  expect(output).toContain("  - src/b.ts:1 formatUserLabel");
  expect(output).not.toContain("function duplicates in files");
  expect(output).toContain("Found 1 discipline violation(s).");
});

test("runs fix sync-imports through an explicit config module", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];

  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
  writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    syncImports: {",
    "      alias: { strategy: \"relative-path-slug\" },",
    "      allowRelative: [\"./\"],",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["fix", "sync-imports", "--config", "./discipline.config.mjs"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
  });

  expect(result.exitCode).toBe(0);
  expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "#shared-util"');
  expect(stdout.join("")).toContain("Fix summary: deleted files 0, moved 0, rewritten files 1, rewritten imports 1, removed comments 0, remaining violations 0.");
});

test("runs fix banned-files through an explicit config module", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
  writeFile(projectRoot, "src/app.spec.ts", "export const spec = true;\n");
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    bannedFiles: {",
    "      patterns: [{ glob: \"**/*.spec.ts\" }],",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["fix", "banned-files", "--config", "./discipline.config.mjs"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
  });

  expect(result.exitCode).toBe(0);
  expect(fileExists(projectRoot, "src/app.ts")).toBe(true);
  expect(fileExists(projectRoot, "src/app.spec.ts")).toBe(false);
  expect(stdout.join("")).toContain("Fix summary: deleted files 1, moved 0, rewritten files 0, rewritten imports 0, removed comments 0, remaining violations 0.");
});

test("runs fix through an explicit config module and applies folderization moves", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];

  writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
  writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");
  writeFile(projectRoot, "src/app.ts", 'export { route } from "./api/user_route";\nexport { schema } from "./api/user_schema";\n');
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    folderizeCompoundFiles: {},",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["fix", "--config", "./discipline.config.mjs"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
  });

  expect(result.exitCode).toBe(0);
  expect(fileExists(projectRoot, "src/api/user/route.ts")).toBe(true);
  expect(readFile(projectRoot, "src/app.ts")).toContain('from "./api/user/route"');
  expect(stdout.join("")).toContain("Fix summary: deleted files 0, moved 2, rewritten files 1, rewritten imports 2, removed comments 0, remaining violations 0.");
});

test("saves check output to a top-level report file", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];
  const reportName = "cd-report-2026-05-26-19-00-00.txt";

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
  writeFile(projectRoot, "code-discipline.ts", [
    "export default {",
    "  rules: {",
    "    maxFileLines: { max: 2 },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["check", "save"], {
    cwd: projectRoot,
    now: new Date("2026-05-26T19:00:00"),
    stdout: (text) => stdout.push(text),
  });

  expect(result.exitCode).toBe(1);
  expect(fileExists(projectRoot, reportName)).toBe(true);
  expect(readFile(projectRoot, reportName)).toContain("Found 1 discipline violation(s).");
  expect(stdout.join("")).toContain(`Saved report to ${reportName}.`);
});

test("runs fix remove-comments through an explicit config module", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];

  writeFile(projectRoot, "src/app.ts", [
    'const url = "https://example.com";',
    "// remove this",
    "export const app = url;",
    "",
  ].join("\n"));
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    removeComments: {},",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["fix", "remove-comments", "--config", "./discipline.config.mjs"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
  });

  expect(result.exitCode).toBe(0);
  expect(readFile(projectRoot, "src/app.ts")).toContain('const url = "https://example.com";');
  expect(readFile(projectRoot, "src/app.ts")).not.toContain("remove this");
  expect(stdout.join("")).toContain("Fix summary: deleted files 0, moved 0, rewritten files 1, rewritten imports 0, removed comments 1, remaining violations 0.");
});

test("runs max characters per line through an explicit config module", async () => {
  const projectRoot = tempProject();
  const stdout: string[] = [];

  writeFile(projectRoot, "src/checkout.ts", `export const value = "${"x".repeat(151)}";\n`);
  writeFile(projectRoot, "discipline.config.mjs", [
    "export default {",
    "  rules: {",
    "    maxCharactersPerLine: {},",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await runCli(["check", "max-characters-per-line", "--config", "./discipline.config.mjs"], {
    cwd: projectRoot,
    stdout: (text) => stdout.push(text),
  });

  expect(result.exitCode).toBe(1);
  expect(stdout.join("")).toContain("max-characters-per-line src/checkout.ts");
});
