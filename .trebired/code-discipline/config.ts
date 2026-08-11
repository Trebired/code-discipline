import type { CodeDisciplineConfig } from "@trebired/code-discipline";

function defineCodeDisciplineConfig(config: CodeDisciplineConfig): CodeDisciplineConfig {
  return config;
}

export default defineCodeDisciplineConfig({
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
});
