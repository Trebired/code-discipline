fn is_python_string_prefix_byte(value: u8) -> bool {
    matches!(value.to_ascii_lowercase(), b'b' | b'f' | b'r' | b'u')
}

fn scan_python_string_literal(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut quote_index = start;
    if bytes.get(start) != Some(&b'"') && bytes.get(start) != Some(&b'\'') {
        if !bytes.get(start).copied().is_some_and(is_python_string_prefix_byte) {
            return None;
        }
        while bytes
        .get(quote_index)
        .copied()
        .is_some_and(is_python_string_prefix_byte)
        {
            quote_index += 1;
        }
        if quote_index - start > 3
        || (bytes.get(quote_index) != Some(&b'"') && bytes.get(quote_index) != Some(&b'\''))
        {
            return None;
        }
    }

    let quote = bytes[quote_index];
    let triple = bytes.get(quote_index + 1) == Some(&quote)
    && bytes.get(quote_index + 2) == Some(&quote);
    if !triple {
        return Some(scan_escaped_quoted_literal(text, quote_index, quote));
    }

    let mut index = quote_index + 3;
    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index += 2;
            continue;
        }
        if bytes[index] == quote
        && bytes.get(index + 1) == Some(&quote)
        && bytes.get(index + 2) == Some(&quote)
        {
            return Some(index + 3);
        }
        index += 1;
    }
    Some(bytes.len())
}

fn is_protected_python_hash_comment(text: &str, start: usize) -> bool {
    let bytes = text.as_bytes();
    if start == 0 && bytes.get(start + 1) == Some(&b'!') {
        return true;
    }
    let line_start = text[..start]
    .rfind('\n')
    .map(|index| index + 1)
    .unwrap_or(0);
    let line_number = text[..line_start]
    .bytes()
    .filter(|byte| *byte == b'\n')
    .count()
    + 1;
    if line_number > 2 {
        return false;
    }
    let line_end = scan_hash_line_comment(text, start);
    let comment = &text[start..line_end];
    comment.contains("coding:") || comment.contains("coding=")
}

fn collect_python_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        if let Some(end) = scan_python_string_literal(text, index) {
            index = end;
            continue;
        }

        if bytes[index] == b'#' {
            let end = scan_hash_line_comment(text, index);
            if !is_protected_python_hash_comment(text, index) {
                ranges.push(CommentRange {
                        start: index,
                        end,
                        kind: CommentKind::Line,
                });
            }
            index = end;
            continue;
        }

        index += 1;
    }

    ranges
}
