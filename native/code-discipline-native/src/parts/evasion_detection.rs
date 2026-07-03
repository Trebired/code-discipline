fn detect_runtime_code_hiding(
    file: &ScannedSourceFile,
    text: &str,
    stripped: &str,
) -> Vec<CodeDisciplineViolation> {
    let mut violations = Vec::new();
    let patterns = [
        ("new Function", "new Function("),
        ("Function", "Function("),
        ("eval", "eval("),
        ("setTimeout", "setTimeout("),
        ("setInterval", "setInterval("),
    ];

    for (label, needle) in patterns {
        let mut offset = 0_usize;
        while let Some(position) = stripped[offset..].find(needle) {
            let absolute = offset + position;
            let after = absolute + needle.len();
            let Some(next_non_space) = text[after..].chars().find(|ch| !ch.is_whitespace()) else {
                break;
            };
            if next_non_space == '"' || next_non_space == '\'' || next_non_space == '`' {
                violations.push(create_runtime_code_hiding_violation(
                    file,
                    label,
                    count_line_number(text, absolute),
                ));
            }
            offset = after;
        }
    }

    violations
}

fn detect_packed_functions(
    file: &ScannedSourceFile,
    text: &str,
    stripped: &str,
    options: &PackedCodeGuardOptions,
) -> Vec<CodeDisciplineViolation> {
    let mut violations = Vec::new();
    let mut offset = 0_usize;

    while let Some(position) = stripped[offset..].find("function ") {
        let absolute = offset + position;
        let name_start = absolute + "function ".len();
        let name = stripped[name_start..]
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '$')
            .collect::<String>();
        let Some(open_relative) = stripped[absolute..].find('{') else {
            break;
        };
        let open = absolute + open_relative;
        let Some(close_relative) = stripped[open..].find('}') else {
            break;
        };
        let close = open + close_relative + 1;
        let function_text = &text[absolute..close];
        let line_count = function_text.bytes().filter(|byte| *byte == b'\n').count() + 1;
        let statement_count = stripped[open..close]
            .bytes()
            .filter(|byte| *byte == b';')
            .count();
        let character_count = function_text.len();

        if line_count <= options.max_packed_function_lines
            && statement_count > options.max_packed_function_statements
            && character_count >= options.min_packed_function_characters
        {
            violations.push(create_packed_function_violation(
                file,
                if name.is_empty() { "anonymous" } else { &name },
                count_line_number(text, absolute),
                line_count,
                statement_count,
                character_count,
                options,
            ));
        }

        offset = close;
    }

    violations
}

fn collect_packed_code_violations(
    file: &ScannedSourceFile,
    text: &str,
    stripped: &str,
    packed_code: &PackedCodeGuardOptions,
) -> Vec<CodeDisciplineViolation> {
    let mut violations = Vec::new();
    let raw_lines = text.lines().collect::<Vec<_>>();
    let stripped_lines = stripped.lines().collect::<Vec<_>>();
    let non_empty_line_count = raw_lines.iter().filter(|line| !line.trim().is_empty()).count();
    let file_structural_token_count = count_structural_tokens(stripped);

    if non_empty_line_count <= packed_code.max_packed_file_non_empty_lines
        && text.len() >= packed_code.min_packed_file_characters
        && file_structural_token_count >= packed_code.min_packed_file_structural_tokens
    {
        violations.push(create_packed_file_violation(
            file,
            non_empty_line_count,
            text.len(),
            file_structural_token_count,
            packed_code,
        ));
    }

    for (index, raw_line) in raw_lines.iter().enumerate() {
        let stripped_line = stripped_lines.get(index).copied().unwrap_or("");
        let semicolon_count = stripped_line.bytes().filter(|byte| *byte == b';').count();
        let structural_token_count = count_structural_tokens(stripped_line);

        if raw_line.len() >= packed_code.min_packed_line_columns
            && (semicolon_count > packed_code.max_semicolons_per_line
                || structural_token_count > packed_code.max_structural_tokens_per_line)
        {
            violations.push(create_packed_line_violation(
                file,
                index + 1,
                raw_line.len(),
                semicolon_count,
                structural_token_count,
                packed_code,
            ));
        }
    }

    if is_ts_family_extension(&file.extension) {
        violations.extend(detect_packed_functions(file, text, stripped, packed_code));
    }

    violations
}

fn collect_evasion_guard_violations(
    file: &ScannedSourceFile,
    text: &str,
    options: &EvasionGuardsOptions,
) -> Vec<CodeDisciplineViolation> {
    let stripped = strip_comments_and_strings(text);
    let mut violations = Vec::new();

    if let Some(packed_code) = &options.packed_code {
        violations.extend(collect_packed_code_violations(
            file,
            text,
            &stripped,
            packed_code,
        ));
    }

    if options.runtime_code_hiding && is_ts_family_extension(&file.extension) {
        violations.extend(detect_runtime_code_hiding(file, text, &stripped));
    }

    violations
}
