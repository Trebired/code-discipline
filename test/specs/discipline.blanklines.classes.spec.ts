import { expect, test } from "bun:test";

import { checkCodeDiscipline, fixCodeDiscipline } from "../../src/index.js";
import { fixAndRead, readFile, tempProject, writeFile } from "./helpers.js";

test("handles getter/setter pairs as one logical member", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", [
    "class Box {",
    "  get value() {",
    "    return this.currentValue;",
    "  }",
    "  set value(nextValue: string) {",
    "    this.currentValue = nextValue;",
    "  }",
    "  method() {}",
    "}",
    "",
  ].join("\n"));

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe([
    "class Box {",
    "  get value() {",
    "    return this.currentValue;",
    "  }",
    "  set value(nextValue: string) {",
    "    this.currentValue = nextValue;",
    "  }",
    "",
    "  method() {}",
    "}",
    "",
  ].join("\n"));
});

test("handles class fields followed by the first method", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", [
    "class Controller {",
    "  private connected = false;",
    "  private failed = false;",
    "  private currentPort = 0;",
    "  start() {}",
    "}",
    "",
  ].join("\n"));

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe([
    "class Controller {",
    "  private connected = false;",
    "  private failed = false;",
    "  private currentPort = 0;",
    "",
    "  start() {}",
    "}",
    "",
  ].join("\n"));
});

test("handles namespace bodies", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", [
    "namespace App {",
    "  const a = 1;",
    "  const b = 2;",
    "  function run() {}",
    "}",
    "",
  ].join("\n"));

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe([
    "namespace App {",
    "  const a = 1;",
    "  const b = 2;",
    "",
    "  function run() {}",
    "}",
    "",
  ].join("\n"));
});

test("leaves ordinary statements inside function bodies untouched", async () => {
  const projectRoot = tempProject();
  const source = [
    "function loadUser(id: string) {",
    "  const user = users.get(id);",
    "  if (!user) return null;",
    "  user.lastAccessedAt = new Date().toISOString();",
    "  return user;",
    "}",
    "",
  ].join("\n");
  writeFile(projectRoot, "src/app.ts", source);

  const result = await checkCodeDiscipline({ projectRoot, rules: { structuralBlankLines: {} } });

  expect(result.ok).toBe(true);
  expect(readFile(projectRoot, "src/app.ts")).toBe(source);
});

test("leaves interface members untouched", async () => {
  const projectRoot = tempProject();
  const source = [
    "interface UserRecord {",
    "  id: string;",
    "  name: string;",
    "",
    "  email: string;",
    "}",
    "",
  ].join("\n");
  writeFile(projectRoot, "src/app.ts", source);

  const result = await checkCodeDiscipline({ projectRoot, rules: { structuralBlankLines: {} } });

  expect(result.ok).toBe(true);
  expect(readFile(projectRoot, "src/app.ts")).toBe(source);
});

test("preserves CRLF line endings", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\r\nfunction b() {}\r\n");

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe("function a() {}\r\n\r\nfunction b() {}\r\n");
});

test("preserves the final-newline state", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\nfunction b() {}");

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe("function a() {}\n\nfunction b() {}");
  expect(result.endsWith("\n")).toBe(false);
});

test("supports severity: warning", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\nfunction b() {}\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { structuralBlankLines: { severity: "warning" } },
  });

  expect(result.ok).toBe(true);
  expect(result.violationCount).toBe(1);
  expect(result.violations[0]).toMatchObject({ rule: "structural-blank-lines", severity: "warning" });
});

test("supports rule exclusions", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\nfunction b() {}\n");
  writeFile(projectRoot, "src/skip.ts", "function a() {}\nfunction b() {}\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      structuralBlankLines: {
        excludeDirs: [{ type: "file", pattern: "**/skip.ts" }],
      },
    },
  });

  expect(result.violationCount).toBe(1);
  expect(result.violations[0]?.filePath).toBe("src/app.ts");
});

test("works through targeted check structural-blank-lines", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\nfunction b() {}\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    onlyRules: ["structural-blank-lines"],
    rules: { structuralBlankLines: {} },
  });

  expect(result.violationCount).toBe(1);
  expect(result.violations[0]?.rule).toBe("structural-blank-lines");
});

test("works through targeted fix structural-blank-lines", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\nfunction b() {}\n");

  const result = await fixCodeDiscipline({
    projectRoot,
    onlyRules: ["structural-blank-lines"],
    rules: { structuralBlankLines: {} },
  });

  expect(result.rewritten_files).toBe(1);
  expect(readFile(projectRoot, "src/app.ts")).toBe("function a() {}\n\nfunction b() {}\n");
});

test("is idempotent after one fix and produces no changes on a second fix", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\n\n\nfunction b() {}\n");

  const firstFix = await fixCodeDiscipline({ projectRoot, rules: { structuralBlankLines: {} } });
  expect(firstFix.rewritten_files).toBe(1);

  const secondFix = await fixCodeDiscipline({ projectRoot, rules: { structuralBlankLines: {} } });
  expect(secondFix.rewritten_files).toBe(0);
  expect(secondFix.violationCount).toBe(0);
});

test("works together with remove-comments in the fix pipeline", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\n// TODO remove this note\nfunction b() {}\n");

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      removeComments: {},
      structuralBlankLines: {},
    },
  });

  expect(result.ok).toBe(true);
  expect(readFile(projectRoot, "src/app.ts")).toBe("function a() {}\n\nfunction b() {}\n");
});

test("works with Prettier formatting enabled", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\nfunction b() {}\n");

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: { structuralBlankLines: {} },
    formatters: { prettier: {} },
  });

  expect(result.ok).toBe(true);
  expect(readFile(projectRoot, "src/app.ts")).toBe("function a() {}\n\nfunction b() {}\n");
});

test("ignores unsupported Go, Rust, CSS, and SCSS files", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/main.go", "func a() {}\nfunc b() {}\n");
  writeFile(projectRoot, "src/main.rs", "fn a() {}\nfn b() {}\n");
  writeFile(projectRoot, "src/app.css", ".a {}\n.b {}\n");
  writeFile(projectRoot, "src/app.scss", ".a {}\n.b {}\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { structuralBlankLines: {} },
  });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);
});
