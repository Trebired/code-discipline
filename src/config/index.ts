import path from "node:path";
import { pathToFileURL } from "node:url";

import type { CodeDisciplineConfig } from "../checks/types.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import { pathExists } from "../shared/utils.js";

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

export { defineCodeDisciplineConfig, loadCodeDisciplineConfigModule };
