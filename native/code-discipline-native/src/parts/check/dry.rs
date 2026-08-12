fn check_collect_dry_descriptors(files: &[CheckTextFile]) -> Vec<CheckDryDescriptor> {
    let mut descriptors = files
    .par_iter()
    .flat_map(|entry| {
            check_collect_function_spans(&entry.file, &entry.text)
            .into_iter()
            .map(|span| check_create_dry_descriptor(entry, span))
            .collect::<Vec<_>>()
    })
    .collect::<Vec<_>>();
    descriptors.sort_by(|left, right| left.file_path.cmp(&right.file_path).then(left.start_line.cmp(&right.start_line)));
    descriptors
}

fn check_create_dry_descriptor(file: &CheckTextFile, span: CheckFunctionSpan) -> CheckDryDescriptor {
    let source = check_slice_lines(&file.text, span.start_line, span.end_line);
    let normalized_text = check_normalize_dry_source(&source, &file.file.extension);
    CheckDryDescriptor {
        character_count: normalized_text.chars().count(),
        classification: if span.kind == "method" || span.kind == "signal-handler" { "method".to_string() } else { "standalone".to_string() },
        file_path: file.file.relative_from_project_root.clone(),
        fingerprint: format!("{}:{normalized_text}", check_language_key(&file.file.extension)),
        language: check_language_key(&file.file.extension),
        name: span.name,
        start_line: span.start_line,
    }
}

fn check_slice_lines(text: &str, start_line: usize, end_line: usize) -> String {
    text.lines()
    .skip(start_line.saturating_sub(1))
    .take(end_line.saturating_sub(start_line) + 1)
    .collect::<Vec<_>>()
    .join("\n")
}

fn check_normalize_dry_source(source: &str, extension: &str) -> String {
    let header_normalized = check_normalize_function_header(source, extension);
    let comment_masked = mask_comments_for_line_count(&header_normalized, extension);
    check_tokenize_dry_text(&comment_masked).join("")
}

fn check_normalize_function_header(source: &str, extension: &str) -> String {
    let mut lines = source.lines().collect::<Vec<_>>();
    if lines.is_empty() {
        return source.to_string();
    }
    let first = lines[0];
    let normalized = if is_go_extension(extension) {
        check_replace_after_marker(first, "func ")
    } else if is_python_extension(extension) {
        check_replace_after_marker(first, "def ").or_else(|| check_replace_after_marker(first, "async def "))
    } else if is_qml_extension(extension) {
        check_replace_after_marker(first, "function ")
    } else if is_shell_extension(extension) {
        check_replace_leading_identifier(first)
    } else if is_cpp_extension(extension) || is_csharp_extension(extension) {
        check_replace_before_paren_name(first)
    } else {
        check_replace_after_marker(first, "fn ").or_else(|| check_replace_after_marker(first, "function "))
    };
    if let Some(line) = normalized {
        lines[0] = Box::leak(line.into_boxed_str());
        lines.join("\n")
    } else {
        source.to_string()
    }
}

fn check_replace_after_marker(line: &str, marker: &str) -> Option<String> {
    let index = line.find(marker)? + marker.len();
    let name_len = line[index..]
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '$')
    .map(char::len_utf8)
    .sum::<usize>();
    (name_len > 0).then(|| format!("{}__dry_function{}", &line[..index], &line[index + name_len..]))
}

fn check_replace_before_paren_name(line: &str) -> Option<String> {
    let paren = line.find('(')?;
    let before = &line[..paren];
    let name_start = before
    .char_indices()
    .rev()
    .find_map(|(index, ch)| (!ch.is_ascii_alphanumeric() && ch != '_').then_some(index + ch.len_utf8()))
    .unwrap_or(0);
    (name_start < paren).then(|| format!("{}__dry_function{}", &line[..name_start], &line[paren..]))
}

fn check_replace_leading_identifier(line: &str) -> Option<String> {
    let trimmed_start = line.len() - line.trim_start().len();
    let name_len = line[trimmed_start..]
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
    .map(char::len_utf8)
    .sum::<usize>();
    (name_len > 0).then(|| format!("{}__dry_function{}", &line[..trimmed_start], &line[trimmed_start + name_len..]))
}

fn check_tokenize_dry_text(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut identifiers: HashMap<String, String> = HashMap::new();
    let chars = text.chars().collect::<Vec<_>>();
    let mut index = 0_usize;
    while index < chars.len() {
        let ch = chars[index];
        if ch.is_whitespace() {
            index += 1;
        } else if matches!(ch, '"' | '\'' | '`') {
            let end = check_scan_quoted_literal(&chars, index);
            tokens.push(format!("STR:{}", chars[index..end].iter().collect::<String>()));
            index = end;
        } else if ch.is_ascii_digit() {
            let end = check_scan_while(&chars, index, |item| item.is_ascii_alphanumeric() || item == '.');
            tokens.push(format!("NUM:{}", chars[index..end].iter().collect::<String>()));
            index = end;
        } else if ch.is_ascii_alphabetic() || ch == '_' || ch == '$' {
            let end = check_scan_while(&chars, index, |item| item.is_ascii_alphanumeric() || item == '_' || item == '$');
            let identifier = chars[index..end].iter().collect::<String>();
            tokens.push(check_normalize_identifier(&identifier, &chars, index, end, &mut identifiers));
            index = end;
        } else {
            tokens.push(ch.to_string());
            index += 1;
        }
    }
    tokens
}

fn check_scan_quoted_literal(chars: &[char], start: usize) -> usize {
    let quote = chars[start];
    let mut escaped = false;
    let mut index = start + 1;
    while index < chars.len() {
        let ch = chars[index];
        if escaped {
            escaped = false;
        } else if ch == '\\' {
            escaped = true;
        } else if ch == quote {
            return index + 1;
        }
        index += 1;
    }
    chars.len()
}

fn check_scan_while(chars: &[char], start: usize, predicate: fn(char) -> bool) -> usize {
    let mut end = start;
    while end < chars.len() && predicate(chars[end]) {
        end += 1;
    }
    end
}

fn check_normalize_identifier(
    identifier: &str,
    chars: &[char],
    start: usize,
    end: usize,
    identifiers: &mut HashMap<String, String>,
) -> String {
    let lower = identifier.to_ascii_lowercase();
    if check_dry_keyword(&lower) {
        return lower;
    }
    let previous = check_previous_non_whitespace(chars, start);
    let next = check_next_non_whitespace(chars, end);
    if previous == Some('.')
    || matches!(next, Some('(' | '!'))
    || check_is_constant_identifier(identifier)
    || check_is_type_identifier(identifier)
    {
        return identifier.to_string();
    }
    if let Some(existing) = identifiers.get(identifier) {
        return existing.clone();
    }
    let next = format!("i{}", identifiers.len());
    identifiers.insert(identifier.to_string(), next.clone());
    next
}

fn check_previous_non_whitespace(chars: &[char], start: usize) -> Option<char> {
    chars[..start].iter().rev().copied().find(|ch| !ch.is_whitespace())
}

fn check_next_non_whitespace(chars: &[char], start: usize) -> Option<char> {
    chars[start..].iter().copied().find(|ch| !ch.is_whitespace())
}

fn check_is_constant_identifier(identifier: &str) -> bool {
    identifier.chars().any(|ch| ch.is_ascii_uppercase())
    && identifier.chars().all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_')
}

fn check_is_type_identifier(identifier: &str) -> bool {
    identifier.chars().next().is_some_and(|ch| ch.is_ascii_uppercase())
}

fn check_dry_keyword(value: &str) -> bool {
    matches!(
        value,
        "async" | "class" | "const" | "def" | "fn" | "func" | "function" | "if" | "let" | "local"
        | "pub" | "return" | "static" | "struct" | "type" | "var" | "void"
    )
}

fn check_collect_dry_violations(files: &[CheckTextFile], rule: &NativeDryRule) -> Vec<CodeDisciplineViolation> {
    let descriptors = check_collect_dry_descriptors(files);
    let mut by_fingerprint: HashMap<String, Vec<CheckDryDescriptor>> = HashMap::new();
    for descriptor in descriptors {
        if descriptor.character_count < check_effective_min_duplicate_characters(rule, &descriptor) {
            continue;
        }
        by_fingerprint.entry(descriptor.fingerprint.clone()).or_default().push(descriptor);
    }
    let mut violations = Vec::new();
    for group in by_fingerprint.values().filter(|group| group.len() > 1) {
        violations.push(check_dry_violation(group));
    }
    violations
}

fn check_effective_min_duplicate_characters(rule: &NativeDryRule, descriptor: &CheckDryDescriptor) -> usize {
    let language_floor = if descriptor.language == "shell" { 0 } else { 40 };
    rule.min_duplicate_characters.max(language_floor)
}

fn check_dry_violation(group: &[CheckDryDescriptor]) -> CodeDisciplineViolation {
    let files = group
    .iter()
    .map(|entry| entry.file_path.clone())
    .collect::<HashSet<_>>()
    .into_iter()
    .collect::<Vec<_>>();
    check_violation(
        "dry",
        false,
        "multiple files".to_string(),
        "duplicate function group".to_string(),
        json!({
                "confidence": 1,
                "files": files,
                "fixable": false,
                "functions": group.iter().map(|entry| json!({
                            "classification": entry.classification,
                            "filePath": entry.file_path,
                            "language": entry.language,
                            "line": entry.start_line,
                            "name": entry.name,
                            "topLevel": false,
                })).collect::<Vec<_>>(),
                "locations": group.iter().map(|entry| format!("{}#{}", entry.file_path, entry.name)).collect::<Vec<_>>(),
                "reason": "duplicate function group requires human canonicalization",
                "signals": ["exact-normalized"],
        }),
    )
}
