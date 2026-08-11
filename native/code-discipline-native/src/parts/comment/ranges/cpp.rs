fn scan_cpp_raw_string_delimiter_end(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = start;

    while index < bytes.len() && index < start + 16 {
        match bytes[index] {
            b'(' => return Some(index),
            b')' | b'\\' | b' ' | b'\t' | b'\n' | b'\r' => return None,
            _ => index += 1,
        }
    }

    None
}

fn scan_cpp_raw_string(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    if bytes.get(start) != Some(&b'R') || bytes.get(start + 1) != Some(&b'"') {
        return None;
    }

    let delimiter_start = start + 2;
    let paren_index = scan_cpp_raw_string_delimiter_end(text, delimiter_start)?;
    let delimiter = &text[delimiter_start..paren_index];
    let mut close = String::from(")");
    close.push_str(delimiter);
    close.push('"');

    Some(text[paren_index..].find(&close).map_or(bytes.len(), |relative_end| {
        paren_index + relative_end + close.len()
    }))
}

fn collect_cpp_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        if let Some(end) = scan_cpp_raw_string(text, index) {
            index = end;
            continue;
        }

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
            let end = scan_block_comment(text, index, false);
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

        index += 1;
    }

    ranges
}
