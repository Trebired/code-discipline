import { expect, test } from "bun:test";

import { checkCodeDiscipline, fixCodeDiscipline } from "#co5e63fhc1wb";
import type { SourceProgressEvent } from "#co5e63fhc1wb";
import { fileExists, tempProject, writeFile } from "./helpers.js";

test("emits chunked progress while checking configured rules", async () => {
  const projectRoot = tempProject();
  const progress: SourceProgressEvent[] = [];

  writeFile(projectRoot, "src/app.ts", "const password = 'secret';\n");
  writeFile(projectRoot, "src/blocked.spec.ts", "export const blocked = true;\n");

  await checkCodeDiscipline({
    projectRoot,
    progressObserver: (event) => progress.push(event),
    rules: {
      bannedFiles: {
        patterns: [{ glob: "**/*.spec.ts" }],
      },
      bannedPatterns: {
        patterns: ["secret"],
      },
      maxFileLines: {
        max: 1,
      },
    },
  });

  expect(progress).toEqual(expect.arrayContaining([
    expect.objectContaining({ completedItems: 2, phase: "rule-chunk", rule: "banned-files", totalItems: 2, violationCount: 1 }),
    expect.objectContaining({ phase: "rule-completed", rule: "banned-files", violationCount: 1 }),
    expect.objectContaining({ completedItems: 2, phase: "rule-chunk", rule: "banned-patterns", totalItems: 2, violationCount: 1 }),
    expect.objectContaining({ phase: "rule-completed", rule: "banned-patterns", violationCount: 1 }),
    expect.objectContaining({ completedItems: 2, phase: "rule-chunk", rule: "max-file-lines", totalItems: 2 }),
    expect.objectContaining({ phase: "rule-completed", rule: "max-file-lines" }),
  ]));
});

test("emits chunked progress while fixing configured rules", async () => {
  const projectRoot = tempProject();
  const progress: SourceProgressEvent[] = [];

  writeFile(projectRoot, "src/one.spec.ts", "export const one = true;\n");
  writeFile(projectRoot, "src/two.spec.ts", "export const two = true;\n");

  const result = await fixCodeDiscipline({
    projectRoot,
    onlyRules: ["banned-files"],
    progressObserver: (event) => progress.push(event),
    rules: {
      bannedFiles: {
        patterns: [{ glob: "**/*.spec.ts" }],
      },
    },
  });

  expect(result.deleted_files).toBe(2);
  expect(fileExists(projectRoot, "src/one.spec.ts")).toBe(false);
  expect(fileExists(projectRoot, "src/two.spec.ts")).toBe(false);
  expect(progress).toEqual(expect.arrayContaining([
    expect.objectContaining({ completedItems: 2, phase: "rule-chunk", rule: "banned-files", stage: "scan", totalItems: 2, violationCount: 2 }),
    expect.objectContaining({ completedItems: 2, phase: "rule-chunk", rule: "banned-files", stage: "fix", totalItems: 2, deletedFiles: 2 }),
    expect.objectContaining({ phase: "rule-completed", rule: "banned-files", stage: "fix", deletedFiles: 2 }),
  ]));
});
