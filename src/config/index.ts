import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

import type { CodeDisciplineConfig } from "#uqbg4indzud7";
import { applyTextReplacements, collectModuleSpecifiers } from "#27pccnhol1ci";
import { resolveFileCandidate } from "#ay5rr8vjr5fh";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { pathExists } from "#ntve5i5a0mol";
import {
  defineCodeDisciplinePreset,
  resolveCodeDisciplinePresetConfig,
} from "./normalize/presets.js";

const DEFAULT_CONFIG_FILENAMES = [".trebired/code-discipline/config.ts"];

const NODE_TRANSPILE_EXTENSIONS = new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".mts",
    ".ts",
    ".tsx",
]);

const CONFIG_RESOLUTION_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".cts",
  ".cjs",
];

type LoadedCodeDisciplineConfig = {
  config: CodeDisciplineConfig;
  configPath: string;
};

function defineCodeDisciplineConfig(config: CodeDisciplineConfig): CodeDisciplineConfig {
  return config;
}

function shouldCompileConfigModule(filePath: string): boolean {
  return NODE_TRANSPILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function createNativeImportUrl(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const url = pathToFileURL(filePath);
  url.searchParams.set("mtime", String(Math.floor(stat.mtimeMs)));
  return url.href;
}

async function resolveLocalConfigImport(
  importerPath: string,
  specifier: string,
): Promise<string|null> {
  if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) {
    return null;
  }

  const basePath = path.isAbsolute(specifier)
  ? path.resolve(specifier)
  : path.resolve(path.dirname(importerPath), specifier);

  return resolveFileCandidate(basePath, CONFIG_RESOLUTION_EXTENSIONS);
}

type NodeConfigCompileState = {
  cacheDir: string;
  urls: Map<string, string>;
  pending: Array<Promise<void>>;
};

function createCompiledConfigFilename(resolvedPath: string, mtimeMs: number): string {
  const digest = crypto.createHash("sha256")
  .update(`${resolvedPath}:${Math.floor(mtimeMs)}`)
  .digest("hex")
  .slice(0, 16);
  const basename = path.basename(resolvedPath).replace(/[^\w.-]/gu, "_");
  return `${basename}.${digest}.mjs`;
}

async function transpileNodeConfigModule(
  resolvedPath: string,
  targetPath: string,
  state: NodeConfigCompileState,
): Promise<void> {
  const sourceText = await fs.readFile(resolvedPath, "utf8");
  const transpiled = ts.transpileModule(sourceText, {
      fileName: resolvedPath,
      compilerOptions: {
        allowJs: true,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: false,
      },
  });

  const replacements = [];

  for (const occurrence of collectModuleSpecifiers(transpiled.outputText, resolvedPath)) {
    const localImportPath = await resolveLocalConfigImport(resolvedPath, occurrence.specifier);
    if (!localImportPath) continue;

    const extension = path.extname(localImportPath).toLowerCase();
    const importUrl = shouldCompileConfigModule(localImportPath) && extension !== ".cjs"
    ? await compileNodeConfigModuleToUrl(localImportPath, state)
    : await createNativeImportUrl(localImportPath);

    replacements.push({
        start: occurrence.start,
        end: occurrence.end,
        value: importUrl,
    });
  }

  const rewritten = applyTextReplacements(transpiled.outputText, replacements).text;
  await fs.writeFile(targetPath, rewritten, "utf8");
}

async function compileNodeConfigModuleToUrl(
  filePath: string,
  state: NodeConfigCompileState,
): Promise<string> {
  const resolvedPath = await fs.realpath(filePath);
  const known = state.urls.get(resolvedPath);
  if (known) return known;

  const stat = await fs.stat(resolvedPath);
  const targetPath = path.join(state.cacheDir, createCompiledConfigFilename(resolvedPath, stat.mtimeMs));
  const targetUrl = pathToFileURL(targetPath).href;

  state.urls.set(resolvedPath, targetUrl);
  state.pending.push(transpileNodeConfigModule(resolvedPath, targetPath, state));

  return targetUrl;
}

function validateLoadedConfig(
  config: unknown,
  resolvedPath: string,
): LoadedCodeDisciplineConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new InvalidCodeDisciplineConfigError("Config module must default-export a config object", {
        filePath: resolvedPath,
    });
  }

  return {
    config: config as CodeDisciplineConfig,
    configPath: resolvedPath,
  };
}

async function importCodeDisciplineConfigModule(projectRoot: string, resolvedPath: string): Promise<unknown> {
  if (!shouldCompileConfigModule(resolvedPath)) {
    const imported = await import(await createNativeImportUrl(resolvedPath));
    return imported.default;
  }

  const cacheDir = path.join(projectRoot, "node_modules", ".cache", "code-discipline");
  await fs.mkdir(cacheDir, { recursive: true });

  const state: NodeConfigCompileState = {
    cacheDir,
    urls: new Map(),
    pending: [],
  };
  const moduleUrl = await compileNodeConfigModuleToUrl(resolvedPath, state);

  while (state.pending.length > 0) {
    await Promise.all(state.pending.splice(0));
  }

  const imported = await import(moduleUrl);
  return imported.default;
}

async function loadCodeDisciplineConfigModule(projectRoot: string, configPath: string): Promise<LoadedCodeDisciplineConfig> {
  const resolvedPath = path.resolve(projectRoot, configPath);

  if (!await pathExists(resolvedPath)) {
    throw new InvalidCodeDisciplineConfigError("Config module was not found", {
        filePath: resolvedPath,
    });
  }

  return validateLoadedConfig(
    await importCodeDisciplineConfigModule(projectRoot, resolvedPath),
    resolvedPath,
  );
}

async function findCodeDisciplineConfigModule(projectRoot: string): Promise<string|null> {
  for (const filename of DEFAULT_CONFIG_FILENAMES) {
    const resolvedPath = path.resolve(projectRoot, filename);
    if (await pathExists(resolvedPath)) {
      return resolvedPath;
    }
  }

  return null;
}

async function loadResolvedCodeDisciplineConfig(projectRoot: string, configPath?: string): Promise<LoadedCodeDisciplineConfig> {
  const resolvedPath = configPath
  ? path.resolve(projectRoot, configPath)
  : await findCodeDisciplineConfigModule(projectRoot);

  if (!resolvedPath) {
    throw new InvalidCodeDisciplineConfigError("No code-discipline config module was found", {
        tried: DEFAULT_CONFIG_FILENAMES,
    });
  }

  const loaded = await loadCodeDisciplineConfigModule(projectRoot, resolvedPath);
  return {
    ...loaded,
    config: await resolveCodeDisciplinePresetConfig(loaded.config, { projectRoot }),
  };
}

export {
  DEFAULT_CONFIG_FILENAMES,
  defineCodeDisciplinePreset,
  defineCodeDisciplineConfig,
  findCodeDisciplineConfigModule,
  loadCodeDisciplineConfigModule,
  loadResolvedCodeDisciplineConfig,
};
