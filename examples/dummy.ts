import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { syncImports } from "../src/index.js";

function writeFile(rootDir: string, relativePath: string, contents: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

async function run(): Promise<void> {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code-discipline-demo-"));

  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(
    projectRoot,
    "src/feature/app.ts",
    [
      'import { local } from "./local";',
      'import { util } from "../shared/util";',
      "export { local, util };",
      "",
    ].join("\n"),
  );
  writeFile(projectRoot, "src/feature/local.ts", "export const local = true;\n");
  writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

  const result = await syncImports({
    projectRoot,
    alias: {
      strategy: "relative-path-slug",
    },
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${fs.readFileSync(path.join(projectRoot, "tsconfig.json"), "utf8")}\n`);
  process.stdout.write(`${fs.readFileSync(path.join(projectRoot, "src/feature/app.ts"), "utf8")}\n`);
  process.stdout.write(`demo project: ${projectRoot}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
