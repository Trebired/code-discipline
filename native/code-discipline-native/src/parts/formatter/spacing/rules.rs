struct SpacingPair<'a> {
    left: &'a ScriptToken,
    right: &'a ScriptToken,
    left_text: &'a str,
    right_text: &'a str,
    left_is_binary: bool,
    right_is_binary: bool,
    right_is_ternary_colon: bool,
    left_is_ternary_colon: bool,
}

fn spacing_pair<'a>(
    text: &'a str,
    tokens: &'a [ScriptToken],
    left_index: usize,
    right_index: usize,
    left_is_binary: bool,
    right_is_binary: bool,
    right_is_ternary_colon: bool,
    left_is_ternary_colon: bool,
) -> SpacingPair<'a> {
    let left = &tokens[left_index];
    let right = &tokens[right_index];
    SpacingPair {
        left,
        right,
        left_text: token_text(text, left),
        right_text: token_text(text, right),
        left_is_binary,
        right_is_binary,
        right_is_ternary_colon,
        left_is_ternary_colon,
    }
}

fn spacing_for_comments_and_markers(
    pair: &SpacingPair,
    generic_opens: &[Option<(usize, bool)>],
    generic_closes: &[Option<bool>],
    optional_markers: &[bool],
    left_index: usize,
    right_index: usize,
) -> Option<bool> {
    if pair.right.kind == ScriptTokenKind::LineComment || pair.right.kind == ScriptTokenKind::BlockComment {
        return Some(true);
    }
    if pair.left.kind == ScriptTokenKind::BlockComment {
        return Some(true);
    }
    if optional_markers[left_index] || optional_markers[right_index] {
        return Some(false);
    }
    if generic_opens[right_index].is_some()
    || generic_opens[left_index].is_some()
    || generic_closes[right_index].is_some()
    {
        return Some(false);
    }

    None
}

fn spacing_for_generic_context(pair: &SpacingPair, context: &SpacingContext) -> Option<bool> {
    if context.generic_depth == 0 {
        return None;
    }
    if pair.right_text == "," {
        return Some(false);
    }
    if pair.left_text == "," {
        return Some(true);
    }
    Some(is_word_token(pair.left) && is_word_token(pair.right))
}

fn spacing_for_separators(pair: &SpacingPair) -> Option<bool> {
    if matches!(pair.right_text, "," | ";") {
        return Some(false);
    }
    if matches!(pair.left_text, "," | ";") {
        return Some(true);
    }
    if matches!(pair.left_text, "." | "?.") || matches!(pair.right_text, "." | "?.") {
        return Some(false);
    }
    if pair.right_is_ternary_colon || pair.left_is_ternary_colon {
        return Some(true);
    }
    if pair.right_text == ":" {
        return Some(false);
    }
    if pair.left_text == ":" {
        return Some(true);
    }

    None
}

fn spacing_for_prefix_and_question(pair: &SpacingPair) -> Option<bool> {
    if pair.left.kind == ScriptTokenKind::Punctuator && PREFIX_ONLY_PUNCTUATORS.contains(&pair.left_text) {
        return Some(false);
    }
    if pair.left_text == "?" && pair.left.kind == ScriptTokenKind::Punctuator {
        return Some(true);
    }
    if pair.right_text == "?" && pair.right.kind == ScriptTokenKind::Punctuator {
        return Some(true);
    }

    None
}

fn spacing_for_brackets(pair: &SpacingPair) -> Option<bool> {
    if pair.right_text == "(" {
        if pair.left.kind == ScriptTokenKind::Keyword {
            return Some(CONTROL_KEYWORDS_BEFORE_PAREN.contains(&pair.left_text));
        }
        return Some(pair.left_is_binary);
    }
    if matches!(pair.left_text, "(" | "[") || matches!(pair.right_text, ")" | "]") {
        return Some(false);
    }
    if pair.right_text == "[" {
        return Some(pair.left.kind == ScriptTokenKind::Keyword || pair.left_is_binary);
    }
    if matches!(pair.left_text, ")" | "]") && is_word_token(pair.right) {
        return Some(true);
    }

    None
}

fn spacing_for_braces(pair: &SpacingPair) -> Option<bool> {
    if pair.right_text == "{" {
        return Some(!matches!(pair.left_text, "(" | "[" | "!"));
    }
    if pair.left_text == "{" {
        return Some(pair.right_text != "}");
    }
    if pair.right_text == "}" {
        return Some(true);
    }
    if pair.left_text == "}" {
        return Some(!matches!(pair.right_text, ")" | "]" | ";" | ","));
    }

    None
}

fn spacing_for_operators(pair: &SpacingPair) -> Option<bool> {
    if pair.left_is_binary || pair.right_is_binary {
        return Some(true);
    }
    if matches!(pair.left_text, "++" | "--") && pair.left.kind == ScriptTokenKind::Punctuator {
        return Some(false);
    }
    if matches!(pair.right_text, "++" | "--") {
        return Some(false);
    }

    None
}

fn spacing_for_words(pair: &SpacingPair) -> bool {
    let left_is_word = matches!(
        pair.left.kind,
        ScriptTokenKind::Identifier | ScriptTokenKind::Keyword | ScriptTokenKind::Number
    );
    let right_is_word = matches!(
        pair.right.kind,
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
    if pair.left.kind == ScriptTokenKind::Keyword && !right_is_word {
        return !matches!(pair.right_text, ")" | "]" | "}" | ";" | ",");
    }

    false
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
    let pair = spacing_pair(
        text,
        tokens,
        left_index,
        right_index,
        left_is_binary,
        right_is_binary,
        right_is_ternary_colon,
        left_is_ternary_colon,
    );

    spacing_for_comments_and_markers(&pair, generic_opens, generic_closes, optional_markers, left_index, right_index)
    .or_else(|| spacing_for_generic_context(&pair, context))
    .or_else(|| spacing_for_separators(&pair))
    .or_else(|| spacing_for_prefix_and_question(&pair))
    .or_else(|| spacing_for_brackets(&pair))
    .or_else(|| spacing_for_braces(&pair))
    .or_else(|| spacing_for_operators(&pair))
    .unwrap_or_else(|| spacing_for_words(&pair))
}
