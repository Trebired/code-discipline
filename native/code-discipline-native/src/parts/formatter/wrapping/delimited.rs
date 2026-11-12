fn split_markup_tag_tokens(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut depth = 0_usize;

    for ch in text.chars() {
        if let Some(active) = quote {
            current.push(ch);
            if ch == active {
                quote = None;
            }
            continue;
        }

        if ch == '"' || ch == '\'' || (depth > 0 && ch == '`') {
            quote = Some(ch);
            current.push(ch);
            continue;
        }

        match ch {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            _ => {}
        }

        if ch.is_whitespace() && depth == 0 {
            if !current.is_empty() {
                tokens.push(current);
                current = String::new();
            }
            continue;
        }

        current.push(ch);
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn find_markup_tag_end(text: &str) -> Option<usize> {
    let mut quote: Option<char> = None;
    let mut depth = 0_usize;

    for (index, ch) in text.char_indices() {
        if let Some(active) = quote {
            if ch == active {
                quote = None;
            }
            continue;
        }

        match ch {
            '"' | '\'' => quote = Some(ch),
            '`' if depth > 0 => quote = Some(ch),
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            '>' if depth == 0 => return Some(index),
            _ => {}
        }
    }

    None
}

fn wrap_markup_line(line: &str, extension: &str, max: usize) -> Option<Vec<String>> {
    let indent = leading_whitespace(line);
    let trimmed = line.trim_start();
    if !trimmed.starts_with('<') || trimmed.starts_with("</") {
        return None;
    }

    let tag_end = find_markup_tag_end(trimmed)?;
    let head = &trimmed[..=tag_end];
    let tail = &trimmed[tag_end + 1..];
    let mut tokens = split_markup_tag_tokens(head);
    if tokens.len() < 2 {
        return None;
    }
    if !tail.is_empty() {
        if let Some(last) = tokens.last_mut() {
            last.push_str(tail);
        }
    }

    let continuation_indent = if is_rust_extension(extension) {
        indent.to_string()
    } else {
        format!("{indent}  ")
    };
    let mut output = vec![format!("{indent}{}", tokens[0])];
    for token in tokens.iter().skip(1) {
        let candidate = output
        .last()
        .map(|last| format!("{last} {token}"))
        .unwrap_or_default();

        if output.len() > 1 && count_display_characters(&candidate) <= max {
            if let Some(last) = output.last_mut() {
                *last = candidate;
            }
        } else {
            output.push(format!("{continuation_indent}{token}"));
        }
    }

    output
    .iter()
    .all(|item| count_display_characters(item) <= max)
    .then_some(output)
}

fn masked_matching_close(masked: &str, open_index: usize, open: u8, close: u8) -> Option<usize> {
    let mut depth = 0_isize;
    for (index, byte) in masked.bytes().enumerate().skip(open_index) {
        if byte == open {
            depth += 1;
        } else if byte == close {
            depth -= 1;
            if depth == 0 {
                return Some(index);
            }
        }
    }
    None
}

fn masked_top_level_items(line: &str, masked: &str, start: usize, end: usize) -> Option<Vec<String>> {
    let mut items = Vec::new();
    let mut depth = 0_isize;
    let mut item_start = start;
    for (index, byte) in masked.bytes().enumerate().take(end).skip(start) {
        match byte {
            b'(' | b'[' | b'{' => depth += 1,
            b')' | b']' | b'}' => depth -= 1,
            b',' if depth == 0 => {
                let item = line[item_start..index].trim();
                if item.is_empty() {
                    return None;
                }
                items.push(item.to_string());
                item_start = index + 1;
            }
            _ => {}
        }
    }
    let item = line[item_start..end].trim();
    if !item.is_empty() {
        items.push(item.to_string());
    }
    (items.len() > 1).then_some(items)
}

fn wrap_delimited_line(line: &str, extension: &str, max: usize, delimiters: (u8, u8)) -> Option<Vec<String>> {
    let (open, close) = delimiters;
    let masked = mask_line_literals(line, extension);
    let open_index = masked.bytes().position(|byte| byte == open)?;
    let close_index = masked_matching_close(&masked, open_index, open, close)?;
    let prefix = &line[..open_index];
    let suffix = &line[close_index + 1..];
    let items = masked_top_level_items(line, &masked, open_index + 1, close_index)?;
    let indent = leading_whitespace(line);
    let continuation_indent = format!("{indent}  ");
    let mut output = Vec::with_capacity(items.len() + 2);

    output.push(format!("{prefix}{}", open as char));
    for (index, item) in items.iter().enumerate() {
        let comma = if index == items.len() - 1 { "" } else { "," };
        output.push(format!("{continuation_indent}{item}{comma}"));
    }
    output.push(format!("{indent}{}{suffix}", close as char));

    output
    .iter()
    .all(|item| count_display_characters(item) <= max)
    .then_some(output)
}

fn wrap_array_or_call_line(line: &str, extension: &str, max: usize) -> Option<Vec<String>> {
    if !(is_ts_family_extension(extension)
        || is_qml_extension(extension)
        || is_python_extension(extension)
        || is_rust_extension(extension)
        || is_cpp_extension(extension)
        || is_csharp_extension(extension))
    {
        return None;
    }

    if has_comment_marker(line) {
        return None;
    }

    let trimmed = line.trim_start();
    if trimmed.starts_with("if ")
    || trimmed.starts_with("if(")
    || trimmed.starts_with("for ")
    || trimmed.starts_with("for(")
    || trimmed.starts_with("while ")
    || trimmed.starts_with("while(")
    || trimmed.starts_with("switch ")
    || trimmed.starts_with("function ")
    {
        return None;
    }

    wrap_delimited_line(line, extension, max, (b'[', b']'))
    .or_else(|| wrap_delimited_line(line, extension, max, (b'(', b')')))
}

fn split_top_level_statements(content: &str) -> Option<Vec<String>> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut depth = 0_isize;
    for ch in content.chars() {
        if let Some(active) = quote {
            current.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == active {
                quote = None;
            }
            continue;
        }
        match ch {
            '"' | '\'' | '`' => {
                quote = Some(ch);
                current.push(ch);
            }
            '(' | '[' | '{' => {
                depth += 1;
                current.push(ch);
            }
            ')' | ']' | '}' => {
                depth -= 1;
                current.push(ch);
            }
            ';' if depth == 0 => {
                current.push(';');
                let statement = current.trim();
                if !statement.is_empty() {
                    statements.push(statement.to_string());
                }
                current = String::new();
            }
            _ => current.push(ch),
        }
    }
    let statement = current.trim();
    if !statement.is_empty() {
        statements.push(statement.to_string());
    }
    (statements.len() > 1).then_some(statements)
}

fn wrap_one_line_block(line: &str, extension: &str) -> Option<Vec<String>> {
    if !(is_ts_family_extension(extension) || is_qml_extension(extension)) {
        return None;
    }

    let trimmed = line.trim_start();
    if !(trimmed.starts_with("function ") || trimmed.contains(") {") || trimmed.contains(": {")) {
        return None;
    }

    let open_index = line.find('{')?;
    let close_index = line.rfind('}')?;
    if close_index <= open_index {
        return None;
    }

    let prefix = line[..open_index].trim_end();
    let body = line[open_index + 1..close_index].trim();
    if body.is_empty() {
        return None;
    }

    let suffix = &line[close_index + 1..];
    let statements = split_top_level_statements(body).unwrap_or_else(|| vec![body.to_string()]);
    if statements.len() == 1 && !is_qml_extension(extension) {
        return None;
    }

    let indent = leading_whitespace(line);
    let continuation_indent = format!("{indent}  ");
    let mut output = Vec::with_capacity(statements.len() + 2);

    output.push(format!("{prefix} {{"));
    output.extend(statements.iter().map(|statement| format!("{continuation_indent}{statement}")));
    output.push(format!("{indent}}}{suffix}"));

    Some(output)
}
