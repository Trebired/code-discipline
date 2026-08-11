fn scan_csharp_verbatim_string(text: &str, quote_start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = quote_start + 1;

    while index < bytes.len() {
        if bytes[index] == b'"' {
            if bytes.get(index + 1) == Some(&b'"') {
                index += 2;
                continue;
            }
            return index + 1;
        }
        index += 1;
    }

    bytes.len()
}

fn collect_csharp_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();
        let after_next = bytes.get(index + 2).copied();

        if current == b'@' && next == Some(b'"') {
            index = scan_csharp_verbatim_string(text, index + 1);
            continue;
        }

        if current == b'@' && next == Some(b'$') && after_next == Some(b'"') {
            index = scan_csharp_verbatim_string(text, index + 2);
            continue;
        }

        if current == b'$' && next == Some(b'@') && after_next == Some(b'"') {
            index = scan_csharp_verbatim_string(text, index + 2);
            continue;
        }

        if current == b'$' && next == Some(b'"') {
            index = scan_escaped_quoted_literal(text, index + 1, b'"');
            continue;
        }

        if current == b'"' || current == b'\'' {
            index = scan_escaped_quoted_literal(text, index, current);
            continue;
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
