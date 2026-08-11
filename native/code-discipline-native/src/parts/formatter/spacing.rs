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

fn looks_like_generic_arguments(text: &str, tokens: &[ScriptToken], open: usize) -> bool {
    generic_arguments_end(text, tokens, open).is_some()
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

fn needs_space_between(
    text: &str,
    tokens: &[ScriptToken],
    generic_opens: &[Option<(usize, bool)>],
    generic_closes: &[Option<bool>],
    optional_markers: &[bool],
    left_index: usize,
    right_index: usize,
    context: &SpacingContext,
    left_is_binary: bool,
    right_is_binary: bool,
    right_is_ternary_colon: bool,
    left_is_ternary_colon: bool,
) -> bool {
    let left = &tokens[left_index];
    let right = &tokens[right_index];
    let left_text = token_text(text, left);
    let right_text = token_text(text, right);

    if right.kind == ScriptTokenKind::LineComment || right.kind == ScriptTokenKind::BlockComment {
        return true;
    }
    if left.kind == ScriptTokenKind::BlockComment {
        return true;
    }

    if optional_markers[left_index] || optional_markers[right_index] {
        return false;
    }

    if generic_opens[right_index].is_some()
        || generic_opens[left_index].is_some()
        || generic_closes[right_index].is_some()
    {
        return false;
    }

    if context.generic_depth > 0 {
        if right_text == "," {
            return false;
        }
        if left_text == "," {
            return true;
        }
        return is_word_token(left) && is_word_token(right);
    }

    if matches!(right_text, "," | ";") {
        return false;
    }
    if matches!(left_text, "," | ";") {
        return true;
    }

    if left_text == "." || right_text == "." || left_text == "?." || right_text == "?." {
        return false;
    }

    if right_is_ternary_colon || left_is_ternary_colon {
        return true;
    }
    if right_text == ":" {
        return false;
    }
    if left_text == ":" {
        return true;
    }

    if left.kind == ScriptTokenKind::Punctuator && PREFIX_ONLY_PUNCTUATORS.contains(&left_text) {
        return false;
    }

    if left_text == "?" && left.kind == ScriptTokenKind::Punctuator {
        return true;
    }
    if right_text == "?" && right.kind == ScriptTokenKind::Punctuator {
        return true;
    }

    if right_text == "(" {
        if left.kind == ScriptTokenKind::Keyword {
            return CONTROL_KEYWORDS_BEFORE_PAREN.contains(&left_text);
        }
        return left_is_binary;
    }

    if matches!(left_text, "(" | "[") {
        return false;
    }
    if matches!(right_text, ")" | "]") {
        return false;
    }
    if right_text == "[" {
        return left.kind == ScriptTokenKind::Keyword || left_is_binary;
    }

    if matches!(left_text, ")" | "]") && is_word_token(right) {
        return true;
    }

    if right_text == "{" {
        return !matches!(left_text, "(" | "[" | "!");
    }
    if left_text == "{" {
        return right_text != "}";
    }
    if right_text == "}" {
        return true;
    }
    if left_text == "}" {
        return !matches!(right_text, ")" | "]" | ";" | ",");
    }

    if left_is_binary || right_is_binary {
        return true;
    }

    if matches!(left_text, "++" | "--") && left.kind == ScriptTokenKind::Punctuator {
        return false;
    }
    if matches!(right_text, "++" | "--") {
        return false;
    }

    let left_is_word = matches!(
        left.kind,
        ScriptTokenKind::Identifier | ScriptTokenKind::Keyword | ScriptTokenKind::Number
    );
    let right_is_word = matches!(
        right.kind,
        ScriptTokenKind::Identifier
            | ScriptTokenKind::Keyword
            | ScriptTokenKind::Number
            | ScriptTokenKind::StringLiteral
            | ScriptTokenKind::TemplateLiteral
            | ScriptTokenKind::Regex
    );

    if left_is_word && right_is_word {
        return true;
    }
    if left.kind == ScriptTokenKind::Keyword && !right_is_word {
        return !matches!(right_text, ")" | "]" | "}" | ";" | ",");
    }

    false
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

fn rewrite_script_spacing(text: &str) -> String {
    let tokens = tokenize_script(text);
    if tokens.is_empty() {
        return text.to_string();
    }

    let mut generic_opens: Vec<Option<(usize, bool)>> = vec![None; tokens.len()];
    let mut generic_closes: Vec<Option<bool>> = vec![None; tokens.len()];
    for index in 0..tokens.len() {
        if tokens[index].kind != ScriptTokenKind::Punctuator
            || token_text(text, &tokens[index]) != "<"
        {
            continue;
        }
        if let Some(end) = generic_arguments_end(text, &tokens, index) {
            let multiline = tokens[index..=end]
                .iter()
                .any(|token| token.kind == ScriptTokenKind::Newline);
            generic_opens[index] = Some((end, multiline));
            generic_closes[end] = Some(!multiline);
        }
    }

    let mut optional_markers = vec![false; tokens.len()];
    for index in 0..tokens.len() {
        if tokens[index].kind != ScriptTokenKind::Punctuator
            || token_text(text, &tokens[index]) != "?"
        {
            continue;
        }
        let next = (index + 1..tokens.len()).find(|candidate| {
            !matches!(
                tokens[*candidate].kind,
                ScriptTokenKind::Newline
                    | ScriptTokenKind::LineComment
                    | ScriptTokenKind::BlockComment
            )
        });
        if let Some(next) = next {
            if token_text(text, &tokens[next]) == ":" {
                optional_markers[index] = true;
            }
        }
    }

    let mut context = SpacingContext::new();
    let mut result = String::with_capacity(text.len());
    let mut previous_index: Option<usize> = None;
    let mut previous_was_binary = false;
    let mut previous_was_ternary_colon = false;

    for index in 0..tokens.len() {
        let token = &tokens[index];
        let value = token_text(text, token);

        if token.kind == ScriptTokenKind::Newline {
            result.push('\n');
            previous_index = None;
            previous_was_binary = false;
            previous_was_ternary_colon = false;
            continue;
        }

        let mut is_binary = false;
        let mut is_ternary_colon = false;

        if token.kind == ScriptTokenKind::Punctuator {
            match value {
                "<" => {
                    if let Some((_, multiline)) = generic_opens[index] {
                        if !multiline {
                            context.generic_depth += 1;
                        }
                    } else if previous_index
                        .is_some_and(|left| is_value_end_token(text, &tokens[left]))
                    {
                        is_binary = true;
                    }
                }
                ">" | ">>" | ">>>" => {
                    if let Some(compact) = generic_closes[index] {
                        if compact {
                            context.generic_depth =
                                context.generic_depth.saturating_sub(value.len());
                        }
                    } else if previous_index
                        .is_some_and(|left| is_value_end_token(text, &tokens[left]))
                    {
                        is_binary = true;
                    }
                }
                "(" | "[" | "{" => context.push_bracket(value.chars().next().unwrap_or('(')),
                ")" | "]" | "}" => context.pop_bracket(),
                "?" => {
                    if !optional_markers[index] {
                        context.mark_ternary();
                    }
                }
                ":" => is_ternary_colon = context.take_ternary(),
                _ => {
                    if BINARY_PUNCTUATORS.contains(&value) {
                        is_binary = previous_index
                            .is_some_and(|left| is_value_end_token(text, &tokens[left]))
                            || matches!(value, "=" | "=>" | "==" | "===" | "!=" | "!==");
                    }
                }
            }
        }

        if let Some(left_index) = previous_index {
            if needs_space_between(
                text,
                &tokens,
                &generic_opens,
                &generic_closes,
                &optional_markers,
                left_index,
                index,
                &context,
                previous_was_binary,
                is_binary,
                is_ternary_colon,
                previous_was_ternary_colon,
            ) {
                result.push(' ');
            }
        }

        result.push_str(value);
        previous_index = Some(index);
        previous_was_binary = is_binary;
        previous_was_ternary_colon = is_ternary_colon;
    }

    result
}
