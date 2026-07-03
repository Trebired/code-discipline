import { defineCodeDisciplineConfig } from "./src/index.js";

export default defineCodeDisciplineConfig({
  sourceRoot: ".",
  sourceExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".cjs", ".go", ".rs"],
  excludeDirs: {
    dirs: [
      ".git",
      "dist",
      "node_modules",
      "native/code-discipline-native/target",
    ],
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
