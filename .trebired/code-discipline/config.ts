import { defineConfig } from "@trebired/code-discipline";

export default defineConfig({
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
        {
          value: "trebired",
          allowedFiles: [
            "package.json",
            "src/checks/types.ts",
            "scripts/verify/language/support.mjs",
            "scripts/verify/presets.mjs",
          ],
        },
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
