fn scan_escaped_quoted_literal(text: &str, start: usize, quote: u8) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index += 2;
            continue;
        }

        let current = bytes[index];
        index += 1;
        if current == quote {
            return index;
        }
    }

    bytes.len()
}

fn scan_backtick_literal(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index += 2;
            continue;
        }
        if bytes[index] == b'`' {
            return index + 1;
        }
        index += 1;
    }

    bytes.len()
}

fn previous_script_significant_byte(text: &str, start: usize) -> Option<(usize, u8)> {
    let bytes = text.as_bytes();
    let mut index = start;

    while index > 0 {
        index -= 1;
        if !bytes[index].is_ascii_whitespace() {
            return Some((index, bytes[index]));
        }
    }

    None
}

fn previous_script_word(text: &str, end: usize) -> &str {
    let bytes = text.as_bytes();
    let mut start = end;

    while start > 0 {
        let previous = bytes[start - 1];
        if !(previous.is_ascii_alphanumeric() || previous == b'_' || previous == b'$') {
            break;
        }
        start -= 1;
    }

    &text[start..end + 1]
}

fn is_script_regex_prefix_byte(value: u8) -> bool {
    matches!(
        value,
        b'(' | b'['
        | b'{'
        | b':'
        | b','
        | b';'
        | b'='
        | b'!'
        | b'?'
        | b'&'
        | b'|'
        | b'+'
        | b'-'
        | b'*'
        | b'~'
        | b'^'
        | b'<'
        | b'>'
    )
}

fn can_start_script_regex_literal(text: &str, start: usize) -> bool {
    let Some((previous_index, previous)) = previous_script_significant_byte(text, start) else {
        return true;
    };

    if is_script_regex_prefix_byte(previous) {
        return true;
    }

    if previous.is_ascii_alphanumeric() || previous == b'_' || previous == b'$' {
        return matches!(
            previous_script_word(text, previous_index),
            "case"
            | "delete"
            | "do"
            | "else"
            | "in"
            | "instanceof"
            | "new"
            | "of"
            | "return"
            | "throw"
            | "typeof"
            | "void"
            | "yield"
        );
    }

    false
}

fn scan_script_regex_literal(text: &str, start: usize) -> Option<usize> {
    if !can_start_script_regex_literal(text, start) {
        return None;
    }

    let bytes = text.as_bytes();
    let mut index = start + 1;
    let mut in_character_class = false;

    while index < bytes.len() {
        let current = bytes[index];
        if current == b'\n' || current == b'\r' {
            return None;
        }
        if current == b'\\' {
            index += 2;
            continue;
        }
        if current == b'[' {
            in_character_class = true;
        } else if current == b']' {
            in_character_class = false;
        } else if current == b'/' && !in_character_class {
            index += 1;
            while bytes.get(index).is_some_and(|byte| {
                    byte.is_ascii_alphanumeric() || *byte == b'_' || *byte == b'$'
            }) {
                index += 1;
            }
            return Some(index);
        }
        index += 1;
    }

    None
}

fn scan_line_comment(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 2;

    while index < bytes.len() && bytes[index] != b'\n' && bytes[index] != b'\r' {
        index += 1;
    }

    index
}

fn scan_hash_line_comment(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    while index < bytes.len() && bytes[index] != b'\n' && bytes[index] != b'\r' {
        index += 1;
    }

    index
}

fn scan_block_comment(text: &str, start: usize, nested: bool) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 2;
    let mut depth = 1_u32;

    while index < bytes.len() {
        if nested && bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
            depth += 1;
            index += 2;
            continue;
        }

        if bytes[index] == b'*' && bytes.get(index + 1) == Some(&b'/') {
            depth -= 1;
            index += 2;
            if depth == 0 {
                return index;
            }
            continue;
        }

        index += 1;
    }

    bytes.len()
}

fn push_slash_comment_range(
    text: &str,
    ranges: &mut Vec<CommentRange>,
    index: &mut usize,
    current: u8,
    next: Option<u8>,
    nested_blocks: bool,
) -> bool {
    if current == b'/' && next == Some(b'/') {
        let end = scan_line_comment(text, *index);
        ranges.push(CommentRange {
                start: *index,
                end,
                kind: CommentKind::Line,
        });
        *index = end;
        return true;
    }

    if current == b'/' && next == Some(b'*') {
        let end = scan_block_comment(text, *index, nested_blocks);
        ranges.push(CommentRange {
                start: *index,
                end,
                kind: CommentKind::Block,
        });
        *index = end;
        return true;
    }

    false
}

fn collect_c_like_comment_ranges(
    text: &str,
    keep_backtick_literal: bool,
    nested_blocks: bool,
    regex_literals: bool,
) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if regex_literals && current == b'/' && next != Some(b'/') && next != Some(b'*') {
            if let Some(end) = scan_script_regex_literal(text, index) {
                index = end;
                continue;
            }
        }

        if push_slash_comment_range(text, &mut ranges, &mut index, current, next, nested_blocks) {
            continue;
        }

        if current == b'"' || current == b'\'' {
            index = scan_escaped_quoted_literal(text, index, current);
            continue;
        }

        if keep_backtick_literal && current == b'`' {
            index = scan_backtick_literal(text, index);
            continue;
        }

        index += 1;
    }

    ranges
}

fn collect_comment_ranges(text: &str, extension: &str) -> Vec<CommentRange> {
    if is_ts_family_extension(extension) {
        return collect_c_like_comment_ranges(text, true, false, true);
    }

    if is_go_extension(extension) {
        return collect_c_like_comment_ranges(text, true, false, false);
    }

    if is_rust_extension(extension) {
        return collect_rust_comment_ranges(text);
    }

    if is_cpp_extension(extension) {
        return collect_cpp_comment_ranges(text);
    }

    if is_csharp_extension(extension) {
        return collect_csharp_comment_ranges(text);
    }

    if is_python_extension(extension) {
        return collect_python_comment_ranges(text);
    }

    if is_shell_extension(extension) {
        return collect_shell_comment_ranges(text);
    }

    if is_qml_extension(extension) {
        return collect_qml_comment_ranges(text);
    }

    if is_style_extension(extension) {
        return collect_c_like_comment_ranges(text, false, false, false);
    }

    Vec::new()
}
