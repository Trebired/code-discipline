# Changelog

All notable changes to `@trebired/code-discipline` will be documented here.

This project follows semantic versioning once published.

## 5.0.0

- Removed the external formatter integration, formatter dependency, formatter options passthrough, and old formatter selector.
- Added the package-owned Rust formatter with the new `formatters.code` config and `format` selector for `check` and `fix`.
- Added native formatting for JavaScript, TypeScript, Go, Rust, Python, QML, shell, SCSS, and CSS source files.
- Added formatter verification for check mode, fix mode, supported language coverage, max-line comment wrapping, and package-owned state exclusion.

## 4.11.0

- Added QML source support with QML-aware `//` and `/* */` comment handling, string/template/regex preservation, and `maxFunctionLines` detection for JavaScript-style QML functions and signal-handler blocks.
- Made `.trebired/code-discipline` package-owned state intrinsically excluded from source scans, rule-level filtering, native scanning, formatter traversal, and banned-pattern matches against the package-owned state path itself.
- Updated language verification coverage for QML and for the built-in package-state exclusion.

## 4.10.2

- Added Python source support with comment-aware line counting, removable `#` comment detection, shebang/encoding-comment preservation, triple-string preservation, and indentation-based `maxFunctionLines` detection for `def` and `async def`.
- Added shell source support for `.sh`, `.bash`, and `.zsh` files, including shebang preservation, heredoc-aware `#` comment handling, and brace-style shell function detection for `maxFunctionLines`.
- Updated the Rust native backend comment scanner so native-backed runs understand Python and shell comments instead of only matching extensions in the TypeScript fallback.

## 4.10.1

- Refreshed package dependency ranges and lockfile state with `bun update` after the `.trebired/code-discipline` migration.

## 4.10.0

- Changed automatic config discovery to `.trebired/code-discipline/config.ts` only; old `code-discipline.config.ts` and `.code-discipline/config.ts` files are no longer auto-discovered.
- Moved package-owned generated artifacts, reports, import alias maps, and generated tsconfig path files under `.trebired/code-discipline/`.
- Kept explicit `--config <path>` support for caller-supplied paths, including legacy paths when passed intentionally.
- Updated README, CLI help, generated artifact verification, scan exclusions, and package fixtures for the new `.trebired` structure.

## 4.9.3

- Updated package metadata and release version for the current imports-rule migration line.
- Updated Code Discipline log group metadata fallback and internal package dependency ranges to the current published sibling releases.

## 4.9.2

- Renamed the `syncImports` rule to `imports` (config key, exported functions/types, CLI rule name, log group, rule slug) since it already handled alias syncing, `tsconfig`/`package.json` wiring, and relative-import rewriting well beyond "syncing imports".
- Added an opt-in `removeDeadImports` option to the `imports` rule that detects and removes unused JavaScript/TypeScript import bindings (default, named, namespace, and `import type`), using syntactic identifier-usage analysis rather than a full type checker. Off by default.

## 4.8.0

- Made `maxCharactersPerLine` fixable for safe JavaScript and TypeScript string literal cases, splitting long plain literals into concatenated segments while preserving runtime values and leaving unsafe lines reported.
- Added `max-characters-per-line` to targeted and unqualified `fix` runs without making a formatter requirement for the rewrite.
- Made `sync-imports` alias-map fixes ensure `.code-discipline/generated/` is present in root `.gitignore` without ignoring committed `.code-discipline/imports/*.json` state.
- Moved saved CLI reports under `.code-discipline/generated/reports/` and kept the CLI output pointed at the relative saved path.
- Added package verification scripts for the string-literal fixer and generated artifact hygiene, and included them in the publish check.

## 4.7.5

- Added the opt-in `presets.nodeProcessBoundary` config, which expands into `bannedPatterns` entries for direct Node `process` access while honoring separate environment and runtime boundary files.
- Kept manual `bannedPatterns` compatible when the preset is configured, including shared severity, exclusions, and allowed file handling.

## 4.7.4

- Added `logging.warnings`, defaulting to `true`, so warning-level CLI output can be hidden without restoring the removed `quiet` option.
- Derived package-owned Code Discipline log groups and package notices from `package.json` `config.organization.name` instead of source literals.

## 4.7.3

- Removed dead test scripts and stale test commands from publish workflows and maintainer docs.

## 4.7.2

- Removed package test suites and banned committed `*.spec.ts`/`*.spec.tsx` files through Code Discipline.
- Added Code Discipline enforcement for hardcoded `trebired` strings outside package metadata.
- Migrated Code Discipline to `.code-discipline/config.ts` with alias-map sync output.
- Updated package-generated artifact ignores and internal package dependency ranges.

## 4.7.1

- Updated the package `.gitignore` baseline so generated native build outputs, package artifacts, temp folders, logs, and local reports are ignored through Git rather than local discipline config entries.

## 4.7.0

- Changed config auto-discovery to `code-discipline.config.ts` and `.code-discipline/config.ts`, and stopped auto-discovering root `code-discipline.ts`.
- Removed top-level `sourceRoot` and `tsconfigPaths`; scanning now starts at the project root and `compilerOptions.paths` runtime normalization lives under `rules.syncImports.runtime`.
- Replaced `syncImports.importsFolder`, `syncImports.generatedTsconfig`, and `syncImports.packageJsonImports` with `syncImports.output`.
- Added `output: { type: "project-manifests" }`, which writes root `tsconfig.json` aliases and matching `package.json#imports`.
- Added `output: { type: "alias-map" }`, which writes `.code-discipline/imports/*.json`, the fixed `.code-discipline/generated/tsconfig.paths.json` projection, and keeps managed aliases out of `package.json#imports`.
- Made `sync-imports fix` migrate managed aliases between `project-manifests` and `alias-map` output models while preserving unrelated `tsconfig.json` and `package.json#imports` entries.
- Added `.code-discipline` to the built-in scan exclusions, so tool-owned config, generated tsconfig, and alias-map output do not need to be manually ignored.

## 4.6.2

- Added a constant-folding pass to `bannedPatterns` for TypeScript/JavaScript files: string concatenation via `+`, template literals with foldable interpolations, `[...literals].join(literalSeparator)`, and same-scope `const` aliases of those are now evaluated at zero runtime cost and checked against configured patterns, closing the "split into literal chunks and glue them" evasion. Expressions touching anything non-literal (a parameter, `process.env`, a function call, a shadowed name) are left unfolded, by design  -  no guessing, no false positives.

## 4.6.1

- Removed `tsNocheckAudit` (added in `4.6.0`). The rule is gone entirely: no config surface, no CLI selector, no fix pipeline step.

## 4.5.0

- Added `structuralBlankLines`, a fixable rule that enforces exactly one blank line at AST-identified structural boundaries (file headers, imports, declaration groups, class members) while leaving compact groups (imports, variables, types, re-exports, execution statements, class fields, directive prologues, function overloads, getter/setter pairs) at zero or one blank line and collapsing two or more blank lines to one.
- Made unqualified `fix` run `structuralBlankLines` after `removeComments` and before configured formatting.

## 4.4.2

- Replaced top-level `excludeDirs` with shared `ignore.entries` and `ignore.use_gitignore` configuration.
- Simplified formatter ignore config to a boolean that reuses the shared code-discipline ignore when `true`.

## 4.4.1

- Added formatter `.gitignore` support, with `ignore.entries` for explicit formatter ignore patterns.
- Updated the completed source scan log to report the number of files scanned explicitly.

## 4.4.0

- Added top-level formatter configuration with dedicated check and fix selectors.
- Made unqualified `fix` run configured formatting last after structural, import, and comment fixes.
- Added formatter changed and unchanged counts to fix results and CLI summaries.

## 4.3.2

- Changed the default `minDeclarationName.min` from `3` to `2`, allowing two-character declaration names while still reporting one-character names.

## 4.3.1

- Added `minDeclarationName`, defaulting to `min: 3`, to report too-short JavaScript and TypeScript function declarations and const identifiers.

## 4.3.0

- Collapsed rule-local and top-level exclusions into `excludeDirs` with typed `{ type: "file" | "folder", pattern }` entries, and removed the `excludeFiles`/`excludeFolders` compatibility keys.
- Updated source scanning and `sync-imports` to honor typed file and folder exclusion entries consistently.
- Routed CLI logging through `@trebired/logger` with rule-specific groups such as `trebired.code-discipline.rules.dry`, warning-only results on `warn`, passing summaries on `success`, and blocking/gate failures on `fail`.

## 4.2.5

- Added rule-local `excludeFiles` and `excludeFolders` support for every discipline rule.
- Renamed top-level source directory exclusion config from `excludeDirs` to `excludeFolders` without legacy compatibility.
- Made folder exclusions support folder names and glob-style patterns, and made imports-folder sync prune missing alias targets while repacking generated import files.

## 4.2.4

- Removed the CLI loading spinner so progress logs never interleave with `Scanning codebase` frames.
- Routed warning-only CLI violations and warning-only summaries through the `@trebired/logger` warning level without prefixing violation messages with `warning`.

## 4.2.3

- Routed TTY progress output through the same `@trebired/logger` CLI writer and restored logger-managed console colors.

## 4.2.2

- Routed default CLI progress, summaries, violations, and errors through the package-owned `@trebired/logger` console logger without configuring a log directory.

## 4.2.1

- Made `maxCharactersPerLine` ignore SVG files and inline JSX `<svg>...</svg>` regions while still reporting ordinary long lines.

## 4.2.0

- Changed the configured `minFileLines` default from `5` to `1`.
- Made `minFileLines` fixable for tiny redirect shims by deleting the shim file and rewriting imports to its forwarded target.
- Made `sync-imports` report unresolved relative imports in check mode and remove safe static import/export or Sass directive lines in fix mode.
- Switched package-owned console logging to `@trebired/logger` with no log directory and `save: false`, so logs stay on the console instead of being written to files.

## 4.1.0

- Added SCSS participation to `sync-imports`, including alias generation/reuse and rewrites for eligible `@use`, `@forward`, and quoted Sass `@import` specifiers.
- Preserved Sass namespace clauses and ignored comments, CSS `url(...)`, remote URLs, and arbitrary strings while rewriting SCSS imports.
- Kept generated package `imports` metadata synced with SCSS aliases so bundlers can resolve the same hash import map used by JS and TS files.
- Added `minFileLines`, with a default of `5`, to report files whose code line count is at or below the banned compatibility-shim threshold.
- Added `maxCharactersPerLine`, with a default of `150`, to report physical lines that exceed the configured character limit.
- Removed the public `evasionGuards` rule/config surface in favor of ordinary line-discipline rules.

## 4.0.1

- Kept this repository's own `dry` rule enforced during self-checks and removed the duplicate helper groups introduced around the 4.0.0 release.
- Changed the package self-test script to run the local built `dist/cli.js` directly instead of going through the self-referential `node_modules` symlink.
- Supersedes the already-published `4.0.0` package artifact; npm package versions are immutable and cannot be overwritten.

## 4.0.0

- Changed config auto-discovery to `code-discipline.ts` only; legacy `tb.code-discipline.*` filenames are no longer auto-discovered unless passed explicitly with `--config`.
- Added `syncImports.importsFolder` support so alias maps can live in sorted `imports/*.json` source-of-truth files with deterministic max-entry splitting.
- Added generated tsconfig path projection through `syncImports.generatedTsconfig`, with root `tsconfig.json` extending the generated file and inline `compilerOptions.paths` removed in imports-folder mode.
- Added imports-folder migration from existing root `tsconfig.json` paths and `package.json#imports`, while keeping `package.json` clean unless `packageJsonImports.enabled` is explicitly true.
- Added CSS support alongside SCSS for source scanning and removable comment handling.

## 3.4.2

- Added normalized behavioral fingerprints for simple pure `dry` functions, so equivalent implementations can be grouped despite different names, parameters, locals, formatting, or expression-vs-block structure.
- Normalized common equivalent helper forms including nullish fallbacks, const-then-return wrappers, branch returns, finite number guards, and object guard checks while preserving behavior-changing distinctions.
- Added the `normalized-behavior` DRY signal and fixtures covering representative text, number, clamp, and object helpers without hardcoding project-specific names or paths.

## 3.4.1

- Added `dry.minDuplicateCharacters`, defaulting to `0`, so DRY duplicate detection no longer has a hidden minimum function size.
- Applied the configurable threshold consistently across exact-normalized, matching-name, and similar-structure DRY signals.
- Documented the new DRY threshold and kept this repository's own self-check threshold explicit at `300`.

## 3.4.0

- Rendered `dry` duplicate groups in CLI output with the duplicated function names, file paths, line numbers, confidence, and `signals: ...` metadata.
- Changed the public `dry` violation message to `duplicate function group` while keeping duplicate details intact for API and report consumers.
- Kept chunk progress output as after-chunk summaries for check and fix runs, including DRY parse/match result counts.

## 3.3.3

- Added chunked rule progress for CLI/API check and fix runs, including per-chunk violation and mutation counts for long-running rules.
- Replaced the expensive all-pairs `dry` similarity pass with indexed matching and chunked parse/match progress to avoid stalls on large function sets.

## 3.3.2

- Removed `dry.helpers` registration and the helper-based `dry` autofix path; `dry` now scans source functions directly.
- Changed `dry` duplicate reporting to emit neutral function groups such as `function duplicates in files: ...` instead of selecting a primary file.
- Added matching function names and high structural similarity as DRY duplicate signals alongside exact normalized structure.

## 3.3.1

- Made `banned-files` fixable; `code-discipline fix banned-files` now deletes matching banned files and reports a `deleted_files` count.

## 3.3.0

- Removed the public `logging.enabled` and `logging.quiet` booleans; logging is now active whenever a `logger` or `adapter` is provided.
- Added the check-only `bannedFiles` / `banned-files` rule for banning project-relative file paths with glob patterns.
- Made the `dry` rule scan source files for likely exact normalized duplicates even without registered helper references, while keeping autofix limited to canonical helpers.

## 3.2.2

- Moved package-owned code-discipline logging under the `trebired.code-discipline` group root, including initialization notices and buffered event summaries.

## 3.2.1

- Added `removeComments.exclude` so comment checks and fixes can preserve comments containing configured plain-text substrings such as `@ts-nocheck`, without hardcoding comment syntax.
- Kept the exclusion behavior aligned across the TypeScript fallback and Rust native backend.

## 3.2.0

- Added the new check-only `bannedPatterns` / `banned-patterns` rule with case-insensitive substring matching and per-pattern `allowedFiles`.
- Restored rule-level severity configuration with `severity: "warning" | "fail"`, defaulting to `fail`, while keeping blank/comment-only max-line overflow as a non-blocking warning.
- Changed source scanning to include every built-in supported extension by default and replaced additive `sourceExtensions` config with `excludeSourceExtensions`.
- Added SCSS support to source scanning and comment-aware line counting paths.
- Further reduced scan overhead in both the TypeScript fallback and Rust native backend.

## 3.1.2

- Added `@trebired/result`-backed internal outcome typing for touched check and reporting paths so package-owned backend communication can share the same result surface used across Trebired packages.
- Kept the public CLI behavior unchanged while aligning the touched implementation with the current discipline expectations used to check other repositories.

## 3.1.1

- Shortened CLI scan progress output so large-repository scans stay readable instead of dumping low-signal scan internals.
- Clarified scan logging so source discovery time and total `check`/`gate` runtime are reported as separate lines with distinct wording.
- Fixed the TTY spinner/log interaction so scan progress and completion lines do not get rendered on top of the loading frame.

## 3.1.0

- Added explicit CLI scan completion timing so `check` and `gate` report how long the codebase scan took after `Scanning codebase`.
- Added chunked scan progress logging and native/backend scan summaries so large-repository scans are easier to observe and tune.
- Reworked source scanning in both the TypeScript fallback and Rust native backend to use chunked concurrent directory traversal for faster large-codebase scans.
- Added the `TB_CODE_DISCIPLINE_SCAN_CONCURRENCY` override so scan throughput can be tuned per machine or CI worker.

## 3.0.0

- Added top-level `evasionGuards` checks for packed files, packed lines, packed JavaScript/TypeScript functions, and runtime code hiding through string execution.
- Added the check-only `evasion-guards` selector so opt-in anti-evasion scans can be targeted from the CLI/runtime.
- Added a TTY loading animation for long CLI check/fix/gate scans.
- Changed `remove-comments` fixes to remove comment-only lines during the same per-file rewrite.
- Added the Rust native backend with TypeScript fallback and native acceleration for source scanning, `max-file-lines`, common `max-function-lines` paths, `folderize-compound-files` checks, `remove-comments`, and `evasion-guards`.
- Fixed runtime/CLI forwarding for top-level `evasionGuards`.
- Enforced code-discipline on its own codebase: the package became a self devDependency, the source tree was checked through `code-discipline gate`, and the source and former test tree were refactored until `check` reported zero violations.
- Fixed Bun and Node config loading for TypeScript config modules: transpiled modules are now written to `node_modules/.cache/code-discipline` instead of `data:` URLs, so relative `.js` specifiers resolving to `.ts` sources, bare package imports, and import cycles keep a real filesystem base.
- Fixed native build scripts after folderization and exported the native `stripComments` binding so the Rust backend matches the TypeScript native bridge.
- Fixed CLI error handling so failures inside `check`, `fix`, and `gate` are reported on stderr with exit code 1 instead of escaping as unhandled rejections.

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
- Changed config auto-discovery to package-owned TypeScript config loading for Node and Bun.
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

- Standardized package metadata ordering and contributing guidance around the Trebired writing style.
