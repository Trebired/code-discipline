# Changelog

All notable changes to `@trebired/code-discipline` will be documented here.

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
