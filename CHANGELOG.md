# Changelog

All notable changes to `@trebired/code-discipline` will be documented here.

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
