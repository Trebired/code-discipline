# Changelog

All notable changes to `@trebired/code-discipline` will be documented here.

## 3.0.0

- Added top-level `evasionGuards` checks for packed files, packed lines, packed JavaScript/TypeScript functions, and runtime code hiding through string execution.
- Added the check-only `evasion-guards` selector so opt-in anti-evasion scans can be targeted from the CLI/runtime.
- Added a TTY loading animation for long CLI check/fix/gate scans.
- Changed `remove-comments` fixes to remove comment-only lines during the same per-file rewrite.
- Added the Rust native backend with TypeScript fallback and native acceleration for source scanning, `max-file-lines`, common `max-function-lines` paths, `folderize-compound-files` checks, `remove-comments`, and `evasion-guards`.
- Fixed runtime/CLI forwarding for top-level `evasionGuards`.

## 2.3.0

- Added the package-owned `code-discipline gate -- <command> [args...]` startup wrapper so apps can refuse startup on discipline violations without importing the package into their own source code.
- Added the fixable `removeComments` / `remove-comments` rule so `check` can report comment-bearing files and `fix` can strip comments across the currently supported JavaScript, TypeScript, Go, and Rust source families.
- Extended fix summaries with removed-comment counts so comment-stripping runs are visible in CLI output and runtime results.

## 2.2.0

- Added mixed-language source-tree support so repositories can include Go and Rust files alongside JavaScript and TypeScript without breaking scan-based discipline runs.
- Added Go and Rust function-length detection to `maxFunctionLines`.
- Added additive source scanning controls so custom `sourceExtensions` can extend or replace the built-in defaults, while `excludeDirs` now uses a single `{ dirs, gitignore }` shape for extra directory excludes and optional root `.gitignore` reuse.
- Kept folderization import repair limited to move-aware relative rewrites, while leaving alias rewriting under `sync-imports`.
- Made `sync-imports` and `dry` explicitly ignore non-JS/TS module files instead of trying to parse or rewrite them.

## 2.1.1

- Removed rule-level `fix` toggles from discipline config so mutation is decided by running `code-discipline fix`.
- Added saved CLI reports through `save`.
- Changed saved report filenames to explicit timestamped `cd-report-YYYY-MM-DD-HH-mm-ss.txt`.

## 2.1.0

- Removed severity from the public rule config, violation objects, and result summaries.
- Changed discipline and sync results to report `violationCount` instead of separate `errors` and `warnings`.
- Simplified CLI output to concise violation lines and short summaries instead of JSON-style payloads.
- Reduced logger noise by dropping large violation metadata from summary events and only emitting initialization logs when logging is enabled.

## 2.0.0

- Removed the top-level `code-discipline sync` command and the runtime `sync` / `startup` modes.
- Changed the package-owned surface to `check` and `fix`, with positional rule selectors such as `code-discipline fix sync-imports`.
- Changed config auto-discovery to the new `tb.code-discipline.*` filenames and added package-owned TypeScript config loading for Node and Bun.
- Added the `dry` rule for canonical helper registration, duplicate detection, and full-removal standalone autofix.
- Moved optional `package.json#imports` syncing under `rules.syncImports.packageJsonImports`.
- Changed `fixCodeDiscipline()` from a folderization-only mutation path into a rule-ordered fix pipeline with `ruleResults`.

## 1.5.0

- Added direct config auto-discovery so the CLI can be used as `code-discipline check`, `fix`, and `sync` without mandatory wrapper scripts or `--config` flags.
- Added generic lifecycle hooks through config with `beforeRun`, `afterRun`, `beforeMode`, and `afterMode`.
- Added optional `tsconfigPaths` normalization support with package-owned pre-run transforms and optional restoration after the run.
- Added optional `runtimeImportsSync` so `package.json#imports` can be synced from `tsconfig.compilerOptions.paths` while preserving unrelated existing imports.
- Added exports for config discovery and package-owned runtime helper utilities.

## 1.4.1

- Fixed relative import resolution for TypeScript ESM-style `.js` specifiers so imports like `./x.js` can resolve to source files such as `./x.ts` during sync checks and rewrites.

## 1.4.0

- Added `codeDiscipline({ mode, ... })` as the package-owned runtime dispatcher for `check`, `fix`, `sync`, and startup-style sync usage.
- Added `createCodeDiscipline(config)` so consuming apps can bind repo config once and call `.check()`, `.fix()`, `.sync()`, or `.startup()`.
- Refactored the package CLI to use the shared runtime dispatcher instead of maintaining separate command routing logic.
- Updated the README and tests around the simpler logger-style consumption path.

## 1.3.0

- Replaced rule-level `stop` with severity-based discipline results using `severity: "error" | "warning"`.
- Removed legacy `stop` and per-rule `enabled` config support; rule presence now enables the rule.
- Removed JSON config auto-discovery and changed the CLI to require an explicit `--config` module path.
- Changed `syncImports()` to return severity-aware `errors`, `warnings`, and `violations` alongside its operational mutation summary.

## 1.2.0

- Changed package logging to emit `@trebired/code-discipline initialized` on startup through the `code-discipline.initialize` group.
- Changed `syncImports()`, `checkCodeDiscipline()`, and `fixCodeDiscipline()` to emit one final aggregated report instead of spamming per-step runtime logs.
- Added buffered diagnostic summaries to final logging metadata so unresolved rewrites, tsconfig retry events, and other internal steps are preserved in one report payload.
- Renamed the public logging type surface to package-wide `CodeDiscipline...` names while keeping compatibility aliases for the older sync-import-focused type exports.

## 1.1.0

- Routed the package's default/common logger adaptation path through `@trebired/logger-adapter`.
- Kept the existing `logging.adapter(event)` callback API for event-level custom output control.

## 1.0.0

- introduced the breaking `enabled` / `stop` / `fix` rule model across the package
- removed `severity` from discipline and sync-import config
- removed suffix-based folderization and replaced it with structural folder grouping
- removed `suffixes` from `folderizeCompoundFiles`
- removed nested `syncImports.imports`
- removed `rewrite` as a sync config option in favor of `syncImports.fix`
- replaced `keepRelative` with `allowRelative`
- made `check` fully read-only
- made `sync` mutate imports and `tsconfig.json` only when `syncImports.fix` is `true`
- added explicit `fix` support for folderization moves and affected import rewrites
- added `fixCodeDiscipline()` as the structural mutation API
- added blocking-or-warning behavior through `stop` instead of severity levels
- bumped the package to `1.0.0` for the config and API cleanup

## 0.1.0

- initial public release
- added source scanning, alias generation, tsconfig path syncing, and in-place import rewriting
