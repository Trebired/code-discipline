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

fn scan_csharp_string_literal(text: &str, index: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let current = bytes[index];
    let next = bytes.get(index + 1).copied();
    let after_next = bytes.get(index + 2).copied();

    if current == b'@' && next == Some(b'"') {
        return Some(scan_csharp_verbatim_string(text, index + 1));
    }
    if current == b'@' && next == Some(b'$') && after_next == Some(b'"') {
        return Some(scan_csharp_verbatim_string(text, index + 2));
    }
    if current == b'$' && next == Some(b'@') && after_next == Some(b'"') {
        return Some(scan_csharp_verbatim_string(text, index + 2));
    }
    if current == b'$' && next == Some(b'"') {
        return Some(scan_escaped_quoted_literal(text, index + 1, b'"'));
    }
    if current == b'"' || current == b'\'' {
        return Some(scan_escaped_quoted_literal(text, index, current));
    }

    None
}

fn collect_csharp_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();
        if let Some(end) = scan_csharp_string_literal(text, index) {
            index = end;
            continue;
        }

        if push_slash_comment_range(text, &mut ranges, &mut index, current, next, false) {
            continue;
        }

        index += 1;
    }

    ranges
}
