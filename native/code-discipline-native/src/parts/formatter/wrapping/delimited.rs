fn split_markup_tag_tokens(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for ch in text.chars() {
        if let Some(active) = quote {
            current.push(ch);
            if ch == active {
                quote = None;
            }
            continue;
        }

        if ch == '"' || ch == '\'' {
            quote = Some(ch);
            current.push(ch);
            continue;
        }

        if ch.is_whitespace() {
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

    for (index, ch) in text.char_indices() {
        if let Some(active) = quote {
            if ch == active {
                quote = None;
            }
            continue;
        }

        if ch == '"' || ch == '\'' {
            quote = Some(ch);
            continue;
        }

        if ch == '>' {
            return Some(index);
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

fn split_top_level_items(content: &str, delimiter: char) -> Option<Vec<String>> {
    let mut items = Vec::new();
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
            _ if ch == delimiter && depth == 0 => {
                let item = current.trim();
                if item.is_empty() {
                    return None;
                }
                items.push(item.to_string());
                current = String::new();
            }
            _ => current.push(ch),
        }
    }
    let item = current.trim();
    if !item.is_empty() {
        items.push(item.to_string());
    }
    (items.len() > 1).then_some(items)
}

fn find_matching_delimiter(line: &str, open_index: usize, open: char, close: char) -> Option<usize> {
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut depth = 0_isize;

    for (index, ch) in line.char_indices().filter(|(index, _)| *index >= open_index) {
        if let Some(active) = quote {
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
            '"' | '\'' | '`' => quote = Some(ch),
            _ if ch == open => depth += 1,
            _ if ch == close => {
                depth -= 1;
                if depth == 0 {
                    return Some(index);
                }
            }
            _ => {}
        }
    }

    None
}

fn wrap_delimited_line(line: &str, max: usize, open: char, close: char) -> Option<Vec<String>> {
    let open_index = line.find(open)?;
    let close_index = find_matching_delimiter(line, open_index, open, close)?;
    let prefix = &line[..open_index];
    let content = &line[open_index + open.len_utf8()..close_index];
    let suffix = &line[close_index + close.len_utf8()..];
    let items = split_top_level_items(content, ',')?;
    let indent = leading_whitespace(line);
    let continuation_indent = format!("{indent}  ");
    let mut output = Vec::with_capacity(items.len() + 2);

    output.push(format!("{prefix}{open}"));
    for (index, item) in items.iter().enumerate() {
        let comma = if index == items.len() - 1 { "" } else { "," };
        output.push(format!("{continuation_indent}{item}{comma}"));
    }
    output.push(format!("{indent}{close}{suffix}"));

    output
        .iter()
        .all(|item| count_display_characters(item) <= max)
        .then_some(output)
}

fn wrap_array_or_call_line(line: &str, extension: &str, max: usize) -> Option<Vec<String>> {
    if !(is_ts_family_extension(extension)
        || is_qml_extension(extension)
        || is_python_extension(extension)
        || is_rust_extension(extension))
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

    wrap_delimited_line(line, max, '[', ']')
        .or_else(|| wrap_delimited_line(line, max, '(', ')'))
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
