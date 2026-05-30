import fs from "node:fs/promises";
import path from "node:path";

import type { CodeDisciplineConfig } from "../checks/types.js";
import { CODE_DISCIPLINE_CONFIG_FILE } from "../shared/constants.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import { pathExists } from "../shared/utils.js";

type LoadedCodeDisciplineConfig = {
  config: CodeDisciplineConfig;
  configPath: string | null;
};

function defineCodeDisciplineConfig(config: CodeDisciplineConfig): CodeDisciplineConfig {
  return config;
}

function parseCodeDisciplineConfig(text: string, filePath: string): CodeDisciplineConfig {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidCodeDisciplineConfigError("Config file must contain a JSON object", { filePath });
    }

    return parsed as CodeDisciplineConfig;
  } catch (error) {
    if (error instanceof InvalidCodeDisciplineConfigError) {
      throw error;
    }

    throw new InvalidCodeDisciplineConfigError("Failed to parse code-discipline config", {
      filePath,
      cause: error instanceof Error ? error.message : error,
    });
  }
}

async function loadCodeDisciplineConfig(projectRoot: string, configPath?: string): Promise<LoadedCodeDisciplineConfig> {
  const resolvedPath = configPath
    ? path.resolve(projectRoot, configPath)
    : path.join(projectRoot, CODE_DISCIPLINE_CONFIG_FILE);

  if (!await pathExists(resolvedPath)) {
    if (configPath) {
      throw new InvalidCodeDisciplineConfigError("Config file was not found", {
        filePath: resolvedPath,
      });
    }

    return {
      config: {},
      configPath: null,
    };
  }

  const text = await fs.readFile(resolvedPath, "utf8");

  return {
    config: parseCodeDisciplineConfig(text, resolvedPath),
    configPath: resolvedPath,
  };
}

export { defineCodeDisciplineConfig, loadCodeDisciplineConfig };
