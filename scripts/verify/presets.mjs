import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { codeDiscipline } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);
const { runCli } = await import(pathToFileURL(path.join(repoRoot, "dist/cli/run.js")).href);

async function createProject(name) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `cd-presets-${name}-`));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "tsconfig.json"), "{\n  \"compilerOptions\": {\n    \"paths\": {}\n  }\n}\n", "utf8");
  return root;
}

async function writeSource(root, relativePath, text) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
  await fs.appendFile(filePath, "", "utf8");
  return filePath;
}

async function writeConfig(root, text) {
  const configPath = path.join(root, ".trebired/code-discipline/config.ts");
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, text, "utf8");
  return configPath;
}

function presetOptions(projectRoot, extra = {}) {
  return {
    projectRoot,
    mode: "check",
    ignore: { use_gitignore: false },
    logging: { warnings: false },
    presets: { use: ["trebired"] },
    ...extra,
  };
}

async function verifyNamedPresetEnablesStrictRules() {
  const projectRoot = await createProject("strict");
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const result = await codeDiscipline(presetOptions(projectRoot, {
        onlyRules: ["max-file-lines"],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].rule, "max-file-lines");
  assert.equal(result.violations[0].filePath, "src/large.ts");
}

async function verifyRepoConfigOverridesPresetScalars() {
  const projectRoot = await createProject("override");
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const result = await codeDiscipline(presetOptions(projectRoot, {
        onlyRules: ["max-file-lines"],
        rules: {
          maxFileLines: {
            max: 400,
          },
        },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
}

async function verifyBannedPatternsMergeDuplicateAllowlists() {
  const projectRoot = await createProject("patterns");
  await writeSource(projectRoot, "src/name.ts", "export const packageName = \"trebired\";\n");
  await writeSource(projectRoot, "src/custom.ts", "export const packageName = \"custom-token\";\n");

  const result = await codeDiscipline(presetOptions(projectRoot, {
        onlyRules: ["banned-patterns"],
        rules: {
          bannedPatterns: {
            patterns: [
              { value: "trebired", allowedFiles: ["src/name.ts"] },
              { value: "custom-token" },
            ],
          },
        },
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => violation.filePath), ["src/custom.ts"]);
  assert.equal(result.violations[0].details.pattern, "custom-token");
}

async function verifyNodeProcessBoundaryStillMerges() {
  const projectRoot = await createProject("node-boundary");
  await writeSource(projectRoot, "src/env.ts", "export const value = process.env.TEST_VALUE;\n");
  await writeSource(projectRoot, "src/other.ts", "export const value = process.env.OTHER_VALUE;\n");

  const result = await codeDiscipline(presetOptions(projectRoot, {
        onlyRules: ["banned-patterns"],
        presets: {
          use: ["trebired"],
          nodeProcessBoundary: {
            envBoundaryFiles: ["src/env.ts"],
          },
        },
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => violation.filePath), ["src/other.ts"]);
  assert.equal(result.violations[0].details.pattern, "process.env");
}

async function verifyUnknownPresetFailsClearly() {
  const projectRoot = await createProject("unknown");
  await writeSource(projectRoot, "src/main.ts", "export const value = 1;\n");

  await assert.rejects(
    () => codeDiscipline({
        projectRoot,
        mode: "check",
        presets: {
          use: ["unknown"],
        },
    }),
    /Unknown code discipline preset: unknown/,
  );
}

async function verifyCliUsesPresetLoggingConfig() {
  const projectRoot = await createProject("cli-logging");
  await writeConfig(projectRoot, [
      "export default {",
      "  presets: { use: [\"trebired\"] },",
      "  ignore: { use_gitignore: false },",
      "  rules: { maxFileLines: { severity: \"warning\" } },",
      "};",
      "",
    ].join("\n"));
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const output = [];
  const result = await runCli(["check", "max-file-lines"], {
      cwd: projectRoot,
      stderr: (text) => output.push(text),
      stdout: (text) => output.push(text),
  });
  const rendered = output.join("");

  assert.equal(result.exitCode, 0);
  assert.match(rendered, /No discipline violations found\./);
  assert.doesNotMatch(rendered, /max-file-lines src\/large\.ts/);
  assert.doesNotMatch(rendered, /discipline warning/);
}

await verifyNamedPresetEnablesStrictRules();
await verifyRepoConfigOverridesPresetScalars();
await verifyBannedPatternsMergeDuplicateAllowlists();
await verifyNodeProcessBoundaryStillMerges();
await verifyUnknownPresetFailsClearly();
await verifyCliUsesPresetLoggingConfig();

console.log("code discipline presets verification passed");
