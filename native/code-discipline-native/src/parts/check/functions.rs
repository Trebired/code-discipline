fn check_measure_python_indent(line: &str) -> isize {
    let mut indent = 0_isize;
    for ch in line.chars() {
        if ch == ' ' {
            indent += 1;
        } else if ch == '\t' {
            indent += 8 - indent % 8;
        } else {
            break;
        }
    }
    indent
}

fn check_update_python_triple_state(line: &str, quote: &mut Option<&'static str>) {
    let bytes = line.as_bytes();
    let mut index = 0_usize;
    while index + 2 < bytes.len() {
        let triple = &line[index..index + 3];
        if let Some(current) = quote {
            if triple == *current {
                *quote = None;
                index += 3;
                continue;
            }
            index += 1;
            continue;
        }
        if bytes[index] == b'#' {
            return;
        }
        if triple == "\"\"\"" || triple == "'''" {
            *quote = Some(if triple == "\"\"\"" { "\"\"\"" } else { "'''" });
            index += 3;
            continue;
        }
        index += 1;
    }
}

fn check_python_function_start(line: &str) -> Option<(isize, String, String)> {
    let trimmed = line.trim_start();
    let indent = check_measure_python_indent(line);
    let (kind, rest) = if let Some(rest) = trimmed.strip_prefix("async def ") {
        ("async-function", rest)
    } else if let Some(rest) = trimmed.strip_prefix("def ") {
        ("function", rest)
    } else {
        return None;
    };
    let name = rest
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
    .collect::<String>();
    if name.is_empty() || !rest[name.len()..].trim_start().starts_with('(') {
        return None;
    }
    Some((indent, kind.to_string(), name))
}

fn check_collect_python_function_spans(text: &str) -> Vec<CheckFunctionSpan> {
    let mut spans = Vec::new();
    let mut stack: Vec<(isize, String, String, usize)> = Vec::new();
    let mut quote = None;
    let lines = text.lines().collect::<Vec<_>>();
    let mut last_meaningful_line = 0_usize;

    for (index, line) in lines.iter().enumerate() {
        let line_number = index + 1;
        let inside_triple = quote.is_some();
        let start = if inside_triple { None } else { check_python_function_start(line) };
        if !inside_triple && check_python_meaningful_line(line) {
            let indent = check_measure_python_indent(line);
            check_close_python_functions(&mut stack, &mut spans, indent, last_meaningful_line.max(index));
            last_meaningful_line = line_number;
        }
        if let Some((indent, kind, name)) = start {
            stack.push((indent, kind, name, line_number));
        }
        check_update_python_triple_state(line, &mut quote);
    }
    check_close_python_functions(&mut stack, &mut spans, -1, last_meaningful_line.max(lines.len()));
    spans
}

fn check_python_meaningful_line(line: &str) -> bool {
    let trimmed = line.trim();
    !trimmed.is_empty() && !trimmed.starts_with('#')
}

fn check_close_python_functions(
    stack: &mut Vec<(isize, String, String, usize)>,
    spans: &mut Vec<CheckFunctionSpan>,
    current_indent: isize,
    end_line: usize,
) {
    while stack.last().is_some_and(|entry| current_indent <= entry.0) {
        let (_, kind, name, start_line) = stack.pop().unwrap();
        let resolved_end = start_line.max(end_line);
        spans.push(CheckFunctionSpan {
                kind,
                name,
                start_line,
                end_line: resolved_end,
                line_count: resolved_end.saturating_sub(start_line) + 1,
        });
    }
}

fn check_shell_strip_strings_and_comments(line: &str) -> String {
    let mut result = String::with_capacity(line.len());
    let mut single = false;
    let mut double = false;
    let mut backtick = false;
    let mut escaped = false;
    let chars = line.chars().collect::<Vec<_>>();
    for (index, ch) in chars.iter().enumerate() {
        if escaped {
            escaped = false;
            result.push(' ');
            continue;
        }
        if !single && *ch == '\\' {
            escaped = true;
            result.push(' ');
            continue;
        }
        if !double && !backtick && *ch == '\'' {
            single = !single;
        } else if !single && !backtick && *ch == '"' {
            double = !double;
        } else if !single && *ch == '`' {
            backtick = !backtick;
        }
        if !single && !double && !backtick && *ch == '#' && check_shell_comment_prefix(&chars, index) {
            break;
        }
        result.push(if single || double || backtick { ' ' } else { *ch });
    }
    result
}

fn check_shell_comment_prefix(chars: &[char], index: usize) -> bool {
    if index == 0 {
        return true;
    }
    matches!(
        chars[index - 1],
        '\t' | '\n' | '\r' | ' ' | '&' | '(' | ')' | ';' | '{' | '|' | '}'
    )
}

fn check_count_brace_delta_masked(line: &str) -> i32 {
    line.chars().fold(0_i32, |sum, ch| {
            if ch == '{' {
                sum + 1
            } else if ch == '}' {
                sum - 1
            } else {
                sum
            }
    })
}

fn check_shell_function_start(line: &str) -> Option<String> {
    let stripped = check_shell_strip_strings_and_comments(line);
    let trimmed = stripped.trim_start();
    let rest = trimmed.strip_prefix("function ").unwrap_or(trimmed);
    let name = rest
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
    .collect::<String>();
    if name.is_empty() {
        return None;
    }
    let tail = rest[name.len()..].trim_start();
    if tail.starts_with('{') || tail.starts_with("()") && tail[2..].trim_start().starts_with('{') {
        Some(name)
    } else {
        None
    }
}

fn check_collect_shell_function_spans(text: &str) -> Vec<CheckFunctionSpan> {
    let mut spans = Vec::new();
    let mut pending: Option<(i32, String, usize)> = None;
    for (index, line) in text.lines().enumerate() {
        if pending.is_none() {
            if let Some(name) = check_shell_function_start(line) {
                pending = Some((0, name, index + 1));
            } else {
                continue;
            }
        }
        if let Some((depth, _, _)) = pending.as_mut() {
            *depth += check_count_brace_delta_masked(&check_shell_strip_strings_and_comments(line));
            if *depth > 0 {
                continue;
            }
        }
        let (_, name, start_line) = pending.take().unwrap();
        let end_line = index + 1;
        spans.push(CheckFunctionSpan {
                kind: "function".to_string(),
                name,
                start_line,
                end_line,
                line_count: end_line.saturating_sub(start_line) + 1,
        });
    }
    spans
}

fn check_qml_function_start(line: &str, line_number: usize) -> Option<(String, String, usize)> {
    let trimmed = line.trim_start();
    if let Some(rest) = trimmed.strip_prefix("function ").or_else(|| trimmed.strip_prefix("async function ")) {
        let name = check_take_script_identifier(rest);
        if !name.is_empty() {
            return Some(("function".to_string(), name, line_number));
        }
    }
    if let Some(colon) = trimmed.find(": function") {
        let before = trimmed[..colon].split_whitespace().last().unwrap_or("");
        if !before.is_empty() {
            return Some(("function".to_string(), before.to_string(), line_number));
        }
    }
    if trimmed.starts_with("on") {
        let name = check_take_script_identifier(trimmed);
        if !name.is_empty() && trimmed[name.len()..].trim_start().starts_with(':') {
            return Some(("signal-handler".to_string(), name, line_number));
        }
    }
    None
}

fn check_take_script_identifier(value: &str) -> String {
    value
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '$')
    .collect()
}

fn check_collect_qml_function_spans(text: &str) -> Vec<CheckFunctionSpan> {
    let mut spans = Vec::new();
    let masked = strip_comments_and_strings_with(text, true);
    let mut pending: Option<(i32, bool, String, String, usize)> = None;
    for (index, line) in masked.lines().enumerate() {
        if pending.is_none() {
            if let Some((kind, name, start)) = check_qml_function_start(line, index + 1) {
                pending = Some((0, false, kind, name, start));
            } else {
                continue;
            }
        }
        if let Some((depth, seen_opening, _, _, _)) = pending.as_mut() {
            if line.contains('{') {
                *seen_opening = true;
            }
            *depth += check_count_brace_delta_masked(line);
            if !*seen_opening || *depth > 0 {
                continue;
            }
        }
        let (_, _, kind, name, start_line) = pending.take().unwrap();
        let end_line = index + 1;
        spans.push(CheckFunctionSpan {
                kind,
                name,
                start_line,
                end_line,
                line_count: end_line.saturating_sub(start_line) + 1,
        });
    }
    spans
}

fn check_collect_function_spans(file: &ScannedSourceFile, text: &str) -> Vec<CheckFunctionSpan> {
    if supports_block_function_lines(&file.extension) {
        return collect_block_function_spans(file, text)
        .into_iter()
        .map(|span| CheckFunctionSpan {
                kind: span.kind,
                name: span.name,
                start_line: span.start_line,
                end_line: span.end_line,
                line_count: span.line_count,
        })
        .collect();
    }
    if is_ts_family_extension(&file.extension) {
        return collect_simple_typescript_function_spans(file, text)
        .into_iter()
        .map(|span| CheckFunctionSpan {
                kind: span.kind,
                name: span.name,
                start_line: span.start_line,
                end_line: span.end_line,
                line_count: span.line_count,
        })
        .collect();
    }
    if is_python_extension(&file.extension) {
        return check_collect_python_function_spans(text);
    }
    if is_shell_extension(&file.extension) {
        return check_collect_shell_function_spans(text);
    }
    if is_qml_extension(&file.extension) {
        return check_collect_qml_function_spans(text);
    }
    Vec::new()
}
