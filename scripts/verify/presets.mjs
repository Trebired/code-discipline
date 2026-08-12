import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
const packageVersion = packageJson.version;
const { run } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);
const { runCli } = await import(pathToFileURL(path.join(repoRoot, "dist/cli/run.js")).href);

async function createProject(name) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `cd-presets-${name}-`));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "tsconfig.json"), "{\n  \"compilerOptions\": {\n    \"paths\": {}\n  }\n}\n", "utf8");
  await fs.writeFile(path.join(root, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  return root;
}

async function writeSource(root, relativePath, text) {
  const sourceDirectory = path.join(root, path.dirname(relativePath));
  await fs.mkdir(sourceDirectory, { recursive: true });
  await fs.writeFile(path.join(sourceDirectory, path.basename(relativePath)), text, "utf8");
}

async function writeConfig(root, text) {
  const configPath = path.join(root, ".trebired/code-discipline/config.ts");
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, text, "utf8");
  return configPath;
}

async function writePresetPackage(root, packageNameInput, preset, packageJsonExtra = {}) {
  const packageRoot = path.join(root, "node_modules", packageNameInput);
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify({
    name: packageNameInput,
    type: "module",
    main: "index.mjs",
    ...packageJsonExtra,
    }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(packageRoot, "index.mjs"), [
      "export default ",
      JSON.stringify(preset, null, 2),
      ";\n",
    ].join(""), "utf8");
}

function strictPresetConfig(extra = {}) {
  return {
    forVersion: packageVersion,
    logging: { warnings: false },
    ignore: { use_gitignore: false },
    rules: {
      maxFileLines: { max: 350 },
      bannedPatterns: {
        patterns: [{ value: "preset-token", allowedFiles: ["src/allowed.ts"] }],
      },
    },
    ...extra,
  };
}

function presetOptions(projectRoot, extra = {}) {
  return {
    projectRoot,
    mode: "check",
    presets: { use: ["@fixture/strict-preset"] },
    ...extra,
  };
}

async function verifyExternalPresetEnablesStrictRules() {
  const projectRoot = await createProject("strict");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", strictPresetConfig());
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const result = await run(presetOptions(projectRoot, {
        onlyRules: ["max-file-lines"],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].rule, "max-file-lines");
  assert.equal(result.violations[0].filePath, "src/large.ts");
}

async function verifyImportOnlyPresetPackageLoads() {
  const projectRoot = await createProject("import-only");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", strictPresetConfig(), {
      exports: {
        ".": {
          import: "./index.mjs",
          types: "./index.d.ts",
        },
      },
  });
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const result = await run(presetOptions(projectRoot, {
        onlyRules: ["max-file-lines"],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].rule, "max-file-lines");
}

async function verifyRepoConfigOverridesPresetScalars() {
  const projectRoot = await createProject("override");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", strictPresetConfig());
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const result = await run(presetOptions(projectRoot, {
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

async function verifyMultiplePresetsMergeLeftToRight() {
  const projectRoot = await createProject("multiple");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", strictPresetConfig({
        rules: {
          maxFileLines: { max: 500 },
          bannedPatterns: { patterns: [{ value: "preset-token" }] },
        },
  }));
  await writePresetPackage(projectRoot, "@fixture/second-preset", strictPresetConfig({
        rules: {
          maxFileLines: { max: 350 },
          bannedPatterns: { patterns: [{ value: "second-token" }] },
        },
  }));
  await writeSource(projectRoot, "src/a.ts", "export const a = \"preset-token\";\n");
  await writeSource(projectRoot, "src/b.ts", "export const b = \"second-token\";\n");

  const result = await run({
      projectRoot,
      mode: "check",
      onlyRules: ["banned-patterns"],
      presets: { use: ["@fixture/strict-preset", "@fixture/second-preset"] },
  });

  assert.deepEqual(result.violations.map((violation) => violation.filePath).sort(), ["src/a.ts", "src/b.ts"]);
}

async function verifyBannedPatternsMergeDuplicateAllowlists() {
  const projectRoot = await createProject("patterns");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", strictPresetConfig());
  await writeSource(projectRoot, "src/allowed.ts", "export const packageName = \"preset-token\";\n");
  await writeSource(projectRoot, "src/custom.ts", "export const packageName = \"custom-token\";\n");

  const result = await run(presetOptions(projectRoot, {
        onlyRules: ["banned-patterns"],
        rules: {
          bannedPatterns: {
            patterns: [
              { value: "preset-token", allowedFiles: ["src/custom.ts"] },
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
  await writePresetPackage(projectRoot, "@fixture/strict-preset", strictPresetConfig());
  await writeSource(projectRoot, "src/env.ts", "export const value = process.env.TEST_VALUE;\n");
  await writeSource(projectRoot, "src/other.ts", "export const value = process.env.OTHER_VALUE;\n");

  const result = await run(presetOptions(projectRoot, {
        onlyRules: ["banned-patterns"],
        helpers: {
          nodeProcessBoundary: {
            envBoundaryFiles: ["src/env.ts"],
          },
        },
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => violation.filePath), ["src/other.ts"]);
  assert.equal(result.violations[0].details.pattern, "process.env");
}

async function verifyOldBuiltInPresetFailsClearly() {
  const projectRoot = await createProject("old-builtin");
  await writeSource(projectRoot, "src/main.ts", "export const value = 1;\n");

  await assert.rejects(
    () => run({
        projectRoot,
        mode: "check",
        presets: { use: ["trebired"] },
    }),
    /Code discipline preset package was not found: trebired/,
  );
}

async function verifyMissingVersionFailsClearly() {
  const projectRoot = await createProject("missing-version");
  const { forVersion, ...config } = strictPresetConfig();
  await writePresetPackage(projectRoot, "@fixture/strict-preset", config);

  await assert.rejects(
    () => run(presetOptions(projectRoot)),
    /must declare forVersion/,
  );
}

async function verifyVersionMismatchFailsClearly() {
  const projectRoot = await createProject("version-mismatch");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", {
      ...strictPresetConfig(),
      forVersion: "0.0.0",
  });

  await assert.rejects(
    () => run(presetOptions(projectRoot)),
    /targets Code Discipline 0\.0\.0/,
  );
}

async function verifyPresetPatchVersionCanDrift() {
  const projectRoot = await createProject("patch-compatible");
  const [major, minor, patch = "0"] = packageVersion.split(".");
  const compatiblePatch = patch === "0" ? "1" : "0";
  await writePresetPackage(projectRoot, "@fixture/strict-preset", {
      ...strictPresetConfig(),
      forVersion: `${major}.${minor}.${compatiblePatch}`,
  });
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const result = await run(presetOptions(projectRoot, {
        onlyRules: ["max-file-lines"],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].rule, "max-file-lines");
}

async function verifyWrappedPresetFailsClearly() {
  const projectRoot = await createProject("wrapped");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", {
      codeDisciplineVersion: packageVersion,
      config: strictPresetConfig(),
  });

  await assert.rejects(
    () => run(presetOptions(projectRoot)),
    /default-export the config object directly/,
  );
}

async function verifyNestedPresetFailsClearly() {
  const projectRoot = await createProject("nested");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", strictPresetConfig({
        presets: { use: ["@fixture/other"] },
  }));

  await assert.rejects(
    () => run(presetOptions(projectRoot)),
    /cannot declare nested presets/,
  );
}

async function verifyCliUsesPresetLoggingConfig() {
  const projectRoot = await createProject("cli-logging");
  await writePresetPackage(projectRoot, "@fixture/strict-preset", strictPresetConfig());
  await writeConfig(projectRoot, [
      "export default {",
      "  presets: { use: [\"@fixture/strict-preset\"] },",
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

await verifyExternalPresetEnablesStrictRules();
await verifyImportOnlyPresetPackageLoads();
await verifyRepoConfigOverridesPresetScalars();
await verifyMultiplePresetsMergeLeftToRight();
await verifyBannedPatternsMergeDuplicateAllowlists();
await verifyNodeProcessBoundaryStillMerges();
await verifyOldBuiltInPresetFailsClearly();
await verifyMissingVersionFailsClearly();
await verifyVersionMismatchFailsClearly();
await verifyPresetPatchVersionCanDrift();
await verifyWrappedPresetFailsClearly();
await verifyNestedPresetFailsClearly();
await verifyCliUsesPresetLoggingConfig();

console.log("code discipline presets verification passed");
