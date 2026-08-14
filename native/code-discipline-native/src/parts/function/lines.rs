fn strip_line_comments_and_strings(value: &str, extension: &str) -> String {
    let prepared = if is_rust_extension(extension) {
        strip_rust_lifetime_tokens(value)
    } else {
        value.to_string()
    };
    let normalized = strip_comments_and_strings(&prepared);
    normalized.lines().next().unwrap_or("").to_string()
}

fn strip_rust_lifetime_tokens(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut result = String::with_capacity(value.len());
    let mut index = 0_usize;

    while index < bytes.len() {
        if bytes[index] == b'\''
        && bytes
        .get(index + 1)
        .is_some_and(|byte| is_identifier_start_byte(*byte))
        {
            result.push(' ');
            index += 1;
            while index < bytes.len() && is_identifier_part_byte(bytes[index]) {
                result.push(' ');
                index += 1;
            }
            continue;
        }
        let character = value[index..].chars().next().unwrap_or(' ');
        result.push(character);
        index += character.len_utf8();
    }

    result
}

fn count_brace_delta(value: &str, extension: &str) -> i32 {
    let normalized = strip_line_comments_and_strings(value, extension);
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

const C_FAMILY_HEADER_EXCLUDED_LEADING_WORDS: &[&str] = &[
    "if", "else", "for", "while", "do", "switch", "case", "default", "catch", "try", "finally",
    "using", "lock", "foreach", "fixed", "checked", "unchecked", "namespace", "class", "struct",
    "enum", "interface", "return", "throw", "new", "delete", "goto", "break", "continue",
];

fn c_family_header_leading_word(trimmed: &str) -> &str {
    trimmed
    .split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_'))
    .find(|word| !word.is_empty())
    .unwrap_or("")
}

fn is_c_family_header_start(line: &str) -> bool {
    let raw = line.trim();

    if raw.is_empty() || raw.ends_with(';') || raw.ends_with(':') {
        return false;
    }
    if raw.starts_with('#')
    || raw.starts_with('[')
    || raw.starts_with('@')
    || raw.starts_with('/')
    || raw.starts_with('*')
    {
        return false;
    }
    if !raw.contains('(') {
        return false;
    }

    let trimmed = strip_line_comments_and_strings(raw, ".cpp");
    let trimmed = trimmed.trim();

    if trimmed.is_empty() || trimmed.ends_with(';') || trimmed.ends_with(':') {
        return false;
    }
    if trimmed.starts_with('#') || trimmed.starts_with('[') || trimmed.starts_with('@') {
        return false;
    }
    if !trimmed.contains('(') {
        return false;
    }

    let leading_word = c_family_header_leading_word(trimmed);
    !C_FAMILY_HEADER_EXCLUDED_LEADING_WORDS.contains(&leading_word)
}

fn header_start_matches(line: &str, extension: &str) -> bool {
    let trimmed = line.trim_start();
    if is_go_extension(extension) {
        return trimmed.starts_with("func ");
    }

    if is_cpp_extension(extension) || is_csharp_extension(extension) {
        return is_c_family_header_start(line);
    }

    is_rust_function_header_start(line)
}

fn is_rust_function_header_start(line: &str) -> bool {
    let normalized = strip_line_comments_and_strings(line, ".rs");
    let mut rest = normalized.trim_start();

    if rest.starts_with('#') {
        return false;
    }

    if let Some(value) = strip_rust_visibility(rest) {
        rest = value.trim_start();
    }

    loop {
        if let Some(value) = strip_rust_keyword(rest, "async") {
            rest = value.trim_start();
            continue;
        }
        if let Some(value) = strip_rust_keyword(rest, "unsafe") {
            rest = value.trim_start();
            continue;
        }
        if let Some(value) = strip_rust_keyword(rest, "const") {
            rest = value.trim_start();
            continue;
        }
        if let Some(value) = strip_rust_keyword(rest, "extern") {
            rest = strip_rust_abi(value.trim_start()).trim_start();
            continue;
        }
        break;
    }

    strip_rust_keyword(rest, "fn").is_some()
}

fn strip_rust_visibility(value: &str) -> Option<&str> {
    if let Some(rest) = value.strip_prefix("pub(") {
        let end = rest.find(')')?;
        return Some(&rest[end + 1..]);
    }
    strip_rust_keyword(value, "pub")
}

fn strip_rust_keyword<'a>(value: &'a str, keyword: &str) -> Option<&'a str> {
    let rest = value.strip_prefix(keyword)?;
    if rest
    .chars()
    .next()
    .is_some_and(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return None;
    }
    Some(rest)
}

fn strip_rust_abi(value: &str) -> &str {
    let Some(rest) = value.strip_prefix('"') else {
        return value;
    };
    let mut escaped = false;
    for (index, character) in rest.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '"' {
            return &rest[index + character.len_utf8()..];
        }
    }
    value
}

fn extract_c_family_function_name(header: &str) -> String {
    let stripped = strip_comments_and_strings(header);
    let Some(paren_index) = stripped.find('(') else {
        return "anonymous".to_string();
    };

    let name: String = stripped[..paren_index]
    .chars()
    .rev()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
    .collect::<Vec<_>>()
    .into_iter()
    .rev()
    .collect();

    if name.is_empty() {
        "anonymous".to_string()
    } else {
        name
    }
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

    if is_cpp_extension(extension) || is_csharp_extension(extension) {
        return extract_c_family_function_name(header);
    }

    let Some(fn_index) = normalized.find("fn ") else {
        return "anonymous".to_string();
    };
    normalized[fn_index + 3..]
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
    .collect::<String>()
}

enum FunctionLineReportKind {
    Violation,
    Warning,
}

struct FunctionLineSpan {
    kind: String,
    name: String,
    start_line: usize,
    end_line: usize,
    code_line_count: usize,
    line_count: usize,
}

fn supports_block_function_lines(extension: &str) -> bool {
    is_go_extension(extension)
    || is_rust_extension(extension)
    || is_cpp_extension(extension)
    || is_csharp_extension(extension)
}

fn collect_block_function_reports(
    file: &ScannedSourceFile,
    text: &str,
    max: usize,
    report_kind: FunctionLineReportKind,
) -> Vec<CodeDisciplineViolation> {
    if !supports_block_function_lines(&file.extension) {
        return Vec::new();
    }

    collect_block_function_spans(file, text)
    .iter()
    .filter_map(|span| create_function_line_report(file, span, max, &report_kind))
    .collect()
}

fn collect_block_function_spans(file: &ScannedSourceFile, text: &str) -> Vec<FunctionLineSpan> {
    let lines = text.lines().collect::<Vec<_>>();
    let masked_text = mask_comments_for_line_count(text, &file.extension);
    let code_line_counts = code_line_prefix_counts(&masked_text);
    let mut spans = Vec::new();
    let mut pending_header = String::new();
    let mut pending_start_line = 0_usize;
    let mut pending_brace_depth = 0_i32;
    let mut pending_name = String::new();
    let mut pending_kind = "function".to_string();

    for (index, line) in lines.iter().enumerate() {
        if !advance_block_function_state(
            file,
            line,
            index,
            &mut pending_header,
            &mut pending_start_line,
            &mut pending_name,
            &mut pending_kind,
            &mut pending_brace_depth,
        ) {
            continue;
        }
        push_completed_function_span(
            &mut spans,
            &mut pending_header,
            &mut pending_start_line,
            &mut pending_brace_depth,
            &mut pending_name,
            &mut pending_kind,
            index,
            &code_line_counts,
        );
    }

    spans
}

fn collect_simple_typescript_function_reports(
    file: &ScannedSourceFile,
    text: &str,
    max: usize,
    report_kind: FunctionLineReportKind,
) -> Vec<CodeDisciplineViolation> {
    if !is_ts_family_extension(&file.extension) || !is_simple_typescript_function_file(text) {
        return Vec::new();
    }

    collect_simple_typescript_function_spans(file, text)
    .iter()
    .filter_map(|span| create_function_line_report(file, span, max, &report_kind))
    .collect()
}

fn collect_simple_typescript_function_spans(file: &ScannedSourceFile, text: &str) -> Vec<FunctionLineSpan> {
    let lines = text.lines().collect::<Vec<_>>();
    let masked_text = mask_comments_for_line_count(text, &file.extension);
    let code_line_counts = code_line_prefix_counts(&masked_text);
    let mut spans = Vec::new();
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

        pending_brace_depth += count_brace_delta(line, &file.extension);

        if pending_brace_depth > 0 {
            continue;
        }

        let end_line = index + 1;
        spans.push(function_line_span(&pending_kind, &pending_name, pending_start_line, end_line, &code_line_counts));
        pending_kind.clear();
        pending_name.clear();
        pending_start_line = 0;
        pending_brace_depth = 0;
    }

    spans
}
