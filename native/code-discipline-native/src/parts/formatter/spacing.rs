const CONTROL_KEYWORDS_BEFORE_PAREN: [&str; 9] =
["await", "catch", "for", "if", "return", "switch", "throw", "while", "yield"];

const VALUE_KEYWORDS: [&str; 2] = ["this", "super"];

const BINARY_PUNCTUATORS: [&str; 34] = [
    "=", "+=", "-=", "*=", "/=", "%=", "**=", "&&=", "||=", "??=", "&=", "|=", "^=", "<<=",
    ">>=", ">>>=", "==", "===", "!=", "!==", "<=", ">=", "&&", "||", "??", "=>", "+", "-", "*",
    "/", "%", "**", "|", "^",
];

const PREFIX_ONLY_PUNCTUATORS: [&str; 3] = ["!", "~", "..."];

fn is_word_token(token: &ScriptToken) -> bool {
    matches!(
        token.kind,
        ScriptTokenKind::Identifier
        | ScriptTokenKind::Keyword
        | ScriptTokenKind::Number
        | ScriptTokenKind::StringLiteral
        | ScriptTokenKind::TemplateLiteral
        | ScriptTokenKind::Regex
    )
}

fn is_value_end_token(text: &str, token: &ScriptToken) -> bool {
    match token.kind {
        ScriptTokenKind::Identifier
        | ScriptTokenKind::Number
        | ScriptTokenKind::StringLiteral
        | ScriptTokenKind::TemplateLiteral
        | ScriptTokenKind::Regex => true,
        ScriptTokenKind::Keyword => VALUE_KEYWORDS.contains(&token_text(text, token)),
        ScriptTokenKind::Punctuator => {
            matches!(token_text(text, token), ")" | "]" | "}" | "++" | "--")
        }
        _ => false,
    }
}

fn generic_arguments_end(text: &str, tokens: &[ScriptToken], open: usize) -> Option<usize> {
    if open == 0 {
        return None;
    }
    let previous = &tokens[open - 1];
    let previous_is_name = matches!(
        previous.kind,
        ScriptTokenKind::Identifier | ScriptTokenKind::Keyword
    ) && previous.end == tokens[open].start;
    if !previous_is_name {
        return None;
    }

    let mut angle = 0_usize;
    let mut bracket = 0_usize;
    let limit = (open + 400).min(tokens.len());

    for index in open..limit {
        let token = &tokens[index];
        if token.kind != ScriptTokenKind::Punctuator {
            continue;
        }

        match token_text(text, token) {
            "(" | "[" | "{" => bracket += 1,
            ")" | "]" | "}" => {
                if bracket == 0 {
                    return None;
                }
                bracket -= 1;
            }
            "<" if bracket == 0 => angle += 1,
            value @ (">" | ">>" | ">>>") if bracket == 0 => {
                let closes = value.len();
                if angle <= closes {
                    return if angle == closes { Some(index) } else { None };
                }
                angle -= closes;
            }
            _ => {}
        }
    }

    None
}

struct SpacingContext {
    generic_depth: usize,
    ternary_pending: Vec<usize>,
    brackets: Vec<char>,
}

impl SpacingContext {
    fn new() -> Self {
        Self {
            generic_depth: 0,
            ternary_pending: vec![0],
            brackets: Vec::new(),
        }
    }

    fn push_bracket(&mut self, value: char) {
        self.brackets.push(value);
        self.ternary_pending.push(0);
    }

    fn pop_bracket(&mut self) {
        self.brackets.pop();
        if self.ternary_pending.len() > 1 {
            self.ternary_pending.pop();
        }
    }

    fn mark_ternary(&mut self) {
        if let Some(entry) = self.ternary_pending.last_mut() {
            *entry += 1;
        }
    }

    fn take_ternary(&mut self) -> bool {
        match self.ternary_pending.last_mut() {
            Some(entry) if *entry > 0 => {
                *entry -= 1;
                true
            }
            _ => false,
        }
    }
}

fn token_signature(text: &str) -> Vec<String> {
    tokenize_script(text)
    .iter()
    .filter(|token| token.kind != ScriptTokenKind::Newline)
    .map(|token| token_text(text, token).to_string())
    .collect()
}

fn normalize_script_spacing(text: &str) -> String {
    let rewritten = rewrite_script_spacing(text);
    if token_signature(&rewritten) == token_signature(text) {
        rewritten
    } else {
        text.to_string()
    }
}

struct ScriptSpacingRewriteState {
    context: SpacingContext,
    result: String,
    previous_index: Option<usize>,
    previous_was_binary: bool,
    previous_was_ternary_colon: bool,
}

impl ScriptSpacingRewriteState {
    fn new(capacity: usize) -> Self {
        Self {
            context: SpacingContext::new(),
            result: String::with_capacity(capacity),
            previous_index: None,
            previous_was_binary: false,
            previous_was_ternary_colon: false,
        }
    }

    fn reset_line(&mut self) {
        self.result.push('\n');
        self.previous_index = None;
        self.previous_was_binary = false;
        self.previous_was_ternary_colon = false;
    }
}

fn rewrite_script_spacing(text: &str) -> String {
    let tokens = tokenize_script(text);
    if tokens.is_empty() {
        return text.to_string();
    }

    let (generic_opens, generic_closes) = collect_generic_spacing_markers(text, &tokens);
    let optional_markers = collect_optional_ternary_markers(text, &tokens);
    let mut state = ScriptSpacingRewriteState::new(text.len());

    for index in 0..tokens.len() {
        push_rewritten_script_spacing_token(
            &mut state,
            text,
            &tokens,
            &generic_opens,
            &generic_closes,
            &optional_markers,
            index,
        );
    }

    state.result
}

fn push_rewritten_script_spacing_token(
    state: &mut ScriptSpacingRewriteState,
    text: &str,
    tokens: &[ScriptToken],
    generic_opens: &GenericOpenMarkers,
    generic_closes: &GenericCloseMarkers,
    optional_markers: &[bool],
    index: usize,
) {
    let token = &tokens[index];
    if token.kind == ScriptTokenKind::Newline {
        state.reset_line();
        return;
    }

    let current = classify_spacing_token(
        text,
        tokens,
        generic_opens,
        generic_closes,
        optional_markers,
        index,
        state.previous_index,
        &mut state.context,
    );

    push_inter_token_space(state, text, tokens, generic_opens, generic_closes, optional_markers, index, &current);
    state.result.push_str(token_text(text, token));
    state.previous_index = Some(index);
    state.previous_was_binary = current.is_binary;
    state.previous_was_ternary_colon = current.is_ternary_colon;
}

fn push_inter_token_space(
    state: &mut ScriptSpacingRewriteState,
    text: &str,
    tokens: &[ScriptToken],
    generic_opens: &GenericOpenMarkers,
    generic_closes: &GenericCloseMarkers,
    optional_markers: &[bool],
    index: usize,
    current: &SpacingTokenState,
) {
    let Some(left_index) = state.previous_index else {
        return;
    };

    if needs_space_between(
        text,
        tokens,
        generic_opens,
        generic_closes,
        optional_markers,
        left_index,
        index,
        &state.context,
        state.previous_was_binary,
        current.is_binary,
        current.is_ternary_colon,
        state.previous_was_ternary_colon,
    ) {
        state.result.push(' ');
    }
}
