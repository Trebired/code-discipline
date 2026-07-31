import type { CodeDisciplineConfig } from "@trebired/code-discipline";

function defineCodeDisciplineConfig(config: CodeDisciplineConfig): CodeDisciplineConfig {
  return config;
}

export default defineCodeDisciplineConfig({
  ignore: {
    entries: [],
    use_gitignore: true,
  },
  rules: {
    bannedFiles: {
      patterns: [
        { glob: "**/*.spec.ts" },
        { glob: "**/*.spec.tsx" },
      ],
    },
    bannedPatterns: {
      patterns: [
        { value: "trebired", allowedFiles: ["package.json", ".code-discipline/config.ts"] },
      ],
    },
    maxFileLines: {
      max: 350,
    },
    maxFunctionLines: {
      max: 50,
    },
    folderizeCompoundFiles: {},
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
