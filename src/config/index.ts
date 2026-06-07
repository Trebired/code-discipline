import path from "node:path";
import { pathToFileURL } from "node:url";

import type { CodeDisciplineConfig } from "../checks/types.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import { pathExists } from "../shared/utils.js";

const DEFAULT_CONFIG_FILENAMES = [
  "discipline.config.mjs",
  "discipline.config.js",
  "discipline.config.cjs",
  "code-discipline.config.mjs",
  "code-discipline.config.js",
  "code-discipline.config.cjs",
];

type LoadedCodeDisciplineConfig = {
  config: CodeDisciplineConfig;
  configPath: string;
};

function defineCodeDisciplineConfig(config: CodeDisciplineConfig): CodeDisciplineConfig {
  return config;
}

async function loadCodeDisciplineConfigModule(projectRoot: string, configPath: string): Promise<LoadedCodeDisciplineConfig> {
  const resolvedPath = path.resolve(projectRoot, configPath);

  if (!await pathExists(resolvedPath)) {
    throw new InvalidCodeDisciplineConfigError("Config module was not found", {
      filePath: resolvedPath,
    });
  }

  const imported = await import(pathToFileURL(resolvedPath).href);
  const config = imported.default as unknown;

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

export { DEFAULT_CONFIG_FILENAMES, defineCodeDisciplineConfig, findCodeDisciplineConfigModule, loadCodeDisciplineConfigModule, loadResolvedCodeDisciplineConfig };
