import type { CodeDisciplineConfig } from "@trebired/code-discipline";

function defineCodeDisciplineConfig(config: CodeDisciplineConfig): CodeDisciplineConfig {
  return config;
}

export default defineCodeDisciplineConfig({
  presets: {
    use: ["trebired"],
  },
  rules: {
    bannedPatterns: {
      patterns: [
        {
          value: "trebired",
          allowedFiles: [
            "src/checks/types.ts",
            "src/config/presets/index.ts",
            "src/config/presets/trebired.ts",
            "scripts/verify/language/support.mjs",
            "scripts/verify/presets.mjs",
          ],
        },
      ],
    },
  },
});
