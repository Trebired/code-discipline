import { defineCodeDisciplineConfig } from "../src/index.js";

export default defineCodeDisciplineConfig({
  ignore: {
    entries: [],
    use_gitignore: true,
  },
  rules: {
    maxFileLines: {
      max: 350,
      excludeDirs: [
        { type: "file", pattern: "test/specs/discipline.config.spec.ts" },
        { type: "file", pattern: "test/specs/discipline.scan.spec.ts" },
      ],
    },
    maxFunctionLines: { max: 50 },
    folderizeCompoundFiles: {},
    syncImports: {
      alias: {
        strategy: "random",
      },
      allowRelative: ["./"],
      output: {
        type: "alias-map",
      },
    },
    dry: {},
  },
});
