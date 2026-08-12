import path from "node:path";

import type { CodeDisciplineConfig } from "#uqbg4indzud7";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { pathExists } from "#ntve5i5a0mol";
import { importConfigModule } from "./module-loader.js";
import { resolvePresetConfig } from "./normalize/presets.js";

const DEFAULT_CONFIG_FILENAMES = [".trebired/code-discipline/config.ts"];

type LoadedConfig = {
  config: CodeDisciplineConfig;
  configPath: string;
};

function defineConfig(config: CodeDisciplineConfig): CodeDisciplineConfig {
  return config;
}

function validateLoadedConfig(
  config: unknown,
  resolvedPath: string,
): LoadedConfig {
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

async function loadConfigModule(projectRoot: string, configPath: string): Promise<LoadedConfig> {
  const resolvedPath = path.resolve(projectRoot, configPath);

  if (!await pathExists(resolvedPath)) {
    throw new InvalidCodeDisciplineConfigError("Config module was not found", {
        filePath: resolvedPath,
    });
  }

  return validateLoadedConfig(
    await importConfigModule(projectRoot, resolvedPath),
    resolvedPath,
  );
}

async function findConfigModule(projectRoot: string): Promise<string|null> {
  for (const filename of DEFAULT_CONFIG_FILENAMES) {
    const resolvedPath = path.resolve(projectRoot, filename);
    if (await pathExists(resolvedPath)) {
      return resolvedPath;
    }
  }

  return null;
}

async function loadResolvedConfig(projectRoot: string, configPath?: string): Promise<LoadedConfig> {
  const resolvedPath = configPath
  ? path.resolve(projectRoot, configPath)
  : await findConfigModule(projectRoot);

  if (!resolvedPath) {
    throw new InvalidCodeDisciplineConfigError("No code-discipline config module was found", {
        tried: DEFAULT_CONFIG_FILENAMES,
    });
  }

  const loaded = await loadConfigModule(projectRoot, resolvedPath);
  return {
    ...loaded,
    config: await resolvePresetConfig(loaded.config, { projectRoot }),
  };
}

export {
  DEFAULT_CONFIG_FILENAMES,
  defineConfig,
  findConfigModule,
  loadConfigModule,
  loadResolvedConfig,
};
