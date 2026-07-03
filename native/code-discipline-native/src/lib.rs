use napi::Result;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy)]
enum CommentKind {
    Line,
    Block,
}

#[derive(Clone, Copy)]
struct CommentRange {
    start: usize,
    end: usize,
    kind: CommentKind,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommentStripResult {
    changed: bool,
    text: String,
    comment_count: usize,
    line_comments: usize,
    block_comments: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceScanRequest {
    project_root: String,
    source_root: String,
    source_extensions: Vec<String>,
    exclude_dirs: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedSourceFile {
    absolute_path: String,
    relative_from_project_root: String,
    relative_from_source_root: String,
    extension: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceFilesRequest {
    source_files: Vec<ScannedSourceFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaxFileLinesRequest {
    source_files: Vec<ScannedSourceFile>,
    max: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackedCodeGuardOptions {
    min_packed_line_columns: usize,
    max_semicolons_per_line: usize,
    max_structural_tokens_per_line: usize,
    max_packed_function_lines: usize,
    max_packed_function_statements: usize,
    min_packed_function_characters: usize,
    max_packed_file_non_empty_lines: usize,
    min_packed_file_characters: usize,
    min_packed_file_structural_tokens: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvasionGuardsOptions {
    packed_code: Option<PackedCodeGuardOptions>,
    runtime_code_hiding: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvasionGuardsRequest {
    source_files: Vec<ScannedSourceFile>,
    evasion_guards: EvasionGuardsOptions,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FolderizeRequest {
    source_files: Vec<ScannedSourceFile>,
    separators: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaxFunctionLinesRequest {
    source_files: Vec<ScannedSourceFile>,
    max: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeDisciplineViolation {
    rule: String,
    fix: bool,
    file_path: String,
    message: String,
    details: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    suggested_path: Option<String>,
}

#[derive(Serialize)]
struct FixRuleResult {
    ok: bool,
    #[serde(rename = "violationCount")]
    violation_count: usize,
    violations: Vec<CodeDisciplineViolation>,
    rewritten_files: usize,
    removed_comments: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeMaxFunctionLinesResult {
    violations: Vec<CodeDisciplineViolation>,
    handled_paths: Vec<String>,
}

fn err(message: impl Into<String>) -> napi::Error {
    napi::Error::from_reason(message.into())
}

fn to_posix_path(value: &Path) -> String {
    value.to_string_lossy().replace('\\', "/")
}

fn normalize_relative_path(value: impl AsRef<str>) -> String {
    let mut normalized = value.as_ref().replace('\\', "/");
    while normalized.starts_with("./") {
        normalized = normalized[2..].to_string();
    }
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    if normalized == "." {
        String::new()
    } else {
        normalized
    }
}

fn path_relative_from(base: &Path, value: &Path) -> String {
    value
        .strip_prefix(base)
        .map(to_posix_path)
        .map(normalize_relative_path)
        .unwrap_or_else(|_| to_posix_path(value))
}

fn extension_for_path(path: &Path) -> String {
    path.extension()
        .map(|value| format!(".{}", value.to_string_lossy().to_lowercase()))
        .unwrap_or_default()
}

fn should_exclude_directory(
    relative_dir: &str,
    project_relative_dir: &str,
    directory_name: &str,
    exclude_dirs: &[String],
) -> bool {
    let normalized_relative_dir = normalize_relative_path(relative_dir);
    let normalized_project_relative_dir = normalize_relative_path(project_relative_dir);

    exclude_dirs.iter().any(|entry| {
        let normalized_entry = normalize_relative_path(entry);
        directory_name == normalized_entry
            || normalized_relative_dir == normalized_entry
            || normalized_relative_dir.starts_with(&format!("{normalized_entry}/"))
    }) || exclude_dirs.iter().any(|entry| {
        let normalized_entry = normalize_relative_path(entry);
        normalized_project_relative_dir == normalized_entry
            || normalized_project_relative_dir.starts_with(&format!("{normalized_entry}/"))
    })
}

fn walk_source_directory(
    directory_path: &Path,
    relative_dir: &str,
    options: &SourceScanRequest,
    rows: &mut Vec<ScannedSourceFile>,
) -> Result<()> {
    let mut entries = fs::read_dir(directory_path)
        .map_err(|error| err(error.to_string()))?
        .filter_map(|entry| entry.ok())
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.file_name().cmp(&right.file_name()));

    let project_root = PathBuf::from(&options.project_root);
    let source_root = PathBuf::from(&options.source_root);

    for entry in entries {
        let absolute_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let relative_path = normalize_relative_path(if relative_dir.is_empty() {
            file_name.clone()
        } else {
            format!("{relative_dir}/{file_name}")
        });
        let project_relative_path = path_relative_from(&project_root, &absolute_path);
        let file_type = entry.file_type().map_err(|error| err(error.to_string()))?;

        if file_type.is_dir() {
            if should_exclude_directory(
                &relative_path,
                &project_relative_path,
                &file_name,
                &options.exclude_dirs,
            ) {
                continue;
            }

            walk_source_directory(&absolute_path, &relative_path, options, rows)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let extension = extension_for_path(&absolute_path);
        if !options
            .source_extensions
            .iter()
            .any(|item| item == &extension)
        {
            continue;
        }

        rows.push(ScannedSourceFile {
            absolute_path: absolute_path.to_string_lossy().to_string(),
            relative_from_project_root: path_relative_from(&project_root, &absolute_path),
            relative_from_source_root: path_relative_from(&source_root, &absolute_path),
            extension,
        });
    }

    Ok(())
}

fn is_ts_family_extension(extension: &str) -> bool {
    matches!(
        extension,
        ".cjs" | ".cts" | ".js" | ".jsx" | ".mjs" | ".mts" | ".ts" | ".tsx"
    )
}

fn is_go_extension(extension: &str) -> bool {
    extension == ".go"
}

fn is_rust_extension(extension: &str) -> bool {
    extension == ".rs"
}

fn scan_escaped_quoted_literal(text: &str, start: usize, quote: u8) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index += 2;
            continue;
        }

        let current = bytes[index];
        index += 1;
        if current == quote {
            return index;
        }
    }

    bytes.len()
}

fn scan_backtick_literal(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index += 2;
            continue;
        }
        if bytes[index] == b'`' {
            return index + 1;
        }
        index += 1;
    }

    bytes.len()
}

fn scan_line_comment(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 2;

    while index < bytes.len() && bytes[index] != b'\n' && bytes[index] != b'\r' {
        index += 1;
    }

    index
}

fn scan_block_comment(text: &str, start: usize, nested: bool) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 2;
    let mut depth = 1_u32;

    while index < bytes.len() {
        if nested && bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
            depth += 1;
            index += 2;
            continue;
        }

        if bytes[index] == b'*' && bytes.get(index + 1) == Some(&b'/') {
            depth -= 1;
            index += 2;
            if depth == 0 {
                return index;
            }
            continue;
        }

        index += 1;
    }

    bytes.len()
}

fn collect_c_like_comment_ranges(
    text: &str,
    keep_backtick_literal: bool,
    nested_blocks: bool,
) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if current == b'/' && next == Some(b'/') {
            let end = scan_line_comment(text, index);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Line,
            });
            index = end;
            continue;
        }

        if current == b'/' && next == Some(b'*') {
            let end = scan_block_comment(text, index, nested_blocks);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Block,
            });
            index = end;
            continue;
        }

        if current == b'"' || current == b'\'' {
            index = scan_escaped_quoted_literal(text, index, current);
            continue;
        }

        if keep_backtick_literal && current == b'`' {
            index = scan_backtick_literal(text, index);
            continue;
        }

        index += 1;
    }

    ranges
}

fn scan_rust_raw_string(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = start;

    if bytes.get(index) == Some(&b'b') {
        if bytes.get(index + 1) != Some(&b'r') {
            return None;
        }
        index += 1;
    }

    if bytes.get(index) != Some(&b'r') {
        return None;
    }
    index += 1;

    let mut hash_count = 0_usize;
    while bytes.get(index) == Some(&b'#') {
        hash_count += 1;
        index += 1;
    }

    if bytes.get(index) != Some(&b'"') {
        return None;
    }
    index += 1;

    while index < bytes.len() {
        if bytes[index] == b'"' {
            let mut matched = true;
            for hash_index in 0..hash_count {
                if bytes.get(index + 1 + hash_index) != Some(&b'#') {
                    matched = false;
                    break;
                }
            }

            if matched {
                return Some(index + 1 + hash_count);
            }
        }

        index += 1;
    }

    Some(bytes.len())
}

fn scan_rust_char_literal(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    if index >= bytes.len() || bytes[index] == b'\n' || bytes[index] == b'\r' {
        return None;
    }

    if bytes[index] == b'\\' {
        index += 1;

        if index >= bytes.len() {
            return Some(bytes.len());
        }

        if bytes[index] == b'u' && bytes.get(index + 1) == Some(&b'{') {
            index += 2;
            while index < bytes.len() && bytes[index] != b'}' {
                index += 1;
            }
            if index < bytes.len() {
                index += 1;
            }
        } else {
            index += 1;
        }
    } else {
        index += 1;
    }

    if bytes.get(index) == Some(&b'\'') {
        Some(index + 1)
    } else {
        None
    }
}

fn collect_rust_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        if let Some(raw_end) = scan_rust_raw_string(text, index) {
            index = raw_end;
            continue;
        }

        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if current == b'b' && (next == Some(b'"') || next == Some(b'\'')) {
            index = scan_escaped_quoted_literal(text, index + 1, next.unwrap());
            continue;
        }

        if current == b'"' {
            index = scan_escaped_quoted_literal(text, index, b'"');
            continue;
        }

        if current == b'\'' {
            if let Some(char_end) = scan_rust_char_literal(text, index) {
                index = char_end;
                continue;
            }
        }

        if current == b'/' && next == Some(b'/') {
            let end = scan_line_comment(text, index);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Line,
            });
            index = end;
            continue;
        }

        if current == b'/' && next == Some(b'*') {
            let end = scan_block_comment(text, index, true);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Block,
            });
            index = end;
            continue;
        }

        index += 1;
    }

    ranges
}

fn collect_comment_ranges(text: &str, extension: &str) -> Vec<CommentRange> {
    if is_ts_family_extension(extension) {
        return collect_c_like_comment_ranges(text, true, false);
    }

    if is_go_extension(extension) {
        return collect_c_like_comment_ranges(text, true, false);
    }

    if is_rust_extension(extension) {
        return collect_rust_comment_ranges(text);
    }

    Vec::new()
}

fn create_block_comment_replacement(comment_text: &str) -> String {
    let newline_only = comment_text
        .chars()
        .filter(|ch| *ch == '\r' || *ch == '\n')
        .collect::<String>();

    if newline_only.is_empty() {
        " ".to_string()
    } else {
        newline_only
    }
}

fn find_line_start(text: &str, index: usize) -> usize {
    text[..index]
        .rfind('\n')
        .map(|position| position + 1)
        .unwrap_or(0)
}

fn find_line_end(text: &str, index: usize) -> (usize, usize) {
    let newline = text[index..].find('\n').map(|position| index + position);
    let break_end = newline.map(|position| position + 1).unwrap_or(text.len());
    let content_end = match newline {
        Some(position) if position > 0 && text.as_bytes()[position - 1] == b'\r' => position - 1,
        Some(position) => position,
        None => text.len(),
    };

    (content_end, break_end)
}

fn resolve_comment_replacement(
    text: &str,
    range: CommentRange,
    previous_end: usize,
) -> (usize, usize, String) {
    let line_start = find_line_start(text, range.start);
    let (content_end, break_end) = find_line_end(text, range.end);
    let prefix = &text[line_start..range.start];
    let suffix = &text[range.end..content_end];

    if line_start >= previous_end && prefix.trim().is_empty() && suffix.trim().is_empty() {
        return (line_start, break_end, String::new());
    }

    let value = match range.kind {
        CommentKind::Line => String::new(),
        CommentKind::Block => create_block_comment_replacement(&text[range.start..range.end]),
    };

    (range.start, range.end, value)
}

fn strip_comments_internal(text: &str, extension: &str) -> CommentStripResult {
    let ranges = collect_comment_ranges(text, extension);

    if ranges.is_empty() {
        return CommentStripResult {
            changed: false,
            text: text.to_string(),
            comment_count: 0,
            line_comments: 0,
            block_comments: 0,
        };
    }

    let mut rewritten = String::with_capacity(text.len());
    let mut previous_end = 0_usize;
    let mut line_comments = 0_usize;
    let mut block_comments = 0_usize;

    for range in ranges.iter().copied() {
        let (start, end, value) = resolve_comment_replacement(text, range, previous_end);
        rewritten.push_str(&text[previous_end..start]);
        rewritten.push_str(&value);
        previous_end = end;

        match range.kind {
            CommentKind::Line => line_comments += 1,
            CommentKind::Block => block_comments += 1,
        }
    }

    rewritten.push_str(&text[previous_end..]);

    CommentStripResult {
        changed: rewritten != text,
        text: rewritten,
        comment_count: line_comments + block_comments,
        line_comments,
        block_comments,
    }
}

fn count_lines(text: &str) -> usize {
    if text.is_empty() {
        0
    } else {
        text.split('\n').count()
    }
}

fn supports_remove_comments(extension: &str) -> bool {
    is_ts_family_extension(extension) || is_go_extension(extension) || is_rust_extension(extension)
}

fn supports_folderization_fix(extension: &str) -> bool {
    is_ts_family_extension(extension)
}

fn posix_dirname(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(dir, _)| dir.to_string())
        .unwrap_or_else(|| ".".to_string())
}

fn posix_basename(path: &str) -> &str {
    path.rsplit_once('/').map(|(_, base)| base).unwrap_or(path)
}

fn strip_extension<'a>(path: &'a str, extension: &str) -> &'a str {
    path.strip_suffix(extension).unwrap_or(path)
}

fn join_posix(left: &str, right: &str) -> String {
    if left.is_empty() || left == "." {
        right.to_string()
    } else {
        format!("{left}/{right}")
    }
}

fn create_max_file_lines_violation(
    file: &ScannedSourceFile,
    line_count: usize,
    max: usize,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "max-file-lines".to_string(),
        fix: false,
        file_path: file.relative_from_project_root.clone(),
        message: format!("file has {line_count} lines and exceeds the limit of {max}"),
        suggested_path: None,
        details: json!({
            "lineCount": line_count,
            "max": max,
        }),
    }
}

fn create_remove_comments_violation(
    file: &ScannedSourceFile,
    result: &CommentStripResult,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "remove-comments".to_string(),
        fix: true,
        file_path: file.relative_from_project_root.clone(),
        message: format!(
            "file contains {} removable comment(s)",
            result.comment_count
        ),
        suggested_path: None,
        details: json!({
            "commentCount": result.comment_count,
            "lineComments": result.line_comments,
            "blockComments": result.block_comments,
        }),
    }
}

fn strip_comments_and_strings(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut result = String::with_capacity(text.len());
    let mut index = 0_usize;
    let mut in_single = false;
    let mut in_double = false;
    let mut in_template = false;
    let mut in_block_comment = false;
    let mut in_line_comment = false;
    let mut escaped = false;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if in_line_comment {
            if current == b'\n' {
                in_line_comment = false;
                result.push('\n');
            } else {
                result.push(' ');
            }
            index += 1;
            continue;
        }

        if in_block_comment {
            if current == b'*' && next == Some(b'/') {
                in_block_comment = false;
                result.push_str("  ");
                index += 2;
            } else {
                result.push(if current == b'\n' { '\n' } else { ' ' });
                index += 1;
            }
            continue;
        }

        if !in_single && !in_double && !in_template && current == b'/' && next == Some(b'/') {
            in_line_comment = true;
            result.push_str("  ");
            index += 2;
            continue;
        }

        if !in_single && !in_double && !in_template && current == b'/' && next == Some(b'*') {
            in_block_comment = true;
            result.push_str("  ");
            index += 2;
            continue;
        }

        if escaped {
            escaped = false;
            result.push(' ');
            index += 1;
            continue;
        }

        if (in_single || in_double || in_template) && current == b'\\' {
            escaped = true;
            result.push(' ');
            index += 1;
            continue;
        }

        if !in_double && !in_template && current == b'\'' {
            in_single = !in_single;
            result.push(' ');
            index += 1;
            continue;
        }

        if !in_single && !in_template && current == b'"' {
            in_double = !in_double;
            result.push(' ');
            index += 1;
            continue;
        }

        if !in_single && !in_double && current == b'`' {
            in_template = !in_template;
            result.push(' ');
            index += 1;
            continue;
        }

        if in_single || in_double || in_template {
            result.push(if current == b'\n' { '\n' } else { ' ' });
        } else {
            result.push(current as char);
        }
        index += 1;
    }

    result
}

fn count_structural_tokens(text: &str) -> usize {
    text.chars()
        .filter(|ch| "{}()[],:?=>".contains(*ch))
        .count()
}

fn create_packed_file_violation(
    file: &ScannedSourceFile,
    non_empty_line_count: usize,
    character_count: usize,
    structural_token_count: usize,
    options: &PackedCodeGuardOptions,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "evasion-guards".to_string(),
        fix: false,
        file_path: file.relative_from_project_root.clone(),
        message: format!("file appears packed into {non_empty_line_count} non-empty line(s)"),
        suggested_path: None,
        details: json!({
            "kind": "packed-file",
            "nonEmptyLineCount": non_empty_line_count,
            "characterCount": character_count,
            "structuralTokenCount": structural_token_count,
            "maxNonEmptyLines": options.max_packed_file_non_empty_lines,
            "minCharacters": options.min_packed_file_characters,
            "minStructuralTokens": options.min_packed_file_structural_tokens,
        }),
    }
}

fn create_packed_line_violation(
    file: &ScannedSourceFile,
    line: usize,
    column_count: usize,
    semicolon_count: usize,
    structural_token_count: usize,
    options: &PackedCodeGuardOptions,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "evasion-guards".to_string(),
        fix: false,
        file_path: file.relative_from_project_root.clone(),
        message: format!("line {line} appears packed to avoid line-count rules"),
        suggested_path: None,
        details: json!({
            "kind": "packed-line",
            "line": line,
            "columnCount": column_count,
            "semicolonCount": semicolon_count,
            "structuralTokenCount": structural_token_count,
            "minColumns": options.min_packed_line_columns,
            "maxSemicolons": options.max_semicolons_per_line,
            "maxStructuralTokens": options.max_structural_tokens_per_line,
        }),
    }
}

fn create_packed_function_violation(
    file: &ScannedSourceFile,
    name: &str,
    line: usize,
    line_count: usize,
    statement_count: usize,
    character_count: usize,
    options: &PackedCodeGuardOptions,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "evasion-guards".to_string(),
        fix: false,
        file_path: file.relative_from_project_root.clone(),
        message: format!("function {name} appears packed into {line_count} line(s)"),
        suggested_path: None,
        details: json!({
            "kind": "packed-function",
            "functionKind": "function",
            "functionName": name,
            "line": line,
            "lineCount": line_count,
            "statementCount": statement_count,
            "characterCount": character_count,
            "maxLines": options.max_packed_function_lines,
            "maxStatements": options.max_packed_function_statements,
            "minCharacters": options.min_packed_function_characters,
        }),
    }
}

fn create_runtime_code_hiding_violation(
    file: &ScannedSourceFile,
    pattern: &str,
    line: usize,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "evasion-guards".to_string(),
        fix: false,
        file_path: file.relative_from_project_root.clone(),
        message: format!("runtime code hiding detected via {pattern}"),
        suggested_path: None,
        details: json!({
            "kind": "runtime-code-hiding",
            "pattern": pattern,
            "line": line,
        }),
    }
}

fn create_folderize_violation(
    file: &ScannedSourceFile,
    suggested_path: String,
    mode: &str,
    prefix: &str,
    remainder: &str,
    separator: &str,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "folderize-compound-files".to_string(),
        fix: true,
        file_path: file.relative_from_project_root.clone(),
        message: format!("file can be grouped under {suggested_path}"),
        suggested_path: Some(suggested_path.clone()),
        details: json!({
            "mode": mode,
            "prefix": prefix,
            "remainder": remainder,
            "separator": separator,
        }),
    }
}

fn create_max_function_lines_violation(
    file: &ScannedSourceFile,
    kind: &str,
    name: &str,
    line_count: usize,
    max: usize,
    start_line: usize,
    end_line: usize,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "max-function-lines".to_string(),
        fix: false,
        file_path: file.relative_from_project_root.clone(),
        message: format!("{kind} {name} has {line_count} lines and exceeds the limit of {max}"),
        suggested_path: None,
        details: json!({
            "functionKind": kind,
            "functionName": name,
            "lineCount": line_count,
            "max": max,
            "startLine": start_line,
            "endLine": end_line,
        }),
    }
}

#[derive(Clone)]
struct PrefixMatch {
    prefix: String,
    remainder: String,
    separator: String,
    index: usize,
}

fn find_prefix_match(file: &ScannedSourceFile, separators: &[String]) -> Option<PrefixMatch> {
    let basename = strip_extension(
        posix_basename(&file.relative_from_source_root),
        &file.extension,
    );
    let mut best_match: Option<PrefixMatch> = None;

    for separator in separators {
        let Some(index) = basename.find(separator) else {
            continue;
        };
        if index == 0 {
            continue;
        }

        let prefix = basename[..index].to_string();
        let remainder = basename[index + separator.len()..].to_string();
        if prefix.is_empty() || remainder.is_empty() {
            continue;
        }

        if best_match
            .as_ref()
            .map(|item| index < item.index)
            .unwrap_or(true)
        {
            best_match = Some(PrefixMatch {
                prefix,
                remainder,
                separator: separator.clone(),
                index,
            });
        }
    }

    best_match
}

fn collect_folderize_violations(
    source_files: &[ScannedSourceFile],
    separators: &[String],
) -> Vec<CodeDisciplineViolation> {
    let mut matches = Vec::<(ScannedSourceFile, PrefixMatch)>::new();

    for file in source_files {
        if !supports_folderization_fix(&file.extension) {
            continue;
        }
        if let Some(prefix_match) = find_prefix_match(file, separators) {
            matches.push((file.clone(), prefix_match));
        }
    }

    let mut violations = Vec::new();

    for (file, prefix_match) in matches.iter() {
        let directory_name =
            posix_basename(&posix_dirname(&file.relative_from_project_root)).to_string();
        let directory_key = format!(
            "{}::{}",
            posix_dirname(&file.relative_from_source_root),
            prefix_match.prefix
        );
        let grouped_count = matches
            .iter()
            .filter(|(candidate, candidate_match)| {
                format!(
                    "{}::{}",
                    posix_dirname(&candidate.relative_from_source_root),
                    candidate_match.prefix
                ) == directory_key
            })
            .count();

        let mode = if directory_name == prefix_match.prefix {
            Some("repeated-folder-prefix")
        } else if grouped_count >= 2 {
            Some("same-directory-group")
        } else {
            None
        };

        let Some(mode) = mode else {
            continue;
        };

        let target_file_name = format!("{}{}", prefix_match.remainder, file.extension);
        let project_dir = posix_dirname(&file.relative_from_project_root);
        let suggested_path = if mode == "repeated-folder-prefix" {
            join_posix(&project_dir, &target_file_name)
        } else {
            join_posix(
                &join_posix(&project_dir, &prefix_match.prefix),
                &target_file_name,
            )
        };

        violations.push(create_folderize_violation(
            file,
            suggested_path,
            mode,
            &prefix_match.prefix,
            &prefix_match.remainder,
            &prefix_match.separator,
        ));
    }

    violations.sort_by(|left, right| left.file_path.cmp(&right.file_path));
    violations
}

fn count_line_number(text: &str, byte_index: usize) -> usize {
    text[..byte_index.min(text.len())]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count()
        + 1
}

fn strip_line_comments_and_strings(value: &str) -> String {
    let normalized = strip_comments_and_strings(value);
    normalized.lines().next().unwrap_or("").to_string()
}

fn count_brace_delta(value: &str) -> i32 {
    let normalized = strip_line_comments_and_strings(value);
    normalized.chars().fold(0_i32, |sum, ch| {
        if ch == '{' {
            sum + 1
        } else if ch == '}' {
            sum - 1
        } else {
            sum
        }
    })
}

fn header_start_matches(line: &str, extension: &str) -> bool {
    let trimmed = line.trim_start();
    if is_go_extension(extension) {
        return trimmed.starts_with("func ");
    }

    trimmed.starts_with("fn ")
        || trimmed.starts_with("pub fn ")
        || trimmed.starts_with("pub(crate) fn ")
        || trimmed.starts_with("async fn ")
        || trimmed.starts_with("unsafe fn ")
        || trimmed.starts_with("const fn ")
        || trimmed.starts_with("pub async fn ")
        || trimmed.starts_with("pub unsafe fn ")
        || trimmed.starts_with("pub const fn ")
}

fn extract_function_name(header: &str, extension: &str) -> String {
    let normalized = header.trim_start();
    if is_go_extension(extension) {
        let after_func = normalized
            .strip_prefix("func")
            .unwrap_or(normalized)
            .trim_start();
        let after_receiver = if after_func.starts_with('(') {
            after_func
                .find(')')
                .map(|index| after_func[index + 1..].trim_start())
                .unwrap_or(after_func)
        } else {
            after_func
        };
        return after_receiver
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
            .collect::<String>();
    }

    let Some(fn_index) = normalized.find("fn ") else {
        return "anonymous".to_string();
    };
    normalized[fn_index + 3..]
        .chars()
        .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
        .collect::<String>()
}

fn collect_block_function_violations(
    file: &ScannedSourceFile,
    text: &str,
    max: usize,
) -> Vec<CodeDisciplineViolation> {
    if !is_go_extension(&file.extension) && !is_rust_extension(&file.extension) {
        return Vec::new();
    }

    let lines = text.lines().collect::<Vec<_>>();
    let mut violations = Vec::new();
    let mut pending_header = String::new();
    let mut pending_start_line = 0_usize;
    let mut pending_brace_depth = 0_i32;
    let mut pending_name = String::new();
    let mut pending_kind = "function".to_string();

    for (index, line) in lines.iter().enumerate() {
        if pending_header.is_empty() {
            if !header_start_matches(line, &file.extension) {
                continue;
            }
            pending_header = (*line).to_string();
            pending_start_line = index + 1;
            pending_kind = if is_go_extension(&file.extension) && line.contains("func (") {
                "method".to_string()
            } else {
                "function".to_string()
            };
            pending_name = extract_function_name(&pending_header, &file.extension);
        } else {
            pending_header.push('\n');
            pending_header.push_str(line);
            if pending_name.is_empty() || pending_name == "anonymous" {
                pending_name = extract_function_name(&pending_header, &file.extension);
            }
        }

        if pending_brace_depth == 0
            && !strip_line_comments_and_strings(&pending_header).contains('{')
        {
            continue;
        }

        pending_brace_depth += count_brace_delta(line);

        if pending_brace_depth > 0 {
            continue;
        }

        let end_line = index + 1;
        let line_count = end_line - pending_start_line + 1;
        if line_count > max {
            violations.push(create_max_function_lines_violation(
                file,
                &pending_kind,
                if pending_name.is_empty() {
                    "anonymous"
                } else {
                    &pending_name
                },
                line_count,
                max,
                pending_start_line,
                end_line,
            ));
        }

        pending_header.clear();
        pending_start_line = 0;
        pending_brace_depth = 0;
        pending_name.clear();
        pending_kind = "function".to_string();
    }

    violations
}

fn is_simple_typescript_function_file(text: &str) -> bool {
    !text.contains("class ")
        && !text.contains("interface ")
        && !text.contains(" constructor(")
        && !text.contains("\n  get ")
        && !text.contains("\n  set ")
}

fn extract_word_after(source: &str, marker: &str) -> String {
    let Some(index) = source.find(marker) else {
        return "anonymous".to_string();
    };
    source[index + marker.len()..]
        .trim_start()
        .chars()
        .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '$')
        .collect::<String>()
}

fn extract_assignment_name(line: &str) -> String {
    let Some(eq_index) = line.find('=') else {
        return "anonymous".to_string();
    };
    let before = &line[..eq_index];
    let token = before
        .split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_' || ch == '$'))
        .filter(|part| !part.is_empty())
        .last()
        .unwrap_or("anonymous");
    token.to_string()
}

fn find_typescript_function_start(line: &str) -> Option<(String, String)> {
    let stripped = strip_line_comments_and_strings(line);
    if stripped.contains("function ") && stripped.contains('{') {
        let name = extract_word_after(&stripped, "function ");
        return Some((
            "function".to_string(),
            if name.is_empty() {
                "anonymous".to_string()
            } else {
                name
            },
        ));
    }

    if stripped.contains("=>") && stripped.contains('{') {
        let name = extract_assignment_name(&stripped);
        return Some(("arrow-function".to_string(), name));
    }

    None
}

fn collect_simple_typescript_function_violations(
    file: &ScannedSourceFile,
    text: &str,
    max: usize,
) -> Vec<CodeDisciplineViolation> {
    if !is_ts_family_extension(&file.extension) || !is_simple_typescript_function_file(text) {
        return Vec::new();
    }

    let lines = text.lines().collect::<Vec<_>>();
    let mut violations = Vec::new();
    let mut pending_kind = String::new();
    let mut pending_name = String::new();
    let mut pending_start_line = 0_usize;
    let mut pending_brace_depth = 0_i32;

    for (index, line) in lines.iter().enumerate() {
        if pending_start_line == 0 {
            let Some((kind, name)) = find_typescript_function_start(line) else {
                continue;
            };
            pending_kind = kind;
            pending_name = name;
            pending_start_line = index + 1;
            pending_brace_depth = 0;
        }

        pending_brace_depth += count_brace_delta(line);

        if pending_brace_depth > 0 {
            continue;
        }

        let end_line = index + 1;
        let line_count = end_line - pending_start_line + 1;
        if line_count > max {
            violations.push(create_max_function_lines_violation(
                file,
                &pending_kind,
                &pending_name,
                line_count,
                max,
                pending_start_line,
                end_line,
            ));
        }

        pending_kind.clear();
        pending_name.clear();
        pending_start_line = 0;
        pending_brace_depth = 0;
    }

    violations
}

fn detect_runtime_code_hiding(
    file: &ScannedSourceFile,
    text: &str,
    stripped: &str,
) -> Vec<CodeDisciplineViolation> {
    let mut violations = Vec::new();
    let patterns = [
        ("new Function", "new Function("),
        ("Function", "Function("),
        ("eval", "eval("),
        ("setTimeout", "setTimeout("),
        ("setInterval", "setInterval("),
    ];

    for (label, needle) in patterns {
        let mut offset = 0_usize;
        while let Some(position) = stripped[offset..].find(needle) {
            let absolute = offset + position;
            let after = absolute + needle.len();
            let Some(next_non_space) = text[after..].chars().find(|ch| !ch.is_whitespace()) else {
                break;
            };
            if next_non_space == '"' || next_non_space == '\'' || next_non_space == '`' {
                violations.push(create_runtime_code_hiding_violation(
                    file,
                    label,
                    count_line_number(text, absolute),
                ));
            }
            offset = after;
        }
    }

    violations
}

fn detect_packed_functions(
    file: &ScannedSourceFile,
    text: &str,
    stripped: &str,
    options: &PackedCodeGuardOptions,
) -> Vec<CodeDisciplineViolation> {
    let mut violations = Vec::new();
    let mut offset = 0_usize;

    while let Some(position) = stripped[offset..].find("function ") {
        let absolute = offset + position;
        let name_start = absolute + "function ".len();
        let name = stripped[name_start..]
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '$')
            .collect::<String>();
        let Some(open_relative) = stripped[absolute..].find('{') else {
            break;
        };
        let open = absolute + open_relative;
        let Some(close_relative) = stripped[open..].find('}') else {
            break;
        };
        let close = open + close_relative + 1;
        let function_text = &text[absolute..close];
        let line_count = function_text.bytes().filter(|byte| *byte == b'\n').count() + 1;
        let statement_count = stripped[open..close]
            .bytes()
            .filter(|byte| *byte == b';')
            .count();
        let character_count = function_text.len();

        if line_count <= options.max_packed_function_lines
            && statement_count > options.max_packed_function_statements
            && character_count >= options.min_packed_function_characters
        {
            violations.push(create_packed_function_violation(
                file,
                if name.is_empty() { "anonymous" } else { &name },
                count_line_number(text, absolute),
                line_count,
                statement_count,
                character_count,
                options,
            ));
        }

        offset = close;
    }

    violations
}

#[napi]
pub fn strip_comments(text: String, extension: String) -> Result<String> {
    let result = strip_comments_internal(&text, &extension);
    serde_json::to_string(&result).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn scan_source_files(request_json: String) -> Result<String> {
    let options: SourceScanRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut rows = Vec::new();
    walk_source_directory(Path::new(&options.source_root), "", &options, &mut rows)?;
    rows.sort_by(|left, right| {
        left.relative_from_project_root
            .cmp(&right.relative_from_project_root)
    });
    serde_json::to_string(&rows).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn run_max_file_lines_rule(request_json: String) -> Result<String> {
    let request: MaxFileLinesRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut violations = Vec::new();

    for file in request.source_files.iter() {
        let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
        let line_count = count_lines(&text);

        if line_count > request.max {
            violations.push(create_max_file_lines_violation(
                file,
                line_count,
                request.max,
            ));
        }
    }

    serde_json::to_string(&violations).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn run_max_block_function_lines_rule(request_json: String) -> Result<String> {
    let request: MaxFunctionLinesRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut violations = Vec::new();
    let mut handled_paths = Vec::new();

    for file in request.source_files.iter() {
        if is_go_extension(&file.extension) || is_rust_extension(&file.extension) {
            let text =
                fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
            violations.extend(collect_block_function_violations(file, &text, request.max));
            handled_paths.push(file.absolute_path.clone());
            continue;
        }

        if is_ts_family_extension(&file.extension) {
            let text =
                fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
            if is_simple_typescript_function_file(&text) {
                violations.extend(collect_simple_typescript_function_violations(
                    file,
                    &text,
                    request.max,
                ));
                handled_paths.push(file.absolute_path.clone());
            }
        }
    }

    serde_json::to_string(&NativeMaxFunctionLinesResult {
        violations,
        handled_paths,
    })
    .map_err(|error| err(error.to_string()))
}

#[napi]
pub fn run_folderize_compound_files_rule(request_json: String) -> Result<String> {
    let request: FolderizeRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let violations = collect_folderize_violations(&request.source_files, &request.separators);
    serde_json::to_string(&violations).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn collect_remove_comments_violations(request_json: String) -> Result<String> {
    let request: SourceFilesRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut violations = Vec::new();

    for file in request.source_files.iter() {
        if !supports_remove_comments(&file.extension) {
            continue;
        }

        let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
        let result = strip_comments_internal(&text, &file.extension);
        if !result.changed {
            continue;
        }

        violations.push(create_remove_comments_violation(file, &result));
    }

    serde_json::to_string(&violations).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn fix_remove_comments_rule(request_json: String) -> Result<String> {
    let request: SourceFilesRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut rewritten_files = 0_usize;
    let mut removed_comments = 0_usize;

    for file in request.source_files.iter() {
        if !supports_remove_comments(&file.extension) {
            continue;
        }

        let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
        let result = strip_comments_internal(&text, &file.extension);
        if !result.changed {
            continue;
        }

        fs::write(&file.absolute_path, result.text).map_err(|error| err(error.to_string()))?;
        rewritten_files += 1;
        removed_comments += result.comment_count;
    }

    let result = FixRuleResult {
        ok: true,
        violation_count: 0,
        violations: Vec::new(),
        rewritten_files,
        removed_comments,
    };

    serde_json::to_string(&result).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn run_evasion_guards_rule(request_json: String) -> Result<String> {
    let request: EvasionGuardsRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut violations = Vec::new();

    for file in request.source_files.iter() {
        let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
        let stripped = strip_comments_and_strings(&text);

        if let Some(packed_code) = &request.evasion_guards.packed_code {
            let raw_lines = text.lines().collect::<Vec<_>>();
            let stripped_lines = stripped.lines().collect::<Vec<_>>();
            let non_empty_line_count = raw_lines
                .iter()
                .filter(|line| !line.trim().is_empty())
                .count();
            let file_structural_token_count = count_structural_tokens(&stripped);

            if non_empty_line_count <= packed_code.max_packed_file_non_empty_lines
                && text.len() >= packed_code.min_packed_file_characters
                && file_structural_token_count >= packed_code.min_packed_file_structural_tokens
            {
                violations.push(create_packed_file_violation(
                    file,
                    non_empty_line_count,
                    text.len(),
                    file_structural_token_count,
                    packed_code,
                ));
            }

            for (index, raw_line) in raw_lines.iter().enumerate() {
                let stripped_line = stripped_lines.get(index).copied().unwrap_or("");
                let semicolon_count = stripped_line.bytes().filter(|byte| *byte == b';').count();
                let structural_token_count = count_structural_tokens(stripped_line);

                if raw_line.len() >= packed_code.min_packed_line_columns
                    && (semicolon_count > packed_code.max_semicolons_per_line
                        || structural_token_count > packed_code.max_structural_tokens_per_line)
                {
                    violations.push(create_packed_line_violation(
                        file,
                        index + 1,
                        raw_line.len(),
                        semicolon_count,
                        structural_token_count,
                        packed_code,
                    ));
                }
            }

            if is_ts_family_extension(&file.extension) {
                violations.extend(detect_packed_functions(file, &text, &stripped, packed_code));
            }
        }

        if request.evasion_guards.runtime_code_hiding && is_ts_family_extension(&file.extension) {
            violations.extend(detect_runtime_code_hiding(file, &text, &stripped));
        }
    }

    serde_json::to_string(&violations).map_err(|error| err(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, extension: &str) -> ScannedSourceFile {
        ScannedSourceFile {
            absolute_path: format!("/repo/{path}"),
            relative_from_project_root: path.to_string(),
            relative_from_source_root: path.strip_prefix("src/").unwrap_or(path).to_string(),
            extension: extension.to_string(),
        }
    }

    #[test]
    fn strips_comment_only_lines_without_touching_literals() {
        let source = [
            "const url = \"https://example.com\";",
            "const regex = /https?:\\/\\/example\\.com/;",
            "// remove this",
            "/* and this */",
            "export const app = { url, regex };",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".ts");

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert_eq!(
            result.text,
            [
                "const url = \"https://example.com\";",
                "const regex = /https?:\\/\\/example\\.com/;",
                "export const app = { url, regex };",
                "",
            ]
            .join("\n")
        );
    }

    #[test]
    fn preserves_rust_raw_strings_while_stripping_nested_comments() {
        let source = [
            "pub fn build<'a>() -> &'a str {",
            "    let raw = r#\"// keep /* here */\"#;",
            "    // remove this",
            "    /* outer /* inner */ and this */",
            "    raw",
            "}",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".rs");

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert!(result.text.contains("r#\"// keep /* here */\"#"));
        assert!(!result.text.contains("outer"));
        assert!(!result.text.contains("inner"));
    }

    #[test]
    fn scans_folderize_candidates_with_suggested_paths() {
        let files = vec![
            file("src/user_route.ts", ".ts"),
            file("src/user_model.ts", ".ts"),
            file("src/other.ts", ".ts"),
        ];

        let violations = collect_folderize_violations(&files, &["_".to_string()]);

        assert_eq!(violations.len(), 2);
        assert_eq!(violations[0].file_path, "src/user_model.ts");
        assert_eq!(
            violations[0].suggested_path.as_deref(),
            Some("src/user/model.ts")
        );
        assert_eq!(violations[1].file_path, "src/user_route.ts");
        assert_eq!(
            violations[1].suggested_path.as_deref(),
            Some("src/user/route.ts")
        );
    }

    #[test]
    fn detects_block_function_line_violations() {
        let source = [
            "pub fn build_payload() -> String {",
            "    let one = \"sam\";",
            "    let two = \"admin\";",
            "    let three = \"global\";",
            "    format!(\"{one}{two}{three}\")",
            "}",
            "",
        ]
        .join("\n");
        let file = file("src/lib.rs", ".rs");

        let violations = collect_block_function_violations(&file, &source, 5);

        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].rule, "max-function-lines");
        assert_eq!(violations[0].file_path, "src/lib.rs");
    }

    #[test]
    fn detects_simple_typescript_arrow_function_line_violations() {
        let source = [
            "export const buildPayload = () => {",
            "  const user = \"sam\";",
            "  const role = \"admin\";",
            "  const scope = \"global\";",
            "  return { user, role, scope };",
            "};",
            "",
        ]
        .join("\n");
        let file = file("src/functions.ts", ".ts");

        let violations = collect_simple_typescript_function_violations(&file, &source, 5);

        assert_eq!(violations.len(), 1);
        assert_eq!(
            violations[0].message,
            "arrow-function buildPayload has 6 lines and exceeds the limit of 5"
        );
    }
}
