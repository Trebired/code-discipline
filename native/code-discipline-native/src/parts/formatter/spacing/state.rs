type GenericOpenMarkers = Vec<Option<(usize, bool)>>;
type GenericCloseMarkers = Vec<Option<bool>>;

#[derive(Clone, Copy)]
struct SpacingTokenState {
    is_binary: bool,
    is_ternary_colon: bool,
}

fn collect_generic_spacing_markers(
    text: &str,
    tokens: &[ScriptToken],
) -> (GenericOpenMarkers, GenericCloseMarkers) {
    let mut generic_opens: GenericOpenMarkers = vec![None; tokens.len()];
    let mut generic_closes: GenericCloseMarkers = vec![None; tokens.len()];

    for index in 0..tokens.len() {
        if tokens[index].kind != ScriptTokenKind::Punctuator || token_text(text, &tokens[index]) != "<" {
            continue;
        }
        if let Some(end) = generic_arguments_end(text, tokens, index) {
            let multiline = tokens[index..=end]
            .iter()
            .any(|token| token.kind == ScriptTokenKind::Newline);
            generic_opens[index] = Some((end, multiline));
            generic_closes[end] = Some(!multiline);
        }
    }

    (generic_opens, generic_closes)
}

fn next_code_like_token(tokens: &[ScriptToken], from: usize) -> Option<usize> {
    (from..tokens.len()).find(|candidate| {
            !matches!(
                tokens[*candidate].kind,
                ScriptTokenKind::Newline | ScriptTokenKind::LineComment | ScriptTokenKind::BlockComment
            )
    })
}

fn collect_optional_ternary_markers(text: &str, tokens: &[ScriptToken]) -> Vec<bool> {
    let mut optional_markers = vec![false; tokens.len()];

    for index in 0..tokens.len() {
        if tokens[index].kind != ScriptTokenKind::Punctuator || token_text(text, &tokens[index]) != "?" {
            continue;
        }
        if let Some(next) = next_code_like_token(tokens, index + 1) {
            optional_markers[index] = token_text(text, &tokens[next]) == ":";
        }
    }

    optional_markers
}

fn classify_angle_spacing_token(
    text: &str,
    tokens: &[ScriptToken],
    generic_opens: &[Option<(usize, bool)>],
    generic_closes: &[Option<bool>],
    index: usize,
    previous_index: Option<usize>,
    context: &mut SpacingContext,
) -> Option<SpacingTokenState> {
    let value = token_text(text, &tokens[index]);
    if value == "<" {
        if let Some((_, multiline)) = generic_opens[index] {
            if !multiline {
                context.generic_depth += 1;
            }
            return Some(SpacingTokenState { is_binary: false, is_ternary_colon: false });
        }
        return Some(SpacingTokenState {
                is_binary: previous_index.is_some_and(|left| is_value_end_token(text, &tokens[left])),
                is_ternary_colon: false,
        });
    }
    if matches!(value, ">" | ">>" | ">>>") {
        return Some(classify_closing_angle_spacing_token(text, tokens, generic_closes, index, previous_index, context));
    }

    None
}

fn classify_closing_angle_spacing_token(
    text: &str,
    tokens: &[ScriptToken],
    generic_closes: &[Option<bool>],
    index: usize,
    previous_index: Option<usize>,
    context: &mut SpacingContext,
) -> SpacingTokenState {
    let value = token_text(text, &tokens[index]);
    if generic_closes[index].is_some_and(|compact| compact) {
        context.generic_depth = context.generic_depth.saturating_sub(value.len());
        return SpacingTokenState { is_binary: false, is_ternary_colon: false };
    }

    SpacingTokenState {
        is_binary: previous_index.is_some_and(|left| is_value_end_token(text, &tokens[left])),
        is_ternary_colon: false,
    }
}

fn classify_spacing_token(
    text: &str,
    tokens: &[ScriptToken],
    generic_opens: &[Option<(usize, bool)>],
    generic_closes: &[Option<bool>],
    optional_markers: &[bool],
    index: usize,
    previous_index: Option<usize>,
    context: &mut SpacingContext,
) -> SpacingTokenState {
    if tokens[index].kind != ScriptTokenKind::Punctuator {
        return SpacingTokenState { is_binary: false, is_ternary_colon: false };
    }
    if let Some(state) = classify_angle_spacing_token(text, tokens, generic_opens, generic_closes, index, previous_index, context) {
        return state;
    }

    let value = token_text(text, &tokens[index]);
    match value {
        "(" | "[" | "{" => context.push_bracket(value.chars().next().unwrap_or('(')),
        ")" | "]" | "}" => context.pop_bracket(),
        "?" if !optional_markers[index] => context.mark_ternary(),
        ":" => return SpacingTokenState { is_binary: false, is_ternary_colon: context.take_ternary() },
        _ => {}
    }

    SpacingTokenState {
        is_binary: BINARY_PUNCTUATORS.contains(&value)
        && (previous_index.is_some_and(|left| is_value_end_token(text, &tokens[left]))
            || matches!(value, "=" | "=>" | "==" | "===" | "!=" | "!==")),
        is_ternary_colon: false,
    }
}
