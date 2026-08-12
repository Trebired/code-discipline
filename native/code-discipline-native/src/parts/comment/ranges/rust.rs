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

    let hash_count = count_rust_raw_string_hashes(bytes, &mut index);
    if bytes.get(index) != Some(&b'"') {
        return None;
    }

    Some(scan_rust_raw_string_end(bytes, index + 1, hash_count))
}

fn count_rust_raw_string_hashes(bytes: &[u8], index: &mut usize) -> usize {
    let mut hash_count = 0_usize;
    while bytes.get(*index) == Some(&b'#') {
        hash_count += 1;
        *index += 1;
    }
    hash_count
}

fn scan_rust_raw_string_end(bytes: &[u8], mut index: usize, hash_count: usize) -> usize {
    while index < bytes.len() {
        if bytes[index] == b'"' && rust_raw_string_hashes_match(bytes, index, hash_count) {
            return index + 1 + hash_count;
        }

        index += 1;
    }

    bytes.len()
}

fn rust_raw_string_hashes_match(bytes: &[u8], quote_index: usize, hash_count: usize) -> bool {
    (0..hash_count).all(|hash_index| bytes.get(quote_index + 1 + hash_index) == Some(&b'#'))
}

fn scan_rust_char_literal(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    if index >= bytes.len() || bytes[index] == b'\n' || bytes[index] == b'\r' {
        return None;
    }

    index = scan_rust_char_body(bytes, index)?;
    if bytes.get(index) == Some(&b'\'') {
        Some(index + 1)
    } else {
        None
    }
}

fn scan_rust_char_body(bytes: &[u8], mut index: usize) -> Option<usize> {
    if bytes[index] != b'\\' {
        return Some(index + 1);
    }

    index += 1;
    if index >= bytes.len() {
        return Some(bytes.len());
    }

    if bytes[index] == b'u' && bytes.get(index + 1) == Some(&b'{') {
        return Some(scan_rust_unicode_escape(bytes, index + 2));
    }

    Some(index + 1)
}

fn scan_rust_unicode_escape(bytes: &[u8], mut index: usize) -> usize {
    while index < bytes.len() && bytes[index] != b'}' {
        index += 1;
    }
    if index < bytes.len() {
        index + 1
    } else {
        index
    }
}

fn collect_rust_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        if let Some(next_index) = scan_rust_non_comment_literal(text, index) {
            index = next_index;
            continue;
        }

        let current = bytes[index];
        let next = bytes.get(index + 1).copied();
        if push_slash_comment_range(text, &mut ranges, &mut index, current, next, true) {
            continue;
        }

        index += 1;
    }

    ranges
}

fn scan_rust_non_comment_literal(text: &str, index: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let current = bytes[index];
    let next = bytes.get(index + 1).copied();

    if let Some(raw_end) = scan_rust_raw_string(text, index) {
        return Some(raw_end);
    }
    if current == b'b' && (next == Some(b'"') || next == Some(b'\'')) {
        return Some(scan_escaped_quoted_literal(text, index + 1, next.unwrap()));
    }
    if current == b'"' {
        return Some(scan_escaped_quoted_literal(text, index, b'"'));
    }
    if current == b'\'' {
        return scan_rust_char_literal(text, index);
    }

    None
}
