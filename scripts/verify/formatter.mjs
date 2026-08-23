import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { run } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function writeFixtureFile(args) {
  const destination = path.join(args.root, args.relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, args.text, "utf8");
}

async function writeScriptBraceFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/app.ts", text: [
        "export function run() {",
        "const value = {",
        "name: \"one\"",
        "}",
        "return value",
        "}",
        "",
        "",
      ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/View.qml", text: [
        "Item {",
        "MouseArea {",
        "onClicked: {",
        "console.log(\"ok\")",
        "}",
        "}",
        "}",
        "",
      ].join("\n") });
}

async function writeStyleBraceFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/styles.css", text: [
        ".item {",
        "color: red;",
        "@media screen {",
        "display: block;",
        "}",
        "}",
        "",
      ].join("\n") });
}

async function writeNativeBraceFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/lib.rs", text: [
        "pub fn run() {",
        "let value = 1;",
        "if value > 0 {",
        "println!(\"ok\");",
        "}",
        "}",
        "",
      ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/main.go", text: [
        "package main",
        "func main() {",
        "if true {",
        "println(\"ok\")",
        "}",
        "}",
        "",
      ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/main.cpp", text: [
        "int main() {",
        "if (true) {",
        "return 0;",
        "}",
        "}",
        "",
      ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/Program.cs", text: [
        "class Program",
        "{",
        "static void Main()",
        "{",
        "System.Console.WriteLine(\"ok\");",
        "}",
        "}",
        "",
      ].join("\n") });
}

async function writeBraceFixtures(root) {
  await writeScriptBraceFixtures(root);
  await writeStyleBraceFixtures(root);
  await writeNativeBraceFixtures(root);
}

async function writeLongLineFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/message.ts", text: [
        "export const message = \"The formatter splits this TypeScript string while preserving the runtime value.\"",
        "",
      ].join("\n") });
  await writeQmlLongLineFixtures(root);
  await writeRustLongLineFixtures(root);
}

async function writeQmlLongLineFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/LongLine.qml", text: [
        "Item {",
        "function center() {",
        "const field = selectedField();",
        "if (!field) return;",
        "updateGeometry(selectedFieldIndex, widthValue / 2, heightValue / 2, false);",
        "fieldsModel.setProperty(selectedFieldIndex, \"alignment\", \"center\")",
        "}",
        "Controls.Label {",
        "text: \"The formatter splits this QML label without changing the JavaScript string value.\"",
        "}",
        "}",
        "",
      ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/HomeMessage.qml", text: [
        "Kirigami.InlineMessage {",
        "text: \"Generated output is enabled under \" + root.appState.data_dir + \"/generated-output and does not send data to an external target.\"",
        "actions: [",
        "Kirigami.Action {",
        "text: \"Settings\"",
        "}",
        "]",
        "}",
        "",
      ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/Compact.qml", text: [
        "QtObject {",
        "function widthCm() { return parsedCm(props.widthText, 5) }",
        "function gridMinimum(axisMm) { const step = gridStepMm(axisMm); return Math.ceil(-axisMm / (2 * step)) }",
        "function fitted(width, height) {",
        "if (height > 10) { height = 10; width = height }",
        "return { width, height }",
        "}",
        "}",
        "",
      ].join("\n") });
}

async function writeRustLongLineFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/raw.rs", text: [
        "pub fn svg() -> &'static str {",
        "r#\"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"50\"><rect width=\"80\" height=\"50\" fill=\"white\"/></svg>\"#",
        "}",
        "",
      ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/renderer.rs", text: [
        "fn render() {",
        "    svg.push_str(&format!(",
        "        r#\"",
        "        <text x=\"{text_x}\" y=\"{y}\" text-anchor=\"{anchor}\" "
        +"font-family=\"{family}\" font-size=\"{font_size}\" font-weight=\"{weight}\" fill=\"black\">{escaped}</text>",
        "        \"#,",
        "    ));",
        "}",
        "",
      ].join("\n") });
}

async function writeScriptFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/tool.py", text: [
        "#!/usr/bin/env python3",
        "def run():   ",
        "    # this comment is long enough that it should wrap at a small configured width",
        "    value = \"The formatter splits this Python string while preserving the runtime value.\"",
        "    return True",
        "",
      ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/run.sh", text: [
        "#!/usr/bin/env sh",
        "run(){",
        "  echo ok   ",
        "}",
        "",
      ].join("\n") });
}

async function createFormatterProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-formatter-"));
  await writeBraceFixtures(root);
  await writeLongLineFixtures(root);
  await writeScriptFixtures(root);
  await writeFixtureFile({
      root,
      relativePath: ".trebired/code-discipline/config.ts",
      text: "const value='state'   ;\n",
  });
  return root;
}

function formatterOptions(projectRoot, mode, onlyRules = ["format"]) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules,
    rules: {
      formatting: {},
      maxCharactersPerLine: {
        max: 44,
      },
    },
  };
}

function assertLinesFit(text, max, label) {
  const violations = text
  .split(/\n/u)
  .map((line, index) => ({ line, lineNumber: index + 1, count: Array.from(line).length }))
  .filter((entry) => entry.count > max);

  assert.deepEqual(violations, [], `${label} should not contain lines over ${max} characters`);
}

function assertInitialCheck(check) {
  const violatedFiles = check.violations.map((violation) => violation.filePath).sort();

  assert.equal(check.ok, false);
  assert.equal(
    violatedFiles.some((filePath) => filePath.startsWith(".trebired/code-discipline/generated/")
      ||filePath.startsWith(".trebired/code-discipline/imports/")),
    false,
  );
  assert.ok(violatedFiles.includes("src/app.ts"));
  assert.ok(violatedFiles.includes("src/View.qml"));
  assert.ok(violatedFiles.includes("src/styles.css"));
  assert.ok(violatedFiles.includes("src/tool.py"));
  assert.ok(violatedFiles.includes("src/main.cpp"));
  assert.ok(violatedFiles.includes("src/Program.cs"));
}

async function assertFormattedOutput(projectRoot) {
  await assertFormattedScriptOutput(projectRoot);
  await assertFormattedNativeOutput(projectRoot);
}

async function assertFormattedScriptOutput(projectRoot) {
  assert.equal(await fs.readFile(path.join(projectRoot, "src/app.ts"), "utf8"), [
      "export function run() {",
      "  const value = {",
      "    name: \"one\"",
      "  };",
      "  return value;",
      "}",
      "",
    ].join("\n"));
  const toolText = await fs.readFile(path.join(projectRoot, "src/tool.py"), "utf8");

  assert.ok(toolText.includes("    value = ("));
  assertLinesFit(toolText, 44, "src/tool.py");
  assert.equal(toolText, [
      "#!/usr/bin/env python3",
      "def run():",
      "    # this comment is long enough that it",
      "    # should wrap at a small configured",
      "    # width",
      "    value = (",
      "        \"The formatter splits this Python \"",
      "        \"string while preserving the \"",
      "        \"runtime value.\"",
      "    )",
      "    return True",
      "",
    ].join("\n"));
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/message.ts"), "utf8"), 44, "src/message.ts");
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/LongLine.qml"), "utf8"), 44, "src/LongLine.qml");
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/HomeMessage.qml"), "utf8"), 44, "src/HomeMessage.qml");
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/Compact.qml"), "utf8"), 44, "src/Compact.qml");
}

async function assertFormattedNativeOutput(projectRoot) {
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/raw.rs"), "utf8"), 44, "src/raw.rs");
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/renderer.rs"), "utf8"), 44, "src/renderer.rs");
  assert.equal(await fs.readFile(path.join(projectRoot, "src/main.cpp"), "utf8"), [
      "int main() {",
      "  if (true) {",
      "    return 0;",
      "  }",
      "}",
      "",
    ].join("\n"));
  assert.equal(await fs.readFile(path.join(projectRoot, "src/Program.cs"), "utf8"), [
      "class Program",
      "{",
      "    static void Main()",
      "    {",
      "        System.Console.WriteLine(\"ok\");",
      "    }",
      "}",
      "",
    ].join("\n"));
}

async function verifyFormatter() {
  const projectRoot = await createFormatterProject();
  const statePath = path.join(projectRoot, ".trebired/code-discipline/config.ts");
  const stateBefore = await fs.readFile(statePath, "utf8");
  const check = await run(formatterOptions(projectRoot, "check"));

  assertInitialCheck(check);

  const fix = await run(formatterOptions(projectRoot, "fix"));
  assert.equal(fix.ok, true);
  assert.ok(fix.formatted_files >= 4);
  const stateAfter = await fs.readFile(statePath, "utf8");
  assert.notEqual(stateAfter, stateBefore);
  assert.equal(stateAfter, 'const value = "state";\n');

  const clean = await run(formatterOptions(projectRoot, "check", ["format", "max-characters-per-line"]));
  assert.equal(clean.ok, true, JSON.stringify(clean.violations, null, 2));
  assert.equal(clean.violationCount, 0);

  await assertFormattedOutput(projectRoot);
}

async function verifyTopLevelFormatterIsRejected() {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cd-formatter-rejected-"));
  await assert.rejects(
    () => run({
        projectRoot,
        ignore: { use_gitignore: false },
        mode: "check",
        onlyRules: ["format"],
        formatter: true,
        rules: {
          formatting: {},
        },
    }),
    /formatter is no longer supported/u,
  );
}

await verifyFormatter();
await verifyTopLevelFormatterIsRejected();

console.log("formatter verification passed");
