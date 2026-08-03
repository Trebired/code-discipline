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

fn collect_c_like_comment_ranges(
    text: &str,
    keep_backtick_literal: bool,
    nested_blocks: bool,
) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if current == b'/' && next == Some(b'/') {
            let end = scan_line_comment(text, index);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Line,
            });
            index = end;
            continue;
        }

        if current == b'/' && next == Some(b'*') {
            let end = scan_block_comment(text, index, nested_blocks);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Block,
            });
            index = end;
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

fn scan_rust_raw_string(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = start;

    if bytes.get(index) == Some(&b'b') {
        if bytes.get(index + 1) != Some(&b'r') {
            return None;
        }
        index += 1;
    }

    if bytes.get(index) != Some(&b'r') {
        return None;
    }
    index += 1;

    let mut hash_count = 0_usize;
    while bytes.get(index) == Some(&b'#') {
        hash_count += 1;
        index += 1;
    }

    if bytes.get(index) != Some(&b'"') {
        return None;
    }
    index += 1;

    while index < bytes.len() {
        if bytes[index] == b'"' {
            let mut matched = true;
            for hash_index in 0..hash_count {
                if bytes.get(index + 1 + hash_index) != Some(&b'#') {
                    matched = false;
                    break;
                }
            }

            if matched {
                return Some(index + 1 + hash_count);
            }
        }

        index += 1;
    }

    Some(bytes.len())
}

fn scan_rust_char_literal(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    if index >= bytes.len() || bytes[index] == b'\n' || bytes[index] == b'\r' {
        return None;
    }

    if bytes[index] == b'\\' {
        index += 1;

        if index >= bytes.len() {
            return Some(bytes.len());
        }

        if bytes[index] == b'u' && bytes.get(index + 1) == Some(&b'{') {
            index += 2;
            while index < bytes.len() && bytes[index] != b'}' {
                index += 1;
            }
            if index < bytes.len() {
                index += 1;
            }
        } else {
            index += 1;
        }
    } else {
        index += 1;
    }

    if bytes.get(index) == Some(&b'\'') {
        Some(index + 1)
    } else {
        None
    }
}

fn collect_rust_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        if let Some(raw_end) = scan_rust_raw_string(text, index) {
            index = raw_end;
            continue;
        }

        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if current == b'b' && (next == Some(b'"') || next == Some(b'\'')) {
            index = scan_escaped_quoted_literal(text, index + 1, next.unwrap());
            continue;
        }

        if current == b'"' {
            index = scan_escaped_quoted_literal(text, index, b'"');
            continue;
        }

        if current == b'\'' {
            if let Some(char_end) = scan_rust_char_literal(text, index) {
                index = char_end;
                continue;
            }
        }

        if current == b'/' && next == Some(b'/') {
            let end = scan_line_comment(text, index);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Line,
            });
            index = end;
            continue;
        }

        if current == b'/' && next == Some(b'*') {
            let end = scan_block_comment(text, index, true);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Block,
            });
            index = end;
            continue;
        }

        index += 1;
    }

    ranges
}

fn collect_comment_ranges(text: &str, extension: &str) -> Vec<CommentRange> {
    if is_ts_family_extension(extension) {
        return collect_c_like_comment_ranges(text, true, false);
    }

    if is_go_extension(extension) {
        return collect_c_like_comment_ranges(text, true, false);
    }

    if is_rust_extension(extension) {
        return collect_rust_comment_ranges(text);
    }

    if is_python_extension(extension) {
        return collect_python_comment_ranges(text);
    }

    if is_shell_extension(extension) {
        return collect_shell_comment_ranges(text);
    }

    if is_style_extension(extension) {
        return collect_c_like_comment_ranges(text, false, false);
    }

    Vec::new()
}
