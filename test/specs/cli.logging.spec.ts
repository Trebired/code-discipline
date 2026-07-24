import { expect, test } from "bun:test";
import path from "node:path";

import { packageRoot, runCommand, tempProject, writeErroringCliFixture, writeFile } from "./helpers.js";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function sourceCliPath(): string {
  return path.join(packageRoot, "src", "cli", "run-cli.ts");
}

test("default cli output uses Trebired logger rule and result groups", async () => {
  const projectRoot = tempProject();

  writeErroringCliFixture(projectRoot);

  const result = runCommand("bun", [sourceCliPath(), "check"], {
    cwd: projectRoot,
  });
  const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

  expect(result.status).toBe(1);
  expect(`${result.stdout}${result.stderr}`).toContain("\x1b[");
  expect(output).toContain("[FAIL, trebired.code-discipline.rules.max-file-lines] max-file-lines src/too-long.ts");
  expect(output).toContain("[FAIL, trebired.code-discipline.results] Found 1 discipline violation(s).");
  expect(output).toContain("[INFO, trebired.code-discipline.runs.check] Total check:");
  expect(output).not.toContain("trebired.code-discipline.cli");
});

test("default cli output routes warning violations through warning level", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.spec.ts", "export const covered = true;\n");
  writeFile(projectRoot, "code-discipline.ts", [
    "export default {",
    "  rules: {",
    "    bannedFiles: {",
    "      patterns: [{ glob: \"**/*.spec.ts\" }],",
    "      severity: \"warning\",",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = runCommand("bun", [sourceCliPath(), "check"], {
    cwd: projectRoot,
  });
  const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

  expect(result.status).toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain("\x1b[");
  expect(output).toContain("[WARN, trebired.code-discipline.rules.banned-files] banned-files src/app.spec.ts");
  expect(output).toContain("[WARN, trebired.code-discipline.results] Found 1 discipline warning(s).");
  expect(output).not.toContain("warning banned-files");
  expect(output).not.toContain("Scanning codebase");
  expect(output).not.toContain("trebired.code-discipline.cli");
});

test("default cli output routes passing summaries through success level", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
  writeFile(projectRoot, "code-discipline.ts", [
    "export default {",
    "  rules: {",
    "    maxFileLines: { max: 10 },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = runCommand("bun", [sourceCliPath(), "check"], {
    cwd: projectRoot,
  });
  const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

  expect(result.status).toBe(0);
  expect(output).toContain("[SUCCESS, trebired.code-discipline.results] No discipline violations found.");
});
