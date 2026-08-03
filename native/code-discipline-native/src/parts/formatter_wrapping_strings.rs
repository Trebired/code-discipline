fn split_literal_for_width(content: &str, first_capacity: usize, next_capacity: usize) -> Option<Vec<String>> {
    if first_capacity == 0 || next_capacity == 0 {
        return None;
    }

    let chars: Vec<char> = content.chars().collect();
    let mut lines = Vec::new();
    let mut start = 0_usize;

    while start < chars.len() {
        let capacity = if lines.is_empty() {
            first_capacity
        } else {
            next_capacity
        };
        let remaining = chars.len() - start;

        if remaining <= capacity {
            lines.push(chars[start..].iter().collect());
            break;
        }

        let limit = (start + capacity).min(chars.len());
        let mut split_end = limit;

        for index in (start + 1..limit).rev() {
            if chars[index].is_whitespace() {
                split_end = index + 1;
                break;
            }
        }

        if split_end <= start {
            return None;
        }

        lines.push(chars[start..split_end].iter().collect());
        start = split_end;
    }

    (lines.len() > 1).then_some(lines)
}

fn find_simple_quoted_span(line: &str, quotes: &[char]) -> Option<(usize, usize, char)> {
    let chars: Vec<(usize, char)> = line.char_indices().collect();
    let mut index = 0_usize;

    while index < chars.len() {
        let (start, quote) = chars[index];
        if !quotes.contains(&quote) {
            index += 1;
            continue;
        }
        if line[start..].starts_with(&format!("{quote}{quote}{quote}")) {
            index += 3;
            continue;
        }

        let mut escaped = false;
        for (end, ch) in chars.iter().skip(index + 1) {
            if escaped {
                escaped = false;
                continue;
            }
            if *ch == '\\' {
                escaped = true;
                continue;
            }
            if *ch == quote {
                return Some((start, end + quote.len_utf8(), quote));
            }
            if *ch == '\n' || *ch == '\r' {
                return None;
            }
        }

        return None;
    }

    None
}

fn is_import_like_line(trimmed: &str) -> bool {
    trimmed.starts_with("import ")
        || trimmed.starts_with("export *")
        || trimmed.starts_with("export {")
        || trimmed.contains(" from \"")
        || trimmed.contains(" from '")
}

fn wrap_js_like_string_line(line: &str, extension: &str, max: usize) -> Option<Vec<String>> {
    if !(is_ts_family_extension(extension) || is_qml_extension(extension)) {
        return None;
    }

    let trimmed = line.trim_start();
    if is_import_like_line(trimmed) {
        return None;
    }

    let (start, end, quote) = find_simple_quoted_span(line, &['"', '\''])?;
    let prefix = &line[..start];
    let raw = &line[start..end];
    let suffix = &line[end..];

    if prefix.trim().is_empty() && suffix.trim().is_empty() {
        return None;
    }
    if raw[1..raw.len().saturating_sub(1)].contains('\\') || has_comment_marker(suffix) {
        return None;
    }

    let value = &raw[1..raw.len().saturating_sub(1)];
    let indent = leading_whitespace(line);
    let continuation_indent = format!("{indent}  ");
    let first_capacity = max.saturating_sub(count_display_characters(prefix) + 4);
    let next_capacity = max.saturating_sub(count_display_characters(&continuation_indent) + 4);
    let segments = split_literal_for_width(value, first_capacity, next_capacity)?;
    let mut output = Vec::with_capacity(segments.len());

    for (index, segment) in segments.iter().enumerate() {
        let current_prefix = if index == 0 {
            prefix.to_string()
        } else {
            continuation_indent.clone()
        };
        let current_suffix = if index == segments.len() - 1 {
            suffix.to_string()
        } else {
            " +".to_string()
        };
        output.push(format!("{current_prefix}{quote}{segment}{quote}{current_suffix}"));
    }

    output
        .iter()
        .all(|item| count_display_characters(item) <= max)
        .then_some(output)
}

fn wrap_python_string_line(line: &str, max: usize) -> Option<Vec<String>> {
    let (start, end, quote) = find_simple_quoted_span(line, &['"', '\''])?;
    let prefix = &line[..start];
    let raw = &line[start..end];
    let suffix = &line[end..];

    if raw[1..raw.len().saturating_sub(1)].contains('\\') || has_comment_marker(suffix) {
        return None;
    }

    let trimmed_suffix = suffix.trim();
    if !matches!(trimmed_suffix, "" | "," | ")" | "]," | "},") {
        return None;
    }

    let value = &raw[1..raw.len().saturating_sub(1)];
    let indent = leading_whitespace(line);
    let continuation_indent = format!("{indent}    ");
    let capacity = max.saturating_sub(count_display_characters(&continuation_indent) + 2);
    let segments = split_literal_for_width(value, capacity, capacity)?;
    let mut output = Vec::with_capacity(segments.len() + 2);

    output.push(format!("{prefix}("));
    output.extend(
        segments
            .iter()
            .map(|segment| format!("{continuation_indent}{quote}{segment}{quote}")),
    );
    output.push(format!("{indent}){suffix}"));

    output
        .iter()
        .all(|item| count_display_characters(item) <= max)
        .then_some(output)
}

fn find_rust_raw_string_span(line: &str) -> Option<(usize, usize, usize, usize)> {
    let bytes = line.as_bytes();
    let mut index = 0_usize;

    while index < bytes.len() {
        if bytes[index] != b'r' {
            index += 1;
            continue;
        }

        let mut cursor = index + 1;
        while cursor < bytes.len() && bytes[cursor] == b'#' {
            cursor += 1;
        }
        if cursor >= bytes.len() || bytes[cursor] != b'"' {
            index += 1;
            continue;
        }

        let hashes = cursor - index - 1;
        let content_start = cursor + 1;
        let close = format!("\"{}", "#".repeat(hashes));
        if let Some(relative_end) = line[content_start..].find(&close) {
            let content_end = content_start + relative_end;
            return Some((index, content_start, content_end, content_end + close.len()));
        }

        return None;
    }

    None
}

fn wrap_rust_raw_string_line(line: &str, max: usize) -> Option<Vec<String>> {
    let (start, content_start, content_end, end) = find_rust_raw_string_span(line)?;
    let prefix = &line[..start];
    let raw_start = &line[start..content_start];
    let raw_end = &line[content_end..end];
    let suffix = &line[end..];
    let content = &line[content_start..content_end];

    if content.is_empty() || prefix.trim_end().ends_with("concat!(") {
        return None;
    }

    let indent = leading_whitespace(line);
    let continuation_indent = format!("{indent}    ");
    let segment_capacity = max.saturating_sub(
        count_display_characters(&continuation_indent)
            + count_display_characters(raw_start)
            + count_display_characters(raw_end)
            + 1,
    );
    let segments = split_literal_for_width(content, segment_capacity, segment_capacity)?;
    let mut output = Vec::with_capacity(segments.len() + 2);

    output.push(format!("{prefix}concat!("));
    for (index, segment) in segments.iter().enumerate() {
        let comma = if index == segments.len() - 1 { "" } else { "," };
        output.push(format!("{continuation_indent}{raw_start}{segment}{raw_end}{comma}"));
    }
    output.push(format!("{indent}){suffix}"));

    output
        .iter()
        .all(|item| count_display_characters(item) <= max)
        .then_some(output)
}
