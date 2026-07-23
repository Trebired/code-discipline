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
      severity: "warning",
    },
  },
});
