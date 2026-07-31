import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { imports } from "#co5e63fhc1wb";

function writeDemoFile(rootDir: string, relativePath: string, contents: string): void {
  const destination = path.resolve(rootDir, relativePath);
  const parentDirectory = path.dirname(destination);
  fs.mkdirSync(parentDirectory, { recursive: true });
  fs.writeFileSync(destination, contents, "utf8");
}

async function run(): Promise<void> {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code-discipline-demo-"));

  writeDemoFile(projectRoot, "tsconfig.json", "{}\n");
  writeDemoFile(
    projectRoot,
    "src/feature/app.ts",
    [
      'import { local } from "./local";',
      'import { util } from "../shared/util";',
      "export { local, util };",
      "",
    ].join("\n"),
  );
  writeDemoFile(projectRoot, "src/feature/local.ts", "export const local = true;\n");
  writeDemoFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

  const result = await imports({
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
