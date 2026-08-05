import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const distUrl = pathToFileURL(path.join(repoRoot, "dist/index.js")).href;
const cliUrl = pathToFileURL(path.join(repoRoot, "dist/cli/run.js")).href;
const { codeDiscipline, loadResolvedCodeDisciplineConfig } = await import(distUrl);
const { runCli } = await import(cliUrl);

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createArtifactProject(name, gitignoreText) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `cd-${name}-`));
  await fs.mkdir(path.join(root, ".trebired/code-discipline"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "a.ts"), "export const a = 1;\n", "utf8");
  await fs.writeFile(path.join(root, "src", "b.ts"), "import { a } from \"./a\";\nexport const b = a;\n", "utf8");
  await fs.writeFile(path.join(root, "base.json"), "{\"compilerOptions\":{\"lib\":[\"ES2020\"]}}\n", "utf8");
  await writeJson(path.join(root, "tsconfig.json"), {
    extends: "./base.json",
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "#old": ["./src/a.ts"],
      },
      strict: true,
    },
    include: ["src/**/*.ts"],
  });
  await fs.writeFile(path.join(root, ".trebired/code-discipline", "config.ts"), [
    "export default {",
    "  ignore: { use_gitignore: true },",
    "  rules: {",
    "    imports: {",
    "      alias: { strategy: \"relative-path-slug\" },",
    "      allowRelative: [],",
    "      output: { type: \"alias-map\" },",
    "      runtime: { restoreAfterRun: false },",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"), "utf8");
  if (gitignoreText !== undefined) {
    await fs.writeFile(path.join(root, ".gitignore"), gitignoreText, "utf8");
  }
  return root;
}

function configOptions(projectRoot) {
  return {
    projectRoot,
    ignore: { use_gitignore: true },
    rules: {
      imports: {
        alias: { strategy: "relative-path-slug" },
        allowRelative: [],
        output: { type: "alias-map" },
        runtime: { restoreAfterRun: false },
      },
    },
  };
}

async function runSyncFix(projectRoot) {
  return codeDiscipline({
    ...configOptions(projectRoot),
    mode: "fix",
    onlyRules: ["imports"],
  });
}

async function verifyGeneratedGitignore() {
  const missingRoot = await createArtifactProject("generated-missing");
  await runSyncFix(missingRoot);
  const createdText = await fs.readFile(path.join(missingRoot, ".gitignore"), "utf8");
  assert.equal(createdText, ".trebired/code-discipline/generated/\n");

  const existingRoot = await createArtifactProject("generated-existing", "dist/\n# local note\n");
  await runSyncFix(existingRoot);
  await runSyncFix(existingRoot);
  const existingText = await fs.readFile(path.join(existingRoot, ".gitignore"), "utf8");
  const lines = existingText.split(/\r?\n/).filter(Boolean);

  assert.ok(lines.includes("dist/"));
  assert.equal(lines.filter((line) => line === ".trebired/code-discipline/generated/").length, 1);
  assert.equal(lines.includes(".trebired/code-discipline/"), false);
  assert.equal(lines.includes(".trebired/code-discipline/imports/"), false);
}

async function verifyGeneratedTsconfigWiring() {
  const projectRoot = await createArtifactProject("generated-tsconfig", "build/\n");
  await runSyncFix(projectRoot);

  const generatedPath = path.join(projectRoot, ".trebired/code-discipline/generated/tsconfig.paths.json");
  const generated = JSON.parse(await fs.readFile(generatedPath, "utf8"));
  const rootTsconfigPath = path.join(projectRoot, "tsconfig.json");
  const rootTsconfig = JSON.parse(await fs.readFile(rootTsconfigPath, "utf8"));

  const generatedTargets = Object.values(generated.compilerOptions.paths).flat();
  assert.ok(generatedTargets.includes("../../../src/a.ts"));
  assert.ok(generatedTargets.includes("../../../src/b.ts"));
  assert.deepEqual(rootTsconfig.extends, ["./base.json", "./.trebired/code-discipline/generated/tsconfig.paths.json"]);
  assert.equal(rootTsconfig.compilerOptions.strict, true);
  assert.equal("paths" in rootTsconfig.compilerOptions, false);
  assert.equal("baseUrl" in rootTsconfig.compilerOptions, false);

  rootTsconfig.extends = "./base.json";
  await writeJson(rootTsconfigPath, rootTsconfig);
  const check = await codeDiscipline({
    ...configOptions(projectRoot),
    mode: "check",
    onlyRules: ["imports"],
  });
  const syncViolation = check.violations.find((violation) => violation.rule === "imports");

  assert.ok(syncViolation);
  assert.equal(syncViolation.fix, true);
  assert.equal(syncViolation.details.drift.rootExtendsChanged, true);
}

async function verifySavedReportPath() {
  const projectRoot = await createArtifactProject("generated-report", "build/\n");
  let stdout = "";
  let stderr = "";
  const now = new Date(2026, 0, 2, 3, 4, 5);
  await runCli(["check", "save", "--config", ".trebired/code-discipline/config.ts"], {
    cwd: projectRoot,
    now,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });

  const relativeReport = ".trebired/code-discipline/generated/reports/cd-report-2026-01-02-03-04-05.txt";
  assert.match(`${stdout}\n${stderr}`, new RegExp(relativeReport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(await fileExists(path.join(projectRoot, relativeReport)), true);
  assert.equal(await fileExists(path.join(projectRoot, "cd-report-2026-01-02-03-04-05.txt")), false);
}

async function verifyConfigDiscoveryPath() {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cd-config-discovery-"));
  await fs.mkdir(path.join(projectRoot, ".code-discipline"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, ".code-discipline", "config.ts"), "export default {};\n", "utf8");

  await assert.rejects(
    () => loadResolvedCodeDisciplineConfig(projectRoot),
    /No code-discipline config module was found/,
  );

  const explicit = await loadResolvedCodeDisciplineConfig(projectRoot, ".code-discipline/config.ts");
  assert.equal(explicit.configPath, path.join(projectRoot, ".code-discipline/config.ts"));
}

await verifyGeneratedGitignore();
await verifyGeneratedTsconfigWiring();
await verifySavedReportPath();
await verifyConfigDiscoveryPath();

console.log("generated artifact verification passed");
