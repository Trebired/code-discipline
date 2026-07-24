import { expect, test } from "bun:test";

import { checkCodeDiscipline } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

function writeDefaultNameFixture(projectRoot: string): void {
  writeFile(projectRoot, "src/app.ts", [
    "const t = 1;",
    "const ok = 2;",
    "const total = 2;",
    "function f() {",
    "  return total;",
    "}",
    "function formatTotal() {",
    "  return total;",
    "}",
    "for (const i of [1]) {",
    "  console.log(i);",
    "}",
    "",
  ].join("\n"));
}

const defaultNameViolationMessages = [
  "const t has 1 character and is below the minimum name length of 2",
  "function f has 1 character and is below the minimum name length of 2",
  "const i has 1 character and is below the minimum name length of 2",
];

const defaultNameViolationDetails = [
  expect.objectContaining({ declarationKind: "const", declarationName: "t", length: 1, min: 2 }),
  expect.objectContaining({ declarationKind: "function", declarationName: "f", length: 1, min: 2 }),
  expect.objectContaining({ declarationKind: "const", declarationName: "i", length: 1, min: 2 }),
];

test("reports short function and const names with the default minimum", async () => {
  const projectRoot = tempProject();

  writeDefaultNameFixture(projectRoot);

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      minDeclarationName: {},
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations.map((violation) => violation.rule)).toEqual([
    "min-declaration-name",
    "min-declaration-name",
    "min-declaration-name",
  ]);
  expect(result.violations.map((violation) => violation.message)).toEqual(defaultNameViolationMessages);
  expect(result.violations.map((violation) => violation.details)).toEqual(defaultNameViolationDetails);
});

test("honors configured minimum and rule-local exclusions", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "const cat = true;\nfunction dog() { return cat; }\n");
  writeFile(projectRoot, "src/client.ts", "const ui = true;\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      minDeclarationName: {
        min: 4,
        excludeDirs: [
          { type: "file", pattern: "**/client.ts" },
        ],
      },
    },
  });

  expect(result.violations.map((violation) => violation.message)).toEqual([
    "const cat has 3 characters and is below the minimum name length of 4",
    "function dog has 3 characters and is below the minimum name length of 4",
  ]);
});
