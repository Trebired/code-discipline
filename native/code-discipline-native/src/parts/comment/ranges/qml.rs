fn scan_qml_literal(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let current = bytes.get(start).copied()?;
    if current == b'"' || current == b'\'' {
        return Some(scan_escaped_quoted_literal(text, start, current));
    }
    if current == b'`' {
        return Some(scan_backtick_literal(text, start));
    }
    if current == b'/'
    && bytes.get(start + 1) != Some(&b'/')
    && bytes.get(start + 1) != Some(&b'*')
    {
        return scan_script_regex_literal(text, start);
    }
    None
}

fn collect_qml_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        if let Some(end) = scan_qml_literal(text, index) {
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

        index += 1;
    }

    ranges
}
