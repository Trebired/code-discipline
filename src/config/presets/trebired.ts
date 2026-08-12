import type { CodeDisciplineConfig, CodeDisciplinePresetName } from "#uqbg4indzud7";

const CODE_DISCIPLINE_PRESET_NAME: CodeDisciplinePresetName = "trebired";

const CODE_DISCIPLINE_PRESET_CONFIG: CodeDisciplineConfig = {
  logging: {
    warnings: false,
  },
  ignore: {
    entries: [],
    use_gitignore: true,
  },
  rules: {
    formatting: {},
    bannedFiles: {
      patterns: [
        { glob: "**/*.spec.ts" },
        { glob: "**/*.spec.tsx" },
      ],
    },
    bannedPatterns: {
      patterns: [
        { value: "trebired", allowedFiles: ["package.json"] },
      ],
    },
    minDeclarationName: {},
    maxCharactersPerLine: {},
    structuralBlankLines: {},
    minFileLines: {},
    maxFileLines: {
      max: 350,
    },
    maxFunctionLines: {
      max: 50,
    },
    redundantPathSegments: {},
    removeComments: {},
    imports: {
      alias: {
        strategy: "random",
      },
      allowRelative: ["./"],
      output: {
        type: "alias-map",
      },
      runtime: {
        normalize: "relative-dot-prefix",
        restoreAfterRun: false,
      },
      removeDeadImports: true,
    },
    dry: {},
  },
};

export { CODE_DISCIPLINE_PRESET_CONFIG, CODE_DISCIPLINE_PRESET_NAME };
