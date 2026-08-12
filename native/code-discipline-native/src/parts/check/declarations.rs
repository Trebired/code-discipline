fn check_measure_declaration_name(name: &str) -> usize {
    name.trim_start_matches("--")
    .trim_start_matches('$')
    .trim_start_matches('%')
    .chars()
    .count()
}

fn check_collect_declarations(file: &ScannedSourceFile, text: &str) -> Vec<CheckDeclaration> {
    if is_ts_family_extension(&file.extension) {
        return check_collect_script_declarations(text);
    }
    if is_go_extension(&file.extension) {
        return check_collect_go_declarations(text);
    }
    if is_rust_extension(&file.extension) {
        return check_collect_rust_declarations(text);
    }
    if is_cpp_extension(&file.extension) {
        return check_collect_cpp_declarations(file, text);
    }
    if is_csharp_extension(&file.extension) {
        return check_collect_csharp_declarations(file, text);
    }
    if is_python_extension(&file.extension) {
        return check_collect_python_declarations(text);
    }
    if is_qml_extension(&file.extension) {
        return check_collect_qml_declarations(text);
    }
    if is_shell_extension(&file.extension) {
        return check_collect_shell_declarations(text);
    }
    if is_style_extension(&file.extension) {
        return check_collect_style_declarations(&file.extension, text);
    }
    Vec::new()
}

fn check_collect_script_declarations(text: &str) -> Vec<CheckDeclaration> {
    let masked = strip_comments_and_strings_with(text, true);
    let mut declarations = Vec::new();
    for (index, line) in masked.lines().enumerate() {
        let trimmed = line.trim_start().trim_start_matches("export ").trim_start();
        if let Some(name) = check_word_after(trimmed, "function ") {
            declarations.push(check_declaration("function", name, index + 1));
        }
        if let Some(rest) = trimmed.strip_prefix("const ") {
            let name = check_take_script_identifier(rest);
            if !name.is_empty() {
                declarations.push(check_declaration("const", name, index + 1));
            }
        }
    }
    declarations
}

fn check_word_after(value: &str, marker: &str) -> Option<String> {
    let rest = value.strip_prefix(marker)?;
    let name = check_take_script_identifier(rest);
    (!name.is_empty()).then_some(name)
}

fn check_declaration(kind: &str, name: String, line: usize) -> CheckDeclaration {
    CheckDeclaration {
        kind: kind.to_string(),
        line,
        name,
    }
}

fn check_collect_go_declarations(text: &str) -> Vec<CheckDeclaration> {
    let masked = strip_comments_and_strings(text);
    let mut declarations = Vec::new();
    let mut block_kind = String::new();
    for (index, line) in masked.lines().enumerate() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("func ") {
            let rest = if rest.trim_start().starts_with('(') {
                rest.find(')').map(|cursor| &rest[cursor + 1..]).unwrap_or(rest)
            } else {
                rest
            };
            let name = check_take_plain_identifier(rest.trim_start());
            if !name.is_empty() {
                declarations.push(check_declaration(if trimmed.contains("func (") { "method" } else { "function" }, name, index + 1));
            }
            continue;
        }
        if trimmed.starts_with(")") {
            block_kind.clear();
            continue;
        }
        if let Some(kind) = check_block_kind_start(trimmed) {
            block_kind = kind.to_string();
            continue;
        }
        let (kind, name) = if block_kind.is_empty() {
            check_prefixed_declaration(trimmed, &["const", "var", "type"])
        } else {
            (block_kind.clone(), check_take_plain_identifier(trimmed))
        };
        if !kind.is_empty() && !name.is_empty() {
            declarations.push(check_declaration(&kind, name, index + 1));
        }
    }
    declarations
}

fn check_block_kind_start(trimmed: &str) -> Option<&'static str> {
    ["const", "var", "type"]
    .iter()
    .find(|kind| trimmed.starts_with(&format!("{kind} (")))
    .copied()
}

fn check_prefixed_declaration(trimmed: &str, kinds: &[&str]) -> (String, String) {
    for kind in kinds {
        if let Some(rest) = trimmed.strip_prefix(&format!("{kind} ")) {
            return (kind.to_string(), check_take_plain_identifier(rest.trim_start()));
        }
    }
    (String::new(), String::new())
}

fn check_take_plain_identifier(value: &str) -> String {
    value
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
    .collect()
}

fn check_collect_rust_declarations(text: &str) -> Vec<CheckDeclaration> {
    let masked = strip_comments_and_strings(text);
    let mut declarations = Vec::new();
    for (index, line) in masked.lines().enumerate() {
        let trimmed = line.trim_start();
        for kind in ["fn", "const", "static", "struct", "enum", "trait", "type", "mod"] {
            if let Some(name) = check_rust_decl_name(trimmed, kind) {
                declarations.push(check_declaration(if kind == "fn" { "function" } else { kind }, name, index + 1));
                break;
            }
        }
    }
    declarations
}

fn check_rust_decl_name(trimmed: &str, kind: &str) -> Option<String> {
    let marker = format!("{kind} ");
    let index = trimmed.find(&marker)?;
    if trimmed[..index].split_whitespace().any(|word| !word.starts_with("pub") && !matches!(word, "async" | "const" | "unsafe")) {
        return None;
    }
    let name = check_take_plain_identifier(trimmed[index + marker.len()..].trim_start());
    (!name.is_empty()).then_some(name)
}

fn check_collect_cpp_declarations(file: &ScannedSourceFile, text: &str) -> Vec<CheckDeclaration> {
    let mut declarations = check_collect_c_family_function_declarations(file, text);
    declarations.extend(check_collect_prefixed_line_declarations(strip_comments_and_strings(text), &[
                ("namespace", "namespace"),
                ("class", "class"),
                ("struct", "struct"),
                ("enum", "enum"),
                ("using", "using"),
    ]));
    declarations
}

fn check_collect_csharp_declarations(file: &ScannedSourceFile, text: &str) -> Vec<CheckDeclaration> {
    let mut declarations = check_collect_c_family_function_declarations(file, text);
    declarations.extend(check_collect_prefixed_line_declarations(strip_comments_and_strings(text), &[
                ("namespace", "namespace"),
                ("class", "class"),
                ("interface", "interface"),
                ("struct", "struct"),
                ("enum", "enum"),
    ]));
    declarations
}

fn check_collect_c_family_function_declarations(file: &ScannedSourceFile, text: &str) -> Vec<CheckDeclaration> {
    check_collect_function_spans(file, text)
    .into_iter()
    .map(|span| check_declaration(&span.kind, span.name, span.start_line))
    .collect()
}

fn check_collect_prefixed_line_declarations(text: String, entries: &[(&str, &str)]) -> Vec<CheckDeclaration> {
    let mut declarations = Vec::new();
    for (index, line) in text.lines().enumerate() {
        let tokens = line.split_whitespace().collect::<Vec<_>>();
        for (kind, keyword) in entries {
            if let Some(position) = tokens.iter().position(|token| token.trim_end_matches('{') == *keyword) {
                if let Some(name) = tokens.get(position + 1) {
                    declarations.push(check_declaration(kind, check_take_plain_identifier(name.trim_matches('{')), index + 1));
                    break;
                }
            }
        }
    }
    declarations
}

fn check_collect_python_declarations(text: &str) -> Vec<CheckDeclaration> {
    let mut declarations = Vec::new();
    let mut quote = None;
    for (index, line) in text.lines().enumerate() {
        if quote.is_none() {
            let trimmed = line.trim_start();
            if let Some((_, kind, name)) = check_python_function_start(line) {
                declarations.push(check_declaration(&kind, name, index + 1));
            } else if let Some(rest) = trimmed.strip_prefix("class ") {
                declarations.push(check_declaration("class", check_take_plain_identifier(rest), index + 1));
            } else if let Some(eq) = trimmed.find('=') {
                let name = check_take_plain_identifier(trimmed[..eq].trim());
                if !name.is_empty() {
                    declarations.push(check_declaration("assignment", name, index + 1));
                }
            }
        }
        check_update_python_triple_state(line, &mut quote);
    }
    declarations
}

fn check_collect_qml_declarations(text: &str) -> Vec<CheckDeclaration> {
    let masked = strip_comments_and_strings_with(text, true);
    let mut declarations = Vec::new();
    for (index, line) in masked.lines().enumerate() {
        let trimmed = line.trim_start();
        if let Some((kind, name, _)) = check_qml_function_start(trimmed, index + 1) {
            declarations.push(check_declaration(&kind, name, index + 1));
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("property ") {
            let name = rest.split_whitespace().nth(1).unwrap_or("");
            if !name.is_empty() {
                declarations.push(check_declaration("property", name.to_string(), index + 1));
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("signal ") {
            let name = check_take_script_identifier(rest);
            if !name.is_empty() {
                declarations.push(check_declaration("signal", name, index + 1));
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("id:") {
            let name = check_take_script_identifier(rest.trim_start());
            if !name.is_empty() {
                declarations.push(check_declaration("id", name, index + 1));
            }
        }
    }
    declarations
}

fn check_collect_shell_declarations(text: &str) -> Vec<CheckDeclaration> {
    let mut declarations = Vec::new();
    for (index, line) in text.lines().enumerate() {
        let stripped = check_shell_strip_strings_and_comments(line);
        if let Some(name) = check_shell_function_start(&stripped) {
            declarations.push(check_declaration("function", name, index + 1));
            continue;
        }
        let trimmed = stripped.trim_start();
        let without_prefix = ["export ", "local ", "readonly "]
        .iter()
        .find_map(|prefix| trimmed.strip_prefix(prefix))
        .unwrap_or(trimmed);
        if let Some(eq) = without_prefix.find('=') {
            let name = check_take_plain_identifier(without_prefix[..eq].trim());
            if !name.is_empty() {
                declarations.push(check_declaration("assignment", name, index + 1));
            }
        }
    }
    declarations
}

fn check_collect_style_declarations(extension: &str, text: &str) -> Vec<CheckDeclaration> {
    let masked = strip_comments_and_strings(text);
    let mut declarations = Vec::new();
    for (index, line) in masked.lines().enumerate() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("--") {
            let name = format!("--{}", check_take_style_identifier(rest));
            if name.len() > 2 {
                declarations.push(check_declaration("custom-property", name, index + 1));
            }
            continue;
        }
        if is_scss_extension(extension) {
            if let Some(rest) = trimmed.strip_prefix('$') {
                let name = format!("${}", check_take_style_identifier(rest));
                if name.len() > 1 {
                    declarations.push(check_declaration("variable", name, index + 1));
                }
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("@mixin ") {
                declarations.push(check_declaration("mixin", check_take_style_identifier(rest), index + 1));
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("@function ") {
                declarations.push(check_declaration("function", check_take_style_identifier(rest), index + 1));
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix('%') {
                let name = format!("%{}", check_take_style_identifier(rest));
                if name.len() > 1 {
                    declarations.push(check_declaration("placeholder", name, index + 1));
                }
            }
        }
    }
    declarations
}

fn check_take_style_identifier(value: &str) -> String {
    value
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
    .collect()
}
