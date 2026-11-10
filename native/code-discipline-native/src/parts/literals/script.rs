#[derive(Clone, Copy)]
enum BacktickLiteral {
    Absent,
    Raw,
    Template,
}

#[derive(Clone, Copy)]
struct ScriptDialect {
    backtick: BacktickLiteral,
    prefixed_string: Option<fn(&str, usize) -> Option<usize>>,
    regex: bool,
}

fn script_dialect_for_extension(extension: &str) -> Option<ScriptDialect> {
    let plain = ScriptDialect { backtick: BacktickLiteral::Absent, prefixed_string: None, regex: false };
    if is_ts_family_extension(extension) || is_qml_extension(extension) {
        return Some(ScriptDialect { backtick: BacktickLiteral::Template, regex: true, ..plain });
    }
    if is_go_extension(extension) {
        return Some(ScriptDialect { backtick: BacktickLiteral::Raw, ..plain });
    }
    if is_cpp_extension(extension) {
        return Some(ScriptDialect { prefixed_string: Some(scan_cpp_raw_string), ..plain });
    }
    if is_csharp_extension(extension) {
        return Some(ScriptDialect { prefixed_string: Some(scan_csharp_prefixed_string), ..plain });
    }
    is_style_extension(extension).then_some(plain)
}

fn escaped_pair_width(bytes: &[u8], index: usize) -> usize {
    if bytes.get(index + 1) == Some(&b'\r') && bytes.get(index + 2) == Some(&b'\n') {
        3
    } else {
        2
    }
}

fn scan_bounded_quoted_literal(text: &str, start: usize, quote: u8) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;
    while index < bytes.len() {
        match bytes[index] {
            b'\\' => index += escaped_pair_width(bytes, index),
            b'\n' | b'\r' => return index,
            byte => {
                index += 1;
                if byte == quote {
                    return index;
                }
            }
        }
    }
    bytes.len()
}

fn scan_raw_backtick_literal(text: &str, start: usize) -> usize {
    text[start + 1..].find('`').map_or(text.len(), |offset| start + offset + 2)
}

fn scan_template_literal(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;
    while index < bytes.len() {
        match (bytes[index], bytes.get(index + 1).copied()) {
            (b'\\', _) => index += 2,
            (b'`', _) => return index + 1,
            (b'$', Some(b'{')) => index = scan_template_expression(text, index + 2),
            _ => index += 1,
        }
    }
    bytes.len()
}

fn scan_template_expression(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start;
    let mut depth = 1_usize;
    while index < bytes.len() {
        let byte = bytes[index];
        let next = bytes.get(index + 1).copied();
        index = match (byte, next) {
            (b'{', _) => {
                depth += 1;
                index + 1
            }
            (b'}', _) => {
                depth -= 1;
                if depth == 0 {
                    return index + 1;
                }
                index + 1
            }
            (b'"' | b'\'', _) => scan_bounded_quoted_literal(text, index, byte),
            (b'`', _) => scan_template_literal(text, index),
            (b'/', Some(b'/')) => scan_line_comment(text, index),
            (b'/', Some(b'*')) => scan_block_comment(text, index, false),
            _ => index + 1,
        };
    }
    bytes.len()
}

fn scan_script_span(text: &str, index: usize, dialect: ScriptDialect) -> Option<(usize, bool)> {
    let bytes = text.as_bytes();
    let current = bytes[index];
    let next = bytes.get(index + 1).copied();
    if let Some(end) = dialect.prefixed_string.and_then(|scan| scan(text, index)) {
        return Some((end, false));
    }
    match (current, next) {
        (b'/', Some(b'/')) => Some((scan_line_comment(text, index), true)),
        (b'/', Some(b'*')) => Some((scan_block_comment(text, index, false), true)),
        (b'/', _) if dialect.regex => scan_script_regex_literal(text, index).map(|end| (end, false)),
        (b'"' | b'\'', _) => Some((scan_bounded_quoted_literal(text, index, current), false)),
        (b'`', _) => match dialect.backtick {
            BacktickLiteral::Absent => None,
            BacktickLiteral::Raw => Some((scan_raw_backtick_literal(text, index), false)),
            BacktickLiteral::Template => Some((scan_template_literal(text, index), false)),
        },
        _ => None,
    }
}

fn collect_script_spans(text: &str, dialect: ScriptDialect) -> Vec<SourceSpan> {
    let mut spans = Vec::new();
    let mut index = 0_usize;
    while index < text.len() {
        match scan_script_span(text, index, dialect) {
            Some((end, is_comment)) => {
                push_span(&mut spans, text, index, end, is_comment);
                index = end.max(index + 1);
            }
            None => index += 1,
        }
    }
    spans
}
