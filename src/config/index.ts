import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

import type { CodeDisciplineConfig } from "../checks/types.js";
import { applyTextReplacements, collectModuleSpecifiers } from "../imports/module-specifiers.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import { isFile, pathExists } from "../shared/utils.js";

const DEFAULT_CONFIG_FILENAMES = [
  "tb.code-discipline.ts",
  "tb.code-discipline.mts",
  "tb.code-discipline.mjs",
  "tb.code-discipline.js",
  "tb.code-discipline.cts",
  "tb.code-discipline.cjs",
];

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

function isBunRuntime(): boolean {
  return typeof Bun !== "undefined";
}

function shouldTranspileConfigForNode(filePath: string): boolean {
  return !isBunRuntime() && NODE_TRANSPILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
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
): Promise<string | null> {
  if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) {
    return null;
  }

  const basePath = path.isAbsolute(specifier)
    ? path.resolve(specifier)
    : path.resolve(path.dirname(importerPath), specifier);
  const candidates = [basePath];

  if (!path.extname(basePath)) {
    for (const extension of CONFIG_RESOLUTION_EXTENSIONS) {
      candidates.push(`${basePath}${extension}`);
    }

    for (const extension of CONFIG_RESOLUTION_EXTENSIONS) {
      candidates.push(path.join(basePath, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function compileNodeConfigModuleToUrl(
  filePath: string,
  cache: Map<string, Promise<string>>,
): Promise<string> {
  const resolvedPath = await fs.realpath(filePath);
  const cached = cache.get(resolvedPath);
  if (cached) return cached;

  const pending = (async () => {
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
      const importUrl = shouldTranspileConfigForNode(localImportPath) && extension !== ".cjs"
        ? await compileNodeConfigModuleToUrl(localImportPath, cache)
        : await createNativeImportUrl(localImportPath);

      replacements.push({
        start: occurrence.start,
        end: occurrence.end,
        value: importUrl,
      });
    }

    const rewritten = applyTextReplacements(transpiled.outputText, replacements).text;
    return `data:text/javascript;base64,${Buffer.from(rewritten, "utf8").toString("base64")}`;
  })();

  cache.set(resolvedPath, pending);
  return pending;
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

async function importCodeDisciplineConfigModule(resolvedPath: string): Promise<unknown> {
  if (!shouldTranspileConfigForNode(resolvedPath)) {
    const imported = await import(await createNativeImportUrl(resolvedPath));
    return imported.default;
  }

  const cache = new Map<string, Promise<string>>();
  const moduleUrl = await compileNodeConfigModuleToUrl(resolvedPath, cache);
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
    await importCodeDisciplineConfigModule(resolvedPath),
    resolvedPath,
  );
}

async function findCodeDisciplineConfigModule(projectRoot: string): Promise<string | null> {
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

  return loadCodeDisciplineConfigModule(projectRoot, resolvedPath);
}

export {
  DEFAULT_CONFIG_FILENAMES,
  defineCodeDisciplineConfig,
  findCodeDisciplineConfigModule,
  loadCodeDisciplineConfigModule,
  loadResolvedCodeDisciplineConfig,
};
