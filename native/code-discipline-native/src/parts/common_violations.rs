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
