fn reset_pending_function_state(
    pending_header: &mut String,
    pending_start_line: &mut usize,
    pending_brace_depth: &mut i32,
    pending_name: &mut String,
    pending_kind: &mut String,
) {
    pending_header.clear();
    *pending_start_line = 0;
    *pending_brace_depth = 0;
    pending_name.clear();
    *pending_kind = "function".to_string();
}

fn function_line_span(
    kind: &str,
    name: &str,
    start_line: usize,
    end_line: usize,
    code_line_counts: &[usize],
) -> FunctionLineSpan {
    FunctionLineSpan {
        kind: kind.to_string(),
        name: safe_function_name(name),
        start_line,
        end_line,
        code_line_count: count_code_lines_from_prefix(code_line_counts, start_line, end_line),
        line_count: end_line - start_line + 1,
    }
}

fn safe_function_name(name: &str) -> String {
    if name.is_empty() {
        "anonymous".to_string()
    } else {
        name.to_string()
    }
}

fn update_pending_block_function(
    file: &ScannedSourceFile,
    line: &str,
    pending_header: &mut String,
    pending_start_line: &mut usize,
    pending_name: &mut String,
    pending_kind: &mut String,
    index: usize,
) -> bool {
    if pending_header.is_empty() {
        if !header_start_matches(line, &file.extension) {
            return false;
        }
        *pending_header = line.to_string();
        *pending_start_line = index + 1;
        *pending_kind = if is_go_extension(&file.extension) && line.contains("func (") {
            "method".to_string()
        } else {
            "function".to_string()
        };
        *pending_name = extract_function_name(pending_header, &file.extension);
        return true;
    }

    pending_header.push('\n');
    pending_header.push_str(line);
    if pending_name.is_empty() {
        *pending_name = extract_function_name(pending_header, &file.extension);
    }
    true
}

fn should_continue_pending_block_function(
    line: &str,
    pending_brace_depth: i32,
    extension: &str,
) -> bool {
    pending_brace_depth == 0
    && !strip_line_comments_and_strings(line, extension).contains('{')
}

fn pending_block_function_ended_without_body(line: &str, pending_brace_depth: i32, extension: &str) -> bool {
    if pending_brace_depth != 0 {
        return false;
    }
    let normalized = strip_line_comments_and_strings(line, extension);
    let before_body = normalized.split('{').next().unwrap_or(&normalized);
    before_body.contains(';')
}

fn advance_block_function_state(
    file: &ScannedSourceFile,
    line: &str,
    index: usize,
    pending_header: &mut String,
    pending_start_line: &mut usize,
    pending_name: &mut String,
    pending_kind: &mut String,
    pending_brace_depth: &mut i32,
) -> bool {
    if !update_pending_block_function(file, line, pending_header, pending_start_line, pending_name, pending_kind, index) {
        return false;
    }
    if pending_block_function_ended_without_body(line, *pending_brace_depth, &file.extension) {
        reset_pending_function_state(
            pending_header,
            pending_start_line,
            pending_brace_depth,
            pending_name,
            pending_kind,
        );
        return false;
    }
    if should_continue_pending_block_function(line, *pending_brace_depth, &file.extension) {
        return false;
    }
    *pending_brace_depth += count_brace_delta(line, &file.extension);
    true
}

fn push_completed_function_span(
    spans: &mut Vec<FunctionLineSpan>,
    pending_header: &mut String,
    pending_start_line: &mut usize,
    pending_brace_depth: &mut i32,
    pending_name: &mut String,
    pending_kind: &mut String,
    index: usize,
    code_line_counts: &[usize],
) {
    if *pending_brace_depth > 0 {
        return;
    }

    let end_line = index + 1;
    spans.push(function_line_span(
            pending_kind,
            pending_name,
            *pending_start_line,
            end_line,
            code_line_counts,
    ));
    reset_pending_function_state(
        pending_header,
        pending_start_line,
        pending_brace_depth,
        pending_name,
        pending_kind,
    );
}

fn create_function_line_report(
    file: &ScannedSourceFile,
    span: &FunctionLineSpan,
    max: usize,
    report_kind: &FunctionLineReportKind,
) -> Option<CodeDisciplineViolation> {
    match report_kind {
        FunctionLineReportKind::Violation if span.code_line_count > max => Some(create_max_function_lines_violation(
                file,
                &span.kind,
                &span.name,
                span.code_line_count,
                max,
                span.start_line,
                span.end_line,
        )),
        FunctionLineReportKind::Warning if span.code_line_count <= max && span.line_count > max => Some(create_max_function_lines_warning(
                file,
                &span.kind,
                &span.name,
                span.line_count,
                span.code_line_count,
                max,
                span.start_line,
                span.end_line,
        )),
        _ => None,
    }
}
