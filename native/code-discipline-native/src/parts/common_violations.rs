fn count_lines(text: &str) -> usize {
    if text.is_empty() {
        0
    } else {
        text.split('\n').count()
    }
}

fn count_code_lines(masked_text: &str, _extension: &str) -> usize {
    masked_text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count()
}

fn count_code_lines_in_range(masked_text: &str, start_line: usize, end_line: usize) -> usize {
    masked_text
        .lines()
        .enumerate()
        .filter(|(index, line)| {
            let line_number = index + 1;
            line_number >= start_line && line_number <= end_line && !line.trim().is_empty()
        })
        .count()
}

fn supports_remove_comments(extension: &str) -> bool {
    is_ts_family_extension(extension)
        || is_go_extension(extension)
        || is_rust_extension(extension)
        || is_style_extension(extension)
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

fn mask_comments_for_line_count(text: &str, extension: &str) -> String {
    let ranges = collect_comment_ranges(text, extension);
    if ranges.is_empty() {
        return text.to_string();
    }

    let mut result = String::with_capacity(text.len());
    let mut previous_end = 0_usize;

    for range in ranges {
        result.push_str(&text[previous_end..range.start]);
        for ch in text[range.start..range.end].chars() {
            result.push(if ch == '\n' || ch == '\r' { ch } else { ' ' });
        }
        previous_end = range.end;
    }

    result.push_str(&text[previous_end..]);
    result
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
