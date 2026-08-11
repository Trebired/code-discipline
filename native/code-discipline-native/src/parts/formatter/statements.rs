const CONTINUATION_PUNCTUATORS: [&str; 9] = [
    ".", "?.", "(", "[", ",", "=>", "?", ":", "&&",
];

const CONTROL_HEADER_KEYWORDS: [&str; 6] =
["catch", "for", "if", "switch", "while", "with"];

const CONTINUATION_KEYWORDS: [&str; 8] = [
    "as", "extends", "from", "implements", "in", "instanceof", "of", "satisfies",
];

const STATEMENT_END_BLOCKERS: [&str; 11] = [
    ";", "{", "(", "[", ",", ":", "=>", ".", "?.", "?", "=",
];

#[derive(Clone, Copy, PartialEq, Eq)]
enum BraceKind {
    Block,
    ObjectLiteral,
}

#[derive(Clone, Copy)]
enum ScriptEdit {
    Insert(usize),
    ReplaceQuotes(usize, usize),
}

fn opens_object_literal(tokens: &[OwnedIndexToken], open: usize) -> bool {
    let Some(previous) = previous_code_token(tokens, open) else {
        return false;
    };
    match tokens[previous].kind {
        ScriptTokenKind::Keyword => matches!(
            tokens[previous].text.as_str(),
            "return" | "typeof" | "export" | "import" | "default"
        ),
        ScriptTokenKind::Punctuator => matches!(
            tokens[previous].text.as_str(),
            "=" | "(" | "," | ":" | "[" | "=>" | "?" | "&&" | "||" | "??" | "+" | "return"
        ),
        _ => false,
    }
}

struct OwnedIndexToken {
    kind: ScriptTokenKind,
    text: String,
    start: usize,
    end: usize,
}

fn indexed_tokens(text: &str) -> Vec<OwnedIndexToken> {
    tokenize_script(text)
    .into_iter()
    .map(|token| OwnedIndexToken {
            kind: token.kind,
            text: text[token.start..token.end].to_string(),
            start: token.start,
            end: token.end,
    })
    .collect()
}

fn is_code_token(token: &OwnedIndexToken) -> bool {
    !matches!(
        token.kind,
        ScriptTokenKind::Newline | ScriptTokenKind::LineComment | ScriptTokenKind::BlockComment
    )
}

fn previous_code_token(tokens: &[OwnedIndexToken], index: usize) -> Option<usize> {
    (0..index).rev().find(|candidate| is_code_token(&tokens[*candidate]))
}

fn next_code_token(tokens: &[OwnedIndexToken], index: usize) -> Option<usize> {
    (index + 1..tokens.len()).find(|candidate| is_code_token(&tokens[*candidate]))
}

fn ends_a_value(token: &OwnedIndexToken) -> bool {
    match token.kind {
        ScriptTokenKind::Identifier
        | ScriptTokenKind::Number
        | ScriptTokenKind::StringLiteral
        | ScriptTokenKind::TemplateLiteral
        | ScriptTokenKind::Regex => true,
        ScriptTokenKind::Punctuator => matches!(token.text.as_str(), ")" | "]" | "++" | "--"),
        ScriptTokenKind::Keyword => matches!(token.text.as_str(), "this" | "super"),
        _ => false,
    }
}

fn starts_a_continuation(token: &OwnedIndexToken) -> bool {
    match token.kind {
        ScriptTokenKind::Punctuator => {
            CONTINUATION_PUNCTUATORS.contains(&token.text.as_str())
            || BINARY_PUNCTUATORS.contains(&token.text.as_str())
        }
        ScriptTokenKind::Keyword => CONTINUATION_KEYWORDS.contains(&token.text.as_str()),
        ScriptTokenKind::TemplateLiteral => true,
        _ => false,
    }
}

fn convertible_single_quoted(value: &str) -> bool {
    if !value.starts_with('\'') || value.len() < 2 || !value.ends_with('\'') {
        return false;
    }
    let inner = &value[1..value.len() - 1];
    !inner.contains('"') && !inner.contains("\\'")
}

fn collect_quote_edits(tokens: &[OwnedIndexToken], edits: &mut Vec<ScriptEdit>) {
    for token in tokens.iter() {
        if token.kind == ScriptTokenKind::StringLiteral && convertible_single_quoted(&token.text) {
            edits.push(ScriptEdit::ReplaceQuotes(token.start, token.end));
        }
    }
}

fn collect_semicolon_edits(text: &str, tokens: &[OwnedIndexToken], edits: &mut Vec<ScriptEdit>) {
    let mut brace_stack: Vec<BraceKind> = Vec::new();
    let mut paren_depth = 0_usize;
    let generic_spans = generic_regions(text, tokens);
    let header_closers = control_header_closers(tokens);

    for index in 0..tokens.len() {
        let token = &tokens[index];

        if token.kind == ScriptTokenKind::Punctuator {
            match token.text.as_str() {
                "{" => brace_stack.push(if opens_object_literal(tokens, index) {
                        BraceKind::ObjectLiteral
                    } else {
                        BraceKind::Block
                }),
                "}" => {
                    brace_stack.pop();
                }
                "(" | "[" => paren_depth += 1,
                ")" | "]" => paren_depth = paren_depth.saturating_sub(1),
                _ => {}
            }
        }

        if token.kind != ScriptTokenKind::Newline {
            continue;
        }

        if paren_depth > 0 {
            continue;
        }
        if generic_spans.iter().any(|(open, close)| index > *open && index < *close) {
            continue;
        }
        if matches!(brace_stack.last(), Some(BraceKind::ObjectLiteral)) {
            continue;
        }

        let Some(last) = previous_code_token(tokens, index) else {
            continue;
        };
        let last_token = &tokens[last];

        if last_token.kind == ScriptTokenKind::Punctuator
        && (STATEMENT_END_BLOCKERS.contains(&last_token.text.as_str())
            || BINARY_PUNCTUATORS.contains(&last_token.text.as_str()))
        {
            continue;
        }
        if last_token.kind == ScriptTokenKind::Keyword {
            continue;
        }
        if header_closers[last] {
            continue;
        }

        let closes_object_literal = last_token.kind == ScriptTokenKind::Punctuator
        && last_token.text == "}"
        && matches!(matching_brace_kind(tokens, last), Some(BraceKind::ObjectLiteral));

        if !ends_a_value(last_token) && !closes_object_literal {
            continue;
        }

        if let Some(next) = next_code_token(tokens, index) {
            if starts_a_continuation(&tokens[next]) {
                continue;
            }
        }

        edits.push(ScriptEdit::Insert(last_token.end));
    }
}

fn control_header_closers(tokens: &[OwnedIndexToken]) -> Vec<bool> {
    let mut closers = vec![false; tokens.len()];
    let mut stack: Vec<bool> = Vec::new();

    for index in 0..tokens.len() {
        let token = &tokens[index];
        if token.kind != ScriptTokenKind::Punctuator {
            continue;
        }
        if token.text == "(" {
            let mut probe = previous_code_token(tokens, index);
            while probe.is_some_and(|candidate| tokens[candidate].text == "await") {
                probe = previous_code_token(tokens, probe.unwrap_or(0));
            }
            let is_header = probe.is_some_and(|previous| {
                    tokens[previous].kind == ScriptTokenKind::Keyword
                    && CONTROL_HEADER_KEYWORDS.contains(&tokens[previous].text.as_str())
            });
            stack.push(is_header);
            continue;
        }
        if token.text == ")" {
            if let Some(is_header) = stack.pop() {
                closers[index] = is_header;
            }
        }
    }

    closers
}

fn generic_regions(text: &str, tokens: &[OwnedIndexToken]) -> Vec<(usize, usize)> {
    let plain: Vec<ScriptToken> = tokens
    .iter()
    .map(|token| ScriptToken {
            kind: token.kind,
            start: token.start,
            end: token.end,
    })
    .collect();

    (0..tokens.len())
    .filter(|index| {
            tokens[*index].kind == ScriptTokenKind::Punctuator && tokens[*index].text == "<"
    })
    .filter_map(|index| generic_arguments_end(text, &plain, index).map(|end| (index, end)))
    .collect()
}

fn matching_brace_kind(tokens: &[OwnedIndexToken], close: usize) -> Option<BraceKind> {
    let mut depth = 0_usize;
    for index in (0..=close).rev() {
        let token = &tokens[index];
        if token.kind != ScriptTokenKind::Punctuator {
            continue;
        }
        if token.text == "}" {
            depth += 1;
        } else if token.text == "{" {
            depth -= 1;
            if depth == 0 {
                return Some(if opens_object_literal(tokens, index) {
                        BraceKind::ObjectLiteral
                    } else {
                        BraceKind::Block
                });
            }
        }
    }
    None
}

fn apply_script_edits(text: &str, mut edits: Vec<ScriptEdit>) -> String {
    edits.sort_by_key(|edit| match edit {
            ScriptEdit::Insert(at) => *at,
            ScriptEdit::ReplaceQuotes(start, _) => *start,
    });

    let mut result = String::with_capacity(text.len() + edits.len());
    let mut cursor = 0_usize;

    for edit in edits.iter() {
        match *edit {
            ScriptEdit::Insert(at) => {
                if at < cursor {
                    continue;
                }
                result.push_str(&text[cursor..at]);
                result.push(';');
                cursor = at;
            }
            ScriptEdit::ReplaceQuotes(start, end) => {
                if start < cursor {
                    continue;
                }
                result.push_str(&text[cursor..start]);
                result.push('"');
                result.push_str(&text[start + 1..end - 1]);
                result.push('"');
                cursor = end;
            }
        }
    }

    result.push_str(&text[cursor..]);
    result
}

fn normalize_script_statements(text: &str) -> String {
    let tokens = indexed_tokens(text);
    if tokens.is_empty() {
        return text.to_string();
    }

    let mut edits: Vec<ScriptEdit> = Vec::new();
    collect_quote_edits(&tokens, &mut edits);
    collect_semicolon_edits(text, &tokens, &mut edits);

    if edits.is_empty() {
        return text.to_string();
    }

    apply_script_edits(text, edits)
}
