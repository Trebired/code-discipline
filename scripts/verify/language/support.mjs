import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { languageFixtures, redundantPathSegmentsFiles } from "./fixtures.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { run } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function createLanguageProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-language-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, ".trebired/code-discipline"), { recursive: true });
  for (const [file, text] of Object.entries(languageFixtures)) {
    await fs.writeFile(path.join(root, "src", file), text, "utf8");
  }
  await fs.writeFile(path.join(root, ".trebired/code-discipline", "config.ts"), "const token='AUTO_EXCLUDED_TOKEN'   ;\n", "utf8");
  return root;
}

async function createRedundantPathSegmentsProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-redundant-path-segments-language-"));
  for (const file of redundantPathSegmentsFiles) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), "\n", "utf8");
  }

  return root;
}

function options(projectRoot, mode, onlyRules) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules,
    rules: {
      maxFunctionLines: { max: 3 },
      removeComments: {},
    },
  };
}

function structuralOptions(projectRoot, mode) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules: ["structural-blank-lines"],
    rules: {
      structuralBlankLines: {},
    },
  };
}

function redundantPathSegmentsOptions(projectRoot, mode) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules: ["redundant-path-segments"],
    rules: {
      redundantPathSegments: {},
    },
  };
}

function declarationNameOptions(projectRoot) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode: "check",
    onlyRules: ["min-declaration-name"],
    rules: {
      minDeclarationName: {
        min: 2,
      },
    },
  };
}

async function verifyLanguageCheck(projectRoot) {
  const result = await run(options(projectRoot, "check", ["max-function-lines", "remove-comments"]));
  const files = result.violations.map((violation) => violation.filePath).sort();
  assert.equal(result.violations.some((violation) => violation.filePath.startsWith(".trebired/code-discipline/")), false);
  assert.ok(files.includes("src/tool.py"));
  assert.ok(files.includes("src/run.sh"));
  assert.ok(files.includes("src/View.qml"));
  assert.ok(files.includes("src/run.cpp"));
  assert.ok(files.includes("src/run.cs"));
  assert.ok(result.violations.some((violation) => violation.message.includes("build_value")));
  assert.ok(result.violations.some((violation) => violation.message.includes("do_work")));
  assert.ok(result.violations.some((violation) => violation.message.includes("buildTitle")));
  assert.ok(result.violations.some((violation) => violation.message.includes("onClicked")));
  assert.ok(result.violations.some((violation) => violation.message.includes("DoWork")));
  assert.equal(result.violations.some((violation) => violation.message.includes("not_real")), false);
}

async function verifyDeclarationNameAcrossLanguages(projectRoot) {
  const result = await run(declarationNameOptions(projectRoot));
  const files = result.violations.map((violation) => violation.filePath).sort();

  assert.equal(result.ok, false);
  assert.ok(files.includes("src/declarations.css"));
  assert.ok(files.includes("src/declarations.go"));
  assert.ok(files.includes("src/declarations.py"));
  assert.ok(files.includes("src/declarations.qml"));
  assert.ok(files.includes("src/declarations.rs"));
  assert.ok(files.includes("src/declarations.scss"));
  assert.ok(files.includes("src/declarations.sh"));
  assert.ok(files.includes("src/declarations.ts"));
  assert.ok(files.includes("src/declarations.cpp"));
  assert.ok(files.includes("src/declarations.cs"));
}

async function verifyPackageStateExclusion(projectRoot) {
  const packageStatePattern = ["tre", "bired"].join(process.env.CD_VERIFY_PATTERN_SEPARATOR ?? "");
  const result = await run({
      projectRoot,
      ignore: { use_gitignore: false },
      mode: "check",
      onlyRules: ["banned-patterns"],
      rules: {
        bannedPatterns: {
          patterns: ["AUTO_EXCLUDED_TOKEN", packageStatePattern],
        },
      },
  });
  assert.equal(result.violations.some((violation) => violation.filePath.startsWith(".trebired/code-discipline/")), false);
}

async function verifyBannedPatternImportSpecifierExclusion(projectRoot) {
  await fs.writeFile(
    path.join(projectRoot, "src", "package-import.ts"),
    [
      'import { value } from "@trebired/example";',
      'export { helper } from "@trebired/helper";',
      'export const loaded = import("@trebired/lazy");',
      "export { value };",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(projectRoot, "src", "package-styles.scss"),
    [
      '@use "@trebired/theme";',
      '@forward "@trebired/tokens";',
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(projectRoot, "src", "banned-literal.ts"), 'export const brand = "trebired";\n', "utf8");

  const result = await run({
      projectRoot,
      ignore: { use_gitignore: false },
      mode: "check",
      onlyRules: ["banned-patterns"],
      rules: {
        bannedPatterns: {
          patterns: ["trebired"],
        },
      },
  });
  const files = result.violations.map((violation) => violation.filePath).sort();
  assert.deepEqual(files, ["src/banned-literal.ts"]);
}

async function verifyLanguageFix(projectRoot) {
  await run(options(projectRoot, "fix", ["remove-comments"]));
  const python = await fs.readFile(path.join(projectRoot, "src", "tool.py"), "utf8");
  const shell = await fs.readFile(path.join(projectRoot, "src", "run.sh"), "utf8");
  const qml = await fs.readFile(path.join(projectRoot, "src", "View.qml"), "utf8");
  const cpp = await fs.readFile(path.join(projectRoot, "src", "run.cpp"), "utf8");
  const csharp = await fs.readFile(path.join(projectRoot, "src", "run.cs"), "utf8");
  assert.ok(python.includes("#!/usr/bin/env python3"));
  assert.ok(python.includes("# coding: utf-8"));
  assert.ok(python.includes("'# keep literal'"));
  assert.ok(python.includes("# keep triple string"));
  assert.equal(python.includes("remove python comment"), false);
  assert.ok(shell.includes("#!/usr/bin/env sh"));
  assert.ok(shell.includes("value # keep literal"));
  assert.ok(shell.includes("# keep heredoc text"));
  assert.equal(shell.includes("remove shell comment"), false);
  assert.ok(qml.includes("literal // keep"));
  assert.ok(qml.includes("/* keep block */"));
  assert.ok(qml.includes("https?:\\/\\/example"));
  assert.ok(qml.includes("// keep template"));
  assert.equal(qml.includes("remove qml comment"), false);
  assert.equal(qml.includes("remove inline qml comment"), false);
  assert.ok(cpp.includes("R\"(// keep raw /* string */)\""));
  assert.equal(cpp.includes("remove cpp comment"), false);
  assert.equal(cpp.includes("remove inline cpp comment"), false);
  assert.equal(cpp.includes("remove this too"), false);
  assert.ok(csharp.includes("@\"C:\\temp\\// keep verbatim\""));
  assert.equal(csharp.includes("remove csharp comment"), false);
  assert.equal(csharp.includes("remove inline csharp comment"), false);
}

async function verifyStructuralBlankLines(projectRoot) {
  const check = await run(structuralOptions(projectRoot, "check"));
  const files = check.violations.map((violation) => violation.filePath).sort();

  assert.equal(check.ok, false);
  assert.ok(files.includes("src/spacing.css"));
  assert.ok(files.includes("src/spacing.go"));
  assert.ok(files.includes("src/spacing.py"));
  assert.ok(files.includes("src/spacing.qml"));
  assert.ok(files.includes("src/spacing.rs"));
  assert.ok(files.includes("src/spacing.sh"));
  assert.ok(files.includes("src/spacing.cpp"));
  assert.ok(files.includes("src/spacing.cs"));

  const fix = await run(structuralOptions(projectRoot, "fix"));
  assert.equal(fix.ok, true);
  assert.ok((fix.ruleResults["structural-blank-lines"]?.rewritten_files ?? 0) >= 8);

  const clean = await run(structuralOptions(projectRoot, "check"));
  assert.equal(clean.ok, true, JSON.stringify(clean.violations, null, 2));
}

async function verifyRedundantPathSegmentsAcrossLanguages() {
  const projectRoot = await createRedundantPathSegmentsProject();
  const check = await run(redundantPathSegmentsOptions(projectRoot, "check"));
  const files = check.violations.map((violation) => violation.filePath).sort();

  assert.equal(check.ok, false);
  assert.ok(files.includes("src/app_main.go"));
  assert.ok(files.includes("src/module_alpha.py"));
  assert.ok(files.includes("src/render_svg.rs"));
  assert.ok(files.includes("src/style_base.css"));
  assert.ok(files.includes("src/task_run.sh"));
  assert.ok(files.includes("src/view_logic.qml"));
  assert.ok(files.includes("src/utils_math.cpp"));
  assert.ok(files.includes("src/models_user.cs"));
  assert.ok(files.includes("src/pages/home_page.ts"));
  assert.equal(
    check.violations.find((violation) => violation.filePath === "src/pages/home_page.ts")?.details.mode,
    "redundant-path-segment",
  );
  assert.equal(
    check.violations.find((violation) => violation.filePath === "src/pages/home_page.ts")?.details.pathSegment,
    "pages",
  );

  const fix = await run(redundantPathSegmentsOptions(projectRoot, "fix"));
  assert.equal(fix.ok, true);
  assert.equal(fix.moved_files, 18);
  await fs.access(path.join(projectRoot, "src", "app", "main.go"));
  await fs.access(path.join(projectRoot, "src", "module", "alpha.py"));
  await fs.access(path.join(projectRoot, "src", "pages", "home.ts"));
  await fs.access(path.join(projectRoot, "src", "pages", "other.ts"));
  await fs.access(path.join(projectRoot, "src", "render", "svg.rs"));
  await fs.access(path.join(projectRoot, "src", "style", "theme.css"));
  await fs.access(path.join(projectRoot, "src", "task", "sync.sh"));
  await fs.access(path.join(projectRoot, "src", "view", "model.qml"));
  await fs.access(path.join(projectRoot, "src", "utils", "math.cpp"));
  await fs.access(path.join(projectRoot, "src", "models", "user.cs"));
}

const projectRoot = await createLanguageProject();

await verifyLanguageCheck(projectRoot);
await verifyDeclarationNameAcrossLanguages(projectRoot);
await verifyPackageStateExclusion(projectRoot);
await verifyBannedPatternImportSpecifierExclusion(projectRoot);
await verifyLanguageFix(projectRoot);
await verifyStructuralBlankLines(projectRoot);
await verifyRedundantPathSegmentsAcrossLanguages();

console.log("language support verification passed");
