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

fn code_line_prefix_counts(masked_text: &str) -> Vec<usize> {
    let mut counts = Vec::new();
    let mut current = 0_usize;
    counts.push(current);

    for line in masked_text.lines() {
        if !line.trim().is_empty() {
            current += 1;
        }
        counts.push(current);
    }

    counts
}

fn count_code_lines_from_prefix(counts: &[usize], start_line: usize, end_line: usize) -> usize {
    if counts.is_empty() || start_line == 0 || end_line < start_line {
        return 0;
    }
    let last_index = counts.len().saturating_sub(1);
    let start_index = start_line.saturating_sub(1).min(last_index);
    let end_index = end_line.min(last_index);
    counts[end_index].saturating_sub(counts[start_index])
}

fn supports_remove_comments(extension: &str) -> bool {
    is_ts_family_extension(extension)
    || is_go_extension(extension)
    || is_rust_extension(extension)
    || is_cpp_extension(extension)
    || is_csharp_extension(extension)
    || is_python_extension(extension)
    || is_shell_extension(extension)
    || is_qml_extension(extension)
    || is_style_extension(extension)
}

fn supports_redundant_path_segments_fix(extension: &str) -> bool {
    supports_remove_comments(extension)
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
    strip_comments_and_strings_with(text, false)
}

struct CommentStringStripState {
    result: String,
    index: usize,
    in_single: bool,
    in_double: bool,
    in_template: bool,
    in_block_comment: bool,
    in_line_comment: bool,
    escaped: bool,
}

impl CommentStringStripState {
    fn new(capacity: usize) -> Self {
        Self {
            result: String::with_capacity(capacity),
            index: 0,
            in_single: false,
            in_double: false,
            in_template: false,
            in_block_comment: false,
            in_line_comment: false,
            escaped: false,
        }
    }

    fn inside_string(&self) -> bool {
        self.in_single || self.in_double || self.in_template
    }

    fn outside_string(&self) -> bool {
        !self.inside_string()
    }
}

fn strip_comments_and_strings_with(text: &str, regex_literals: bool) -> String {
    let bytes = text.as_bytes();
    let mut state = CommentStringStripState::new(text.len());

    while state.index < bytes.len() {
        let current = bytes[state.index];
        if consume_active_comment(&mut state, bytes)
        || consume_regex_literal(&mut state, text, bytes, regex_literals)
        || consume_comment_start(&mut state, bytes)
        || consume_string_escape(&mut state, current)
        || consume_string_delimiter(&mut state, current)
        {
            continue;
        }
        push_visible_or_masked_character(&mut state, current);
    }

    state.result
}

fn consume_active_comment(state: &mut CommentStringStripState, bytes: &[u8]) -> bool {
    let current = bytes[state.index];
    let next = bytes.get(state.index + 1).copied();

    if state.in_line_comment {
        state.in_line_comment = current != b'\n';
        state.result.push(if current == b'\n' { '\n' } else { ' ' });
        state.index += 1;
        return true;
    }

    if !state.in_block_comment {
        return false;
    }

    if current == b'*' && next == Some(b'/') {
        state.in_block_comment = false;
        state.result.push_str("  ");
        state.index += 2;
    } else {
        state.result.push(if current == b'\n' { '\n' } else { ' ' });
        state.index += 1;
    }
    true
}

fn consume_regex_literal(
    state: &mut CommentStringStripState,
    text: &str,
    bytes: &[u8],
    regex_literals: bool,
) -> bool {
    let current = bytes[state.index];
    let next = bytes.get(state.index + 1).copied();
    let can_start_regex = regex_literals
    && state.outside_string()
    && current == b'/'
    && next != Some(b'/')
    && next != Some(b'*');

    if !can_start_regex {
        return false;
    }

    let Some(end) = scan_script_regex_literal(text, state.index) else {
        return false;
    };

    for byte in &bytes[state.index..end] {
        state.result.push(if *byte == b'\n' { '\n' } else { ' ' });
    }
    state.index = end;
    true
}

fn consume_comment_start(state: &mut CommentStringStripState, bytes: &[u8]) -> bool {
    let current = bytes[state.index];
    let next = bytes.get(state.index + 1).copied();

    if !state.outside_string() || current != b'/' {
        return false;
    }

    match next {
        Some(b'/') => state.in_line_comment = true,
        Some(b'*') => state.in_block_comment = true,
        _ => return false,
    }

    state.result.push_str("  ");
    state.index += 2;
    true
}

fn consume_string_escape(state: &mut CommentStringStripState, current: u8) -> bool {
    if state.escaped {
        state.escaped = false;
        state.result.push(' ');
        state.index += 1;
        return true;
    }

    if state.inside_string() && current == b'\\' {
        state.escaped = true;
        state.result.push(' ');
        state.index += 1;
        return true;
    }

    false
}

fn consume_string_delimiter(state: &mut CommentStringStripState, current: u8) -> bool {
    match current {
        b'\'' if !state.in_double && !state.in_template => state.in_single = !state.in_single,
        b'"' if !state.in_single && !state.in_template => state.in_double = !state.in_double,
        b'`' if !state.in_single && !state.in_double => state.in_template = !state.in_template,
        _ => return false,
    }

    state.result.push(' ');
    state.index += 1;
    true
}

fn push_visible_or_masked_character(state: &mut CommentStringStripState, current: u8) {
    if state.inside_string() {
        state.result.push(if current == b'\n' { '\n' } else { ' ' });
    } else {
        state.result.push(current as char);
    }
    state.index += 1;
}
