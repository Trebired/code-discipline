fn previous_qml_significant_byte(text: &str, start: usize) -> Option<(usize, u8)> {
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

fn previous_qml_word(text: &str, end: usize) -> &str {
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

fn is_qml_regex_prefix_byte(value: u8) -> bool {
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

fn can_start_qml_regex_literal(text: &str, start: usize) -> bool {
    let Some((previous_index, previous)) = previous_qml_significant_byte(text, start) else {
        return true;
    };

    if is_qml_regex_prefix_byte(previous) {
        return true;
    }

    if previous.is_ascii_alphanumeric() || previous == b'_' || previous == b'$' {
        return matches!(
            previous_qml_word(text, previous_index),
            "case" | "delete" | "in" | "new" | "of" | "return" | "throw" | "typeof" | "void" | "yield"
        );
    }

    false
}

fn scan_qml_regex_literal(text: &str, start: usize) -> Option<usize> {
    if !can_start_qml_regex_literal(text, start) {
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
        return scan_qml_regex_literal(text, start);
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
