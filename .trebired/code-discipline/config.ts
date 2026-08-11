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
            "src/config/normalize/presets.ts",
            "scripts/verify/language/support.mjs",
            "scripts/verify/presets.mjs",
          ],
        },
      ],
    },
    maxFileLines: {
      excludeDirs: [
        { type: "file", pattern: "native/code-discipline-native/src/parts/comment/ranges.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/formatter/spacing.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/formatter/tests.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/function/lines.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/tests.rs" },
      ],
    },
    maxFunctionLines: {
      excludeDirs: [
        { type: "file", pattern: "native/code-discipline-native/src/parts/comment/ranges.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/comment/ranges/csharp.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/common_violations.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/formatter/spacing.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/formatter/statements.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/formatter/tokens.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/formatter/wrapping/strings.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/function/lines.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/source_scan.rs" },
        { type: "file", pattern: "native/code-discipline-native/src/parts/structure.rs" },
      ],
    },
  },
});
