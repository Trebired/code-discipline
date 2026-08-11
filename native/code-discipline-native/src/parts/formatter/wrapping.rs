fn split_words_for_width(content: &str, capacity: usize) -> Option<Vec<String>> {
    if capacity == 0 {
        return None;
    }

    let mut lines = Vec::new();
    let mut current = String::new();

    for word in content.split_whitespace() {
        if count_display_characters(word) > capacity {
            return None;
        }

        let next_len = if current.is_empty() {
            count_display_characters(word)
        } else {
            count_display_characters(&current) + 1 + count_display_characters(word)
        };

        if next_len > capacity && !current.is_empty() {
            lines.push(current);
            current = word.to_string();
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        }
    }

    if !current.is_empty() {
        lines.push(current);
    }

    (lines.len() > 1).then_some(lines)
}

fn has_comment_marker(text: &str) -> bool {
    text.contains("//") || text.contains("/*") || text.contains("*/")
}

fn line_comment_marker<'a>(extension: &str, trimmed: &'a str, line_number: usize) -> Option<&'a str> {
    if is_python_extension(extension) || is_shell_extension(extension) {
        if line_number == 1 && trimmed.starts_with("#!") {
            return None;
        }
        if is_python_extension(extension) && trimmed.to_lowercase().starts_with("# coding") {
            return None;
        }
        return trimmed.starts_with('#').then_some("#");
    }

    if is_ts_family_extension(extension)
    || is_go_extension(extension)
    || is_rust_extension(extension)
    || is_cpp_extension(extension)
    || is_csharp_extension(extension)
    || is_qml_extension(extension)
    {
        if trimmed.starts_with("///") {
            return Some("///");
        }
        if trimmed.starts_with("//!") {
            return Some("//!");
        }
        return trimmed.starts_with("//").then_some("//");
    }

    if is_scss_extension(extension) {
        return trimmed.starts_with("//").then_some("//");
    }

    None
}

fn wrap_comment_line(line: &str, extension: &str, line_number: usize, max: usize) -> Option<Vec<String>> {
    if count_display_characters(line) <= max {
        return None;
    }

    let indent = leading_whitespace(line);
    let trimmed = line.trim_start();
    let marker = line_comment_marker(extension, trimmed, line_number)?;
    let content = trimmed[marker.len()..].trim();
    let prefix = if content.is_empty() {
        format!("{indent}{marker}")
    } else {
        format!("{indent}{marker} ")
    };
    let capacity = max.saturating_sub(count_display_characters(&prefix));
    let wrapped = split_words_for_width(content, capacity)?;

    Some(
        wrapped
        .into_iter()
        .map(|segment| format!("{prefix}{segment}"))
        .collect(),
    )
}

fn wrap_comment_lines(
    lines: Vec<String>,
    extension: &str,
    options: &NativeFormatterOptions,
) -> Vec<String> {
    let max = options.max_characters_per_line.max(1);
    let mut wrapped_lines = Vec::with_capacity(lines.len());

    for (index, line) in lines.into_iter().enumerate() {
        if let Some(replacements) = wrap_comment_line(&line, extension, index + 1, max) {
            wrapped_lines.extend(replacements);
        } else {
            wrapped_lines.push(line);
        }
    }

    wrapped_lines
}

fn wrap_long_source_line(
    line: &str,
    extension: &str,
    line_number: usize,
    max: usize,
) -> Option<Vec<String>> {
    if count_display_characters(line) <= max {
        return None;
    }

    if let Some(replacements) = wrap_comment_line(line, extension, line_number, max) {
        return Some(replacements);
    }

    wrap_one_line_block(line, extension)
    .or_else(|| wrap_array_or_call_line(line, extension, max))
    .or_else(|| {
            is_rust_extension(extension)
            .then(|| wrap_rust_raw_string_line(line, max))
            .flatten()
    })
    .or_else(|| {
            is_python_extension(extension)
            .then(|| wrap_python_string_line(line, max))
            .flatten()
    })
    .or_else(|| wrap_js_like_concatenation_line(line, extension))
    .or_else(|| wrap_js_like_string_line(line, extension, max))
    .or_else(|| wrap_markup_line(line, extension, max))
}

fn expand_compact_source_line(line: &str, extension: &str) -> Option<Vec<String>> {
    if !is_qml_extension(extension) {
        return None;
    }

    wrap_one_line_block(line, extension)
}

fn wrap_source_lines(
    lines: Vec<String>,
    extension: &str,
    options: &NativeFormatterOptions,
) -> Vec<String> {
    let max = options.max_characters_per_line.max(1);
    let mut current = lines;

    for _ in 0..4 {
        let mut changed = false;
        let mut next = Vec::with_capacity(current.len());

        for (index, line) in current.into_iter().enumerate() {
            if let Some(replacements) = expand_compact_source_line(&line, extension) {
                changed = true;
                next.extend(replacements);
            } else if let Some(replacements) = wrap_long_source_line(&line, extension, index + 1, max) {
                changed = true;
                next.extend(replacements);
            } else {
                next.push(line);
            }
        }

        current = next;
        if !changed {
            break;
        }
    }

    current
}
