import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const HELP = "\"Add, edit and remove them on the settings screen (open Settings, then Servers), and save.\"";
const JSON_TEXT = "{\"parts\":[{\"apply\":[{\"model\":\"block/fixture\",\"weight\":2},{\"model\":\"block/fixture\",\"y\":90}]},"
+"{\"when\":{\"open\":\"true\"},\"apply\":{\"model\":\"block/fixture\",\"y\":180,\"uvlock\":true}}]}";

const SOURCE = [
  "fn commands() -> Vec<Command> {",
  "    vec![",
  "        command!(\"servers\", Session, \"servers\", \"the settings screen's server list: name and address\",",
  `            ${HELP}, ["ctl servers"], &[], remote: true, local: false),`,
  "    ]",
  "}",
  "",
  "fn write_state(root: &std::path::Path, block: &str) -> Result<()> {",
  "    fs::write(",
  "        root.join(format!(\"states/{block}.json\")),",
  `        r#"${JSON_TEXT}"#,`,
  "    )?;",
  "    Ok(())",
  "}",
  "",
].join("\n");

function rawPieces(text) {
  return [...text.matchAll(/r#"(.*?)"#/gu)].map((match) => match[1]);
}

async function verifyOneLineLiteralsThroughFix(run) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cd-formatter-literals-"));
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, "src", "lib.rs"), SOURCE, "utf8");
  await run({
      projectRoot,
      ignore: { use_gitignore: false },
      mode: "fix",
      onlyRules: ["format", "max-characters-per-line"],
      rules: { formatting: {}, maxCharactersPerLine: { max: 150 } },
  });
  const formatted = await fs.readFile(path.join(projectRoot, "src", "lib.rs"), "utf8");
  assert.ok(formatted.includes(HELP), `help text was split as code:\n${formatted}`);
  assert.equal(rawPieces(formatted).join(""), JSON_TEXT, `raw JSON value changed:\n${formatted}`);
  await fs.rm(projectRoot, { force: true, recursive: true });
}

export { verifyOneLineLiteralsThroughFix };
