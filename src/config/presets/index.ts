import type { CodeDisciplineConfig, CodeDisciplinePresetName } from "#uqbg4indzud7";
import { CODE_DISCIPLINE_PRESET_CONFIG, CODE_DISCIPLINE_PRESET_NAME } from "./trebired.js";

const CODE_DISCIPLINE_PRESET_CONFIGS = {
  [CODE_DISCIPLINE_PRESET_NAME]: CODE_DISCIPLINE_PRESET_CONFIG,
} satisfies Record<CodeDisciplinePresetName, CodeDisciplineConfig>;

function isCodeDisciplinePresetName(value: unknown): value is CodeDisciplinePresetName {
  return typeof value === "string"
  &&Object.prototype.hasOwnProperty.call(CODE_DISCIPLINE_PRESET_CONFIGS, value);
}

function getCodeDisciplinePresetConfig(name: CodeDisciplinePresetName): CodeDisciplineConfig {
  return CODE_DISCIPLINE_PRESET_CONFIGS[name];
}

export {
  CODE_DISCIPLINE_PRESET_CONFIGS,
  getCodeDisciplinePresetConfig,
  isCodeDisciplinePresetName,
};
