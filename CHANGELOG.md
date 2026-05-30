# Changelog

All notable changes to `code-discipline` will be documented here.

This project follows semantic versioning once published.

## Unreleased

- established `code-discipline` as the package identity
- added `checkCodeDiscipline()` with `maxFileLines` and `folderizeCompoundFiles` rules
- added the `code-discipline check` and `code-discipline sync` CLI commands
- kept `syncImports()` as the package's mutating import-sync feature
- changed the project license to `AGPL-3.0-only`
- reorganized the source and test layout into smaller responsibility-focused modules

## 0.1.0

- initial public release
- added source scanning, alias generation, tsconfig path syncing, and in-place import rewriting
- added configurable alias strategies, keep-relative policies, and restrained logging adapters
