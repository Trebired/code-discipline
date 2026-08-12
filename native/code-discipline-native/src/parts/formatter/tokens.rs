#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ScriptTokenKind {
    Identifier,
    Keyword,
    Number,
    StringLiteral,
    TemplateLiteral,
    Regex,
    Punctuator,
    LineComment,
    BlockComment,
    Newline,
}

#[derive(Clone, Debug)]
struct ScriptToken {
    kind: ScriptTokenKind,
    start: usize,
    end: usize,
}

const SCRIPT_KEYWORDS: [&str; 48] = [
    "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger",
    "declare", "default", "delete", "do", "else", "enum", "export", "extends", "finally", "for",
    "from", "function", "get", "if", "implements", "import", "in", "instanceof", "interface",
    "let", "new", "of", "readonly", "return", "satisfies", "set", "static", "switch", "this",
    "throw", "try", "type", "typeof", "var", "void", "while", "with", "yield",
];

const SCRIPT_PUNCTUATORS: [&str; 60] = [
    ">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=", "=>", "==",
    "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=",
    "|=", "^=", "**", "<<", ">>", "{", "}", "(", ")", "[", "]", ";", ",", "<", ">", "+", "-",
    "*", "/", "%", "&", "|", "^", "!", "~", "?", ":", "=", ".", "@", "#", "\\",
];

fn is_identifier_start_byte(value: u8) -> bool {
    value.is_ascii_alphabetic() || value == b'_' || value == b'$' || value >= 0x80
}

fn is_identifier_part_byte(value: u8) -> bool {
    is_identifier_start_byte(value) || value.is_ascii_digit()
}

fn scan_script_identifier(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;
    while index < bytes.len() && is_identifier_part_byte(bytes[index]) {
        index += 1;
    }
    index
}

fn scan_script_number(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start;
    while index < bytes.len() {
        let current = bytes[index];
        if current.is_ascii_alphanumeric() || current == b'.' || current == b'_' {
            index += 1;
            continue;
        }
        if (current == b'+' || current == b'-') && index > start {
            let previous = bytes[index - 1].to_ascii_lowercase();
            if previous == b'e' {
                index += 1;
                continue;
            }
        }
        break;
    }
    index
}

fn scan_script_template_literal(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;
    let mut brace_depth = 0_usize;

    while index < bytes.len() {
        let current = bytes[index];
        if current == b'\\' {
            index += 2;
            continue;
        }
        if brace_depth == 0 && current == b'`' {
            return index + 1;
        }
        if brace_depth == 0 && current == b'$' && bytes.get(index + 1) == Some(&b'{') {
            brace_depth = 1;
            index += 2;
            continue;
        }
        if brace_depth > 0 {
            if current == b'{' {
                brace_depth += 1;
            } else if current == b'}' {
                brace_depth -= 1;
            } else if current == b'"' || current == b'\'' {
                index = scan_escaped_quoted_literal(text, index, current);
                continue;
            } else if current == b'`' {
                index = scan_script_template_literal(text, index);
                continue;
            } else if current == b'/' {
                if bytes.get(index + 1) == Some(&b'/') {
                    index = scan_line_comment(text, index);
                    continue;
                }
                if bytes.get(index + 1) == Some(&b'*') {
                    index = scan_block_comment(text, index, false);
                    continue;
                }
                if let Some(end) = scan_script_regex_literal(text, index) {
                    index = end;
                    continue;
                }
            }
        }
        index += 1;
    }

    bytes.len()
}

fn regex_allowed_after(previous: Option<&ScriptToken>, text: &str) -> bool {
    let Some(token) = previous else {
        return true;
    };

    match token.kind {
        ScriptTokenKind::Identifier
        | ScriptTokenKind::Number
        | ScriptTokenKind::StringLiteral
        | ScriptTokenKind::TemplateLiteral
        | ScriptTokenKind::Regex => false,
        ScriptTokenKind::Keyword => !matches!(&text[token.start..token.end], "this"),
        ScriptTokenKind::Punctuator => {
            !matches!(&text[token.start..token.end], ")" | "]" | "}" | "++" | "--")
        }
        _ => true,
    }
}

fn scan_script_punctuator(text: &str, start: usize) -> Option<usize> {
    for candidate in SCRIPT_PUNCTUATORS.iter() {
        if text[start..].starts_with(candidate) {
            return Some(start + candidate.len());
        }
    }
    None
}

fn script_token(kind: ScriptTokenKind, start: usize, end: usize) -> ScriptToken {
    ScriptToken { kind, start, end }
}

fn scan_script_comment_or_regex_token(
    text: &str,
    tokens: &[ScriptToken],
    index: usize,
) -> Option<ScriptToken> {
    let bytes = text.as_bytes();
    let current = bytes[index];

    if current == b'/' && bytes.get(index + 1) == Some(&b'/') {
        return Some(script_token(ScriptTokenKind::LineComment, index, scan_line_comment(text, index)));
    }
    if current == b'/' && bytes.get(index + 1) == Some(&b'*') {
        return Some(script_token(ScriptTokenKind::BlockComment, index, scan_block_comment(text, index, false)));
    }
    if current == b'/' && regex_allowed_after(tokens.last(), text) {
        return scan_script_regex_literal(text, index)
        .map(|end| script_token(ScriptTokenKind::Regex, index, end));
    }

    None
}

fn scan_script_literal_or_number_token(text: &str, index: usize) -> Option<ScriptToken> {
    let bytes = text.as_bytes();
    let current = bytes[index];

    if current == b'"' || current == b'\'' {
        return Some(script_token(
                ScriptTokenKind::StringLiteral,
                index,
                scan_escaped_quoted_literal(text, index, current),
        ));
    }
    if current == b'`' {
        return Some(script_token(ScriptTokenKind::TemplateLiteral, index, scan_script_template_literal(text, index)));
    }
    if current.is_ascii_digit()
    || (current == b'.' && bytes.get(index + 1).is_some_and(u8::is_ascii_digit))
    {
        return Some(script_token(ScriptTokenKind::Number, index, scan_script_number(text, index)));
    }

    None
}

fn scan_script_word_or_punctuator_token(text: &str, index: usize) -> ScriptToken {
    let current = text.as_bytes()[index];

    if is_identifier_start_byte(current) {
        let end = scan_script_identifier(text, index);
        let kind = if SCRIPT_KEYWORDS.contains(&&text[index..end]) {
            ScriptTokenKind::Keyword
        } else {
            ScriptTokenKind::Identifier
        };
        return script_token(kind, index, end);
    }

    let end = scan_script_punctuator(text, index)
    .unwrap_or_else(|| index + char_width_at(text, index));
    script_token(ScriptTokenKind::Punctuator, index, end)
}

fn scan_next_script_token(text: &str, tokens: &[ScriptToken], index: usize) -> ScriptToken {
    scan_script_comment_or_regex_token(text, tokens, index)
    .or_else(|| scan_script_literal_or_number_token(text, index))
    .unwrap_or_else(|| scan_script_word_or_punctuator_token(text, index))
}

fn tokenize_script(text: &str) -> Vec<ScriptToken> {
    let bytes = text.as_bytes();
    let mut tokens: Vec<ScriptToken> = Vec::new();
    let mut index = 0_usize;

    if text.starts_with("#!") {
        let end = scan_line_comment(text, 0);
        tokens.push(ScriptToken {
                kind: ScriptTokenKind::LineComment,
                start: 0,
                end,
        });
        index = end;
    }

    while index < bytes.len() {
        let current = bytes[index];
        if current == b'\n' {
            tokens.push(script_token(ScriptTokenKind::Newline, index, index + 1));
            index += 1;
            continue;
        }
        if current.is_ascii_whitespace() {
            index += 1;
            continue;
        }

        let token = scan_next_script_token(text, &tokens, index);
        index = token.end;
        tokens.push(token);
    }

    tokens
}

fn char_width_at(text: &str, index: usize) -> usize {
    text[index..].chars().next().map_or(1, char::len_utf8)
}

fn token_text<'a>(text: &'a str, token: &ScriptToken) -> &'a str {
    &text[token.start..token.end]
}
