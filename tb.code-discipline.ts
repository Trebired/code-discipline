import { defineCodeDisciplineConfig } from "./src/index.js";

export default defineCodeDisciplineConfig({
  sourceRoot: ".",
  excludeDirs: {
    gitignore: true,
  },
  rules: {
    maxFileLines: { max: 350 },
    maxFunctionLines: { max: 50 },
    folderizeCompoundFiles: {},
    dry: {
      helpers: [
        { from: "./src/shared/utils.ts", exportName: "toPosixPath" },
        { from: "./src/shared/utils.ts", exportName: "stripKnownExtension" },
        { from: "./src/shared/utils.ts", exportName: "stableSerialize" },
      ],
    },
  },
});
