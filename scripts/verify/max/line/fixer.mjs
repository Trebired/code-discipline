import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { codeDiscipline } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function createLineProject(name) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `cd-${name}-`));
  await fs.mkdir(path.join(root, "src", "i18n"), { recursive: true });
  return root;
}

async function writeFile(root, relativePath, text) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
  return filePath;
}

function baseOptions(projectRoot, max = 96) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    rules: {
      maxCharactersPerLine: { max },
      removeComments: {},
    },
  };
}

async function runMaxFix(projectRoot, max = 96) {
  return codeDiscipline({
    ...baseOptions(projectRoot, max),
    mode: "fix",
    onlyRules: ["max-characters-per-line"],
  });
}

async function importTsFile(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const outputPath = `${filePath}.${Date.now()}.mjs`;
  await fs.writeFile(outputPath, output, "utf8");
  return import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
}

function assertLinesWithin(text, max) {
  const longLines = text
    .split(/\r?\n/)
    .map((line, index) => ({ index: index + 1, length: Array.from(line).length }))
    .filter((line) => line.length > max);
  assert.deepEqual(longLines, []);
}

async function verifySafeLiteralSplitting() {
  const projectRoot = await createLineProject("max-safe");
  const message = "Akce jsou workflow vlastněná repozitářem, nalezená v {{dir}}. Starší shellová workflow stále fungují, zatímco úlohy, artefakty a běhy workflow_dispatch jsou podporovány také zde.";
  const filePath = await writeFile(projectRoot, "src/i18n/cs.ts", [
    "const messages = {",
    "  repositoryActionsDescription:",
    `    "${message}",`,
    "};",
    "export default messages;",
    "",
  ].join("\n"));

  const result = await runMaxFix(projectRoot);
  const text = await fs.readFile(filePath, "utf8");
  const imported = await importTsFile(filePath);

  assert.equal(result.ruleResults["remove-comments"], undefined);
  assert.equal(imported.default.repositoryActionsDescription, message);
  assert.match(text, /" \+\n    "/);
  assertLinesWithin(text, 96);
}

async function verifyExpressionPositions() {
  const projectRoot = await createLineProject("max-positions");
  const callValue = "Function call arguments can be split safely when the source literal is plain and has good whitespace split points.";
  const returnValue = "Return statements can be split safely while preserving the exact runtime value for the returned text.";
  const arrayValue = "Array elements can be split safely when they are plain string literals in normal expression lists.";
  const filePath = await writeFile(projectRoot, "src/positions.ts", [
    "const collect = (...values: string[]) => values;",
    `export const callValue = collect("${callValue}");`,
    `export const arrayValue = ["${arrayValue}"];`,
    `export function returned() { return "${returnValue}"; }`,
    "",
  ].join("\n"));

  await runMaxFix(projectRoot, 88);
  const imported = await importTsFile(filePath);
  const text = await fs.readFile(filePath, "utf8");

  assert.equal(imported.callValue[0], callValue);
  assert.equal(imported.arrayValue[0], arrayValue);
  assert.equal(imported.returned(), returnValue);
  assertLinesWithin(text, 88);
}

async function verifyUnsafeLiteralsStayReported() {
  const projectRoot = await createLineProject("max-unsafe");
  const filePath = await writeFile(projectRoot, "src/unsafe.ts", [
    "\"directive prologue literals stay untouched because changing them could change directive behavior in uncertain cases\";",
    "import value from \"./a/really/really/really/really/really/really/really/really/really/really/long/module-name\";",
    "const escaped = \"This escaped \\\"quote\\\" string is intentionally long enough to violate the configured line limit but remain unchanged.\";",
    "const url = \"https://example.com/a/really/really/really/really/really/really/really/really/long/path\";",
    "const token = \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\";",
    "/* inline note */ const commented = \"A plain string with a leading comment marker on the same line stays untouched by the safe fixer.\";",
    "/* keep me */",
    "void value;",
    "void commented;",
    "",
  ].join("\n"));
  const generatedPath = await writeFile(projectRoot, "src/generated/out.ts", [
    "export const generatedText = \"Generated source stays untouched even when it contains a long plain string with whitespace split points.\";",
    "",
  ].join("\n"));
  const before = await fs.readFile(filePath, "utf8");
  const generatedBefore = await fs.readFile(generatedPath, "utf8");

  const result = await runMaxFix(projectRoot, 86);
  const after = await fs.readFile(filePath, "utf8");
  const generatedAfter = await fs.readFile(generatedPath, "utf8");
  const ruleResult = result.ruleResults["max-characters-per-line"];

  assert.equal(after, before);
  assert.equal(generatedAfter, generatedBefore);
  assert.ok(ruleResult);
  assert.ok(ruleResult.violationCount >= 7);
  assert.ok(after.includes("/* keep me */"));
}

async function verifyShortLinesUnchanged() {
  const projectRoot = await createLineProject("max-short");
  const filePath = await writeFile(projectRoot, "src/short.ts", [
    "export const title = \"Short title\";",
    "export const values = [\"one\", \"two\"];",
    "",
  ].join("\n"));
  const before = await fs.readFile(filePath, "utf8");

  const result = await runMaxFix(projectRoot, 96);
  const after = await fs.readFile(filePath, "utf8");

  assert.equal(after, before);
  assert.equal(result.ruleResults["max-characters-per-line"].rewritten_files, 0);
}

await verifySafeLiteralSplitting();
await verifyExpressionPositions();
await verifyUnsafeLiteralsStayReported();
await verifyShortLinesUnchanged();

console.log("max-characters-per-line fixer verification passed");
