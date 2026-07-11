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
    let masked_text = mask_comments_for_line_count(text, &file.extension);
    let mut violations = Vec::new();
    let mut pending_header = String::new();
    let mut pending_start_line = 0_usize;
    let mut pending_brace_depth = 0_i32;
    let mut pending_name = String::new();
    let mut pending_kind = "function".to_string();

    for (index, line) in lines.iter().enumerate() {
        if !update_pending_block_function(
            file,
            line,
            &mut pending_header,
            &mut pending_start_line,
            &mut pending_name,
            &mut pending_kind,
            index,
        ) {
            continue;
        }

        if should_continue_pending_block_function(&pending_header, pending_brace_depth) {
            continue;
        }

        pending_brace_depth += count_brace_delta(line);

        if pending_brace_depth > 0 {
            continue;
        }

        let end_line = index + 1;
        let code_line_count = count_code_lines_in_range(&masked_text, pending_start_line, end_line);
        if code_line_count > max {
            violations.push(create_max_function_lines_violation(
                file,
                &pending_kind,
                if pending_name.is_empty() {
                    "anonymous"
                } else {
                    &pending_name
                },
                code_line_count,
                max,
                pending_start_line,
                end_line,
            ));
        }

        reset_pending_function_state(
            &mut pending_header,
            &mut pending_start_line,
            &mut pending_brace_depth,
            &mut pending_name,
            &mut pending_kind,
        );
    }

    violations
}

fn collect_block_function_warnings(
    file: &ScannedSourceFile,
    text: &str,
    max: usize,
) -> Vec<CodeDisciplineViolation> {
    if !is_go_extension(&file.extension) && !is_rust_extension(&file.extension) {
        return Vec::new();
    }

    let lines = text.lines().collect::<Vec<_>>();
    let masked_text = mask_comments_for_line_count(text, &file.extension);
    let mut warnings = Vec::new();
    let mut pending_header = String::new();
    let mut pending_start_line = 0_usize;
    let mut pending_brace_depth = 0_i32;
    let mut pending_name = String::new();
    let mut pending_kind = "function".to_string();

    for (index, line) in lines.iter().enumerate() {
        if !update_pending_block_function(
            file,
            line,
            &mut pending_header,
            &mut pending_start_line,
            &mut pending_name,
            &mut pending_kind,
            index,
        ) {
            continue;
        }

        if should_continue_pending_block_function(&pending_header, pending_brace_depth) {
            continue;
        }

        pending_brace_depth += count_brace_delta(line);

        if pending_brace_depth > 0 {
            continue;
        }

        let end_line = index + 1;
        let line_count = end_line - pending_start_line + 1;
        let code_line_count = count_code_lines_in_range(&masked_text, pending_start_line, end_line);
        if code_line_count <= max && line_count > max {
            warnings.push(create_max_function_lines_warning(
                file,
                &pending_kind,
                if pending_name.is_empty() {
                    "anonymous"
                } else {
                    &pending_name
                },
                line_count,
                code_line_count,
                max,
                pending_start_line,
                end_line,
            ));
        }

        reset_pending_function_state(
            &mut pending_header,
            &mut pending_start_line,
            &mut pending_brace_depth,
            &mut pending_name,
            &mut pending_kind,
        );
    }

    warnings
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
    let masked_text = mask_comments_for_line_count(text, &file.extension);
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
        let code_line_count = count_code_lines_in_range(&masked_text, pending_start_line, end_line);
        if code_line_count > max {
            violations.push(create_max_function_lines_violation(
                file,
                &pending_kind,
                &pending_name,
                code_line_count,
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

fn collect_simple_typescript_function_warnings(
    file: &ScannedSourceFile,
    text: &str,
    max: usize,
) -> Vec<CodeDisciplineViolation> {
    if !is_ts_family_extension(&file.extension) || !is_simple_typescript_function_file(text) {
        return Vec::new();
    }

    let lines = text.lines().collect::<Vec<_>>();
    let masked_text = mask_comments_for_line_count(text, &file.extension);
    let mut warnings = Vec::new();
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
        let code_line_count = count_code_lines_in_range(&masked_text, pending_start_line, end_line);
        if code_line_count <= max && line_count > max {
            warnings.push(create_max_function_lines_warning(
                file,
                &pending_kind,
                &pending_name,
                line_count,
                code_line_count,
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

    warnings
}
