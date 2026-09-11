import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { imports } from "#co5e63fhc1wb";
import { createLog } from "@package/logger";

const log = createLog({ console: true, save: false });

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

  log.info("example.dummy", "imports result", {
      result,
      tsconfig: fs.readFileSync(path.join(projectRoot, "tsconfig.json"), "utf8"),
      app: fs.readFileSync(path.join(projectRoot, "src/feature/app.ts"), "utf8"),
  });
  log.info("example.dummy", `demo project: ${projectRoot}`);
}

run().catch ((error) => {
    log.error("example.dummy", error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
});
