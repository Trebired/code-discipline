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
        severity: None,
        suggested_path: None,
        details: json!({
            "lineCount": line_count,
            "max": max,
        }),
    }
}

fn create_max_file_lines_warning(
    file: &ScannedSourceFile,
    physical_line_count: usize,
    code_line_count: usize,
    max: usize,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "max-file-lines".to_string(),
        fix: false,
        file_path: file.relative_from_project_root.clone(),
        message: format!(
            "file has {physical_line_count} physical lines, but only {code_line_count} code lines count toward the limit of {max}"
        ),
        severity: Some("warning".to_string()),
        suggested_path: None,
        details: json!({
            "lineCount": physical_line_count,
            "codeLineCount": code_line_count,
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
        severity: None,
        suggested_path: None,
        details: json!({
            "commentCount": result.comment_count,
            "lineComments": result.line_comments,
            "blockComments": result.block_comments,
        }),
    }
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
        severity: None,
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
        severity: None,
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
        severity: None,
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
        severity: None,
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
        severity: None,
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
        severity: None,
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

fn create_max_function_lines_warning(
    file: &ScannedSourceFile,
    kind: &str,
    name: &str,
    physical_line_count: usize,
    code_line_count: usize,
    max: usize,
    start_line: usize,
    end_line: usize,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: "max-function-lines".to_string(),
        fix: false,
        file_path: file.relative_from_project_root.clone(),
        message: format!(
            "{kind} {name} has {physical_line_count} physical lines, but only {code_line_count} code lines count toward the limit of {max}"
        ),
        severity: Some("warning".to_string()),
        suggested_path: None,
        details: json!({
            "functionKind": kind,
            "functionName": name,
            "lineCount": physical_line_count,
            "codeLineCount": code_line_count,
            "max": max,
            "startLine": start_line,
            "endLine": end_line,
        }),
    }
}
