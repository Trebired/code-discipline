import { expect, test } from "bun:test";

import { checkCodeDiscipline } from "#co5e63fhc1wb";
import { tempProject, writeFile } from "./helpers.js";

test("catches an array .join('') assembled banned pattern", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", 'const secret = ["OPER", "LORN", "_AGENT_PID"].join("");\nexport function reveal() {\n  return secret;\n}\n');

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      bannedPatterns: {
        patterns: ["OPERLORN_AGENT_PID"],
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]).toMatchObject({
    rule: "banned-patterns",
    filePath: "src/app.ts",
    message: 'file contains banned pattern "OPERLORN_AGENT_PID" via a constant-folded expression 2 times',
    details: {
      pattern: "OPERLORN_AGENT_PID",
      occurrences: 0,
      foldedOccurrences: 2,
    },
  });
});

test("catches string concatenation via +", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", 'export const combined = "OPE" + "RLORN";\n');

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { bannedPatterns: { patterns: ["OPERLORN"] } },
  });

  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]?.details).toMatchObject({
    occurrences: 0,
    foldedOccurrences: 1,
    foldedMatches: [{ line: 1, kind: "concat" }],
  });
});

test("catches a template literal whose interpolations are foldable", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    'const a = "OPER";',
    'const b = "LORN";',
    "export const templated = `${a}${b}`;",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { bannedPatterns: { patterns: ["OPERLORN"] } },
  });

  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]?.details).toMatchObject({
    foldedOccurrences: 1,
    foldedMatches: [{ line: 3, kind: "template" }],
  });
});

test("folds later references to a same-scope const alias", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    'const another = "OPERLORN";',
    "export function useIt() {",
    "  return another;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { bannedPatterns: { patterns: ["OPERLORN"] } },
  });

  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]).toMatchObject({
    message: 'file contains banned pattern "OPERLORN" and via a constant-folded expression',
    details: {
      occurrences: 1,
      foldedOccurrences: 1,
      foldedMatches: [{ line: 3, kind: "identifier" }],
    },
  });
});

test("does not fold genuinely dynamic values", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    "export function greet(name: string) {",
    '  const parts = ["OPER", name].join("");',
    "  return parts;",
    "}",
    "",
    "export function fromEnv() {",
    '  return ["OPER", process.env.SUFFIX ?? ""].join("");',
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { bannedPatterns: { patterns: ["OPERLORN"] } },
  });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);
});

test("refuses to fold a reference shadowed by a nested declaration of the same name", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    'const secretValue = "totally safe";',
    "export function withShadow() {",
    "  function inner() {",
    '    const secretValue = "OPERLORN";',
    "    return secretValue;",
    "  }",
    "  return secretValue;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { bannedPatterns: { patterns: ["OPERLORN"] } },
  });

  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]?.details).toMatchObject({
    occurrences: 1,
    foldedOccurrences: 0,
    foldedMatches: [],
  });
});

test("keeps the existing raw-text-only message and details unchanged", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    'export const label = "Test runner";',
    'export const detail = "contest";',
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { bannedPatterns: { patterns: ["test"] } },
  });

  expect(result.violations[0]).toMatchObject({
    rule: "banned-patterns",
    message: 'file contains banned pattern "test" 2 times',
    details: {
      pattern: "test",
      occurrences: 2,
      foldedOccurrences: 0,
      foldedMatches: [],
    },
  });
});

test("does not crash on files that fail to parse as TypeScript", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/broken.ts", "const x = {{{ this is not valid syntax\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { bannedPatterns: { patterns: ["OPERLORN"] } },
  });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);
});

test("ignores unsupported non-TypeScript files for folding but still scans raw text", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/main.go", 'const secret = "OPERLORN"\n');

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: { bannedPatterns: { patterns: ["OPERLORN"] } },
  });

  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]?.details).toMatchObject({
    occurrences: 1,
    foldedOccurrences: 0,
  });
});
