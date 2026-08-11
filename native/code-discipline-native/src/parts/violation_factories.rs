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

fn create_redundant_path_segments_violation(
    file: &ScannedSourceFile,
    suggested_path: String,
    mode: &str,
    prefix: &str,
    remainder: &str,
    path_segment: Option<&str>,
    separator: &str,
) -> CodeDisciplineViolation {
    let mut details = json!({
            "mode": mode,
            "prefix": prefix,
            "remainder": remainder,
            "separator": separator,
    });
    if let Some(path_segment) = path_segment {
        if let Some(object) = details.as_object_mut() {
            object.insert("pathSegment".to_string(), json!(path_segment));
        }
    }

    CodeDisciplineViolation {
        rule: "redundant-path-segments".to_string(),
        fix: true,
        file_path: file.relative_from_project_root.clone(),
        message: format!("file path should be normalized to {suggested_path}"),
        severity: None,
        suggested_path: Some(suggested_path.clone()),
        details,
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
