fn mask_formatter_range(result: &mut String, text: &str, start: usize, end: usize) {
    for ch in text[start..end].chars() {
        result.push(if ch == '\n' || ch == '\r' { ch } else { ' ' });
    }
}

fn strip_rust_comments_and_strings_for_formatter(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut result = String::with_capacity(text.len());
    let mut index = 0_usize;
    while index < bytes.len() {
        if let Some(raw_end) = scan_rust_raw_string(text, index) {
            mask_formatter_range(&mut result, text, index, raw_end);
            index = raw_end;
            continue;
        }
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();
        if current == b'b' && (next == Some(b'"') || next == Some(b'\'')) {
            let end = scan_escaped_quoted_literal(text, index + 1, next.unwrap());
            result.push(' ');
            mask_formatter_range(&mut result, text, index + 1, end);
            index = end;
            continue;
        }
        if current == b'"' {
            let end = scan_escaped_quoted_literal(text, index, b'"');
            mask_formatter_range(&mut result, text, index, end);
            index = end;
            continue;
        }
        if current == b'\'' {
            if let Some(char_end) = scan_rust_char_literal(text, index) {
                mask_formatter_range(&mut result, text, index, char_end);
                index = char_end;
                continue;
            }
        }
        if current == b'/' && next == Some(b'/') {
            let end = scan_line_comment(text, index);
            mask_formatter_range(&mut result, text, index, end);
            index = end;
            continue;
        }
        if current == b'/' && next == Some(b'*') {
            let end = scan_block_comment(text, index, true);
            mask_formatter_range(&mut result, text, index, end);
            index = end;
            continue;
        }
        result.push(current as char);
        index += 1;
    }
    result
}

fn strip_comments_and_strings_for_formatter(text: &str, extension: &str) -> String {
    if is_rust_extension(extension) {
        strip_rust_comments_and_strings_for_formatter(text)
    } else {
        strip_comments_and_strings(text)
    }
}

fn continues_formatter_expression(masked_trimmed: &str) -> bool {
    let trimmed = masked_trimmed.trim_end();
    trimmed.ends_with('+') || trimmed.ends_with("&&") || trimmed.ends_with("||")
}
