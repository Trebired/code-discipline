#[napi]
pub fn run_check_rules(request_json: String) -> Result<String> {
    let request: NativeCheckRulesRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let text_files = check_read_text_files(request.source_files);
    let mut violations = Vec::new();
    check_push_banned_pattern_violations(&mut violations, &text_files, &request.rules);
    check_push_banned_file_violations(&mut violations, &text_files, &request.rules);
    check_push_min_file_line_violations(&mut violations, &text_files, &request.rules);
    check_push_min_declaration_name_violations(&mut violations, &text_files, &request.rules);
    check_push_max_file_line_violations(&mut violations, &text_files, &request.rules);
    check_push_max_character_line_violations(&mut violations, &text_files, &request.rules);
    check_push_max_function_line_violations(&mut violations, &text_files, &request.rules);
    check_push_redundant_path_segment_violations(&mut violations, &text_files, &request.rules);
    check_push_import_violations(&mut violations, &text_files, &request.rules);
    check_push_remove_comment_violations(&mut violations, &text_files, &request.rules);
    check_push_structural_blank_line_violations(&mut violations, &text_files, &request.rules);
    check_push_dry_violations(&mut violations, &text_files, &request.rules);
    violations.sort_by(|left, right| left.file_path.cmp(&right.file_path).then(left.rule.cmp(&right.rule)));
    serde_json::to_string(&NativeCheckRulesResponse { violations }).map_err(|error| err(error.to_string()))
}

fn check_push_banned_pattern_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.banned_patterns else {
        return;
    };
    let files = check_files_for_rule(text_files, &rule.exclude_dirs);
    let mut rows = files
    .par_iter()
    .flat_map(|entry| check_banned_pattern_file_violations(entry, rule))
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_banned_pattern_file_violations(
    entry: &CheckTextFile,
    rule: &NativeBannedPatternsRule,
) -> Vec<CodeDisciplineViolation> {
    let normalized = check_prepare_banned_pattern_text(entry);
    let mut violations = Vec::new();
    for pattern in &rule.patterns {
        if pattern.allowed_files.contains(&entry.file.relative_from_project_root) {
            continue;
        }
        let occurrences = check_count_occurrences(&normalized, &pattern.normalized_value);
        if occurrences == 0 {
            continue;
        }
        violations.push(check_violation(
                "banned-patterns",
                false,
                entry.file.relative_from_project_root.clone(),
                format!(
                    "file contains banned pattern \"{}\"{}",
                    pattern.value,
                    if occurrences > 1 { format!(" {occurrences} times") } else { String::new() },
                ),
                json!({
                        "pattern": pattern.value,
                        "occurrences": occurrences,
                        "foldedOccurrences": 0,
                        "foldedMatches": [],
                        "allowedFiles": pattern.allowed_files,
                }),
        ));
    }
    violations
}

fn check_prepare_banned_pattern_text(entry: &CheckTextFile) -> String {
    let mut normalized = entry.text.to_lowercase();
    for specifier in check_collect_module_specifiers(entry) {
        normalized = normalized.replace(&specifier.specifier.to_lowercase(), "");
    }
    let state = CHECK_STATE_DIR.to_string();
    while let Some(index) = normalized.find(&state) {
        let end = check_state_path_end(&normalized, index + state.len());
        normalized.replace_range(index..end, "");
    }
    normalized
}

fn check_state_path_end(text: &str, start: usize) -> usize {
    let mut end = start;
    let bytes = text.as_bytes();
    while end < text.len() {
        let value = bytes[end];
        if value.is_ascii_alphanumeric() || matches!(value, b'-' | b'.' | b'/' | b'_') {
            end += 1;
        } else {
            break;
        }
    }
    end
}

fn check_count_occurrences(text: &str, pattern: &str) -> usize {
    if pattern.is_empty() {
        return 0;
    }
    let mut count = 0_usize;
    let mut index = 0_usize;
    while index <= text.len().saturating_sub(pattern.len()) {
        let Some(found) = text[index..].find(pattern) else {
            break;
        };
        count += 1;
        index += found + 1;
    }
    count
}

fn check_push_banned_file_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.banned_files else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .iter()
    .flat_map(|entry| {
            rule.patterns
            .iter()
            .filter(|pattern| check_matches_glob(&entry.file.relative_from_project_root, &pattern.glob))
            .map(|pattern| check_violation(
                    "banned-files",
                    false,
                    entry.file.relative_from_project_root.clone(),
                    format!("file path matches banned glob \"{}\"", pattern.glob),
                    json!({ "glob": pattern.glob }),
            ))
            .collect::<Vec<_>>()
    })
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_push_min_file_line_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.min_file_lines else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .filter_map(|entry| {
            let line_count = count_code_lines(&mask_comments_for_line_count(&entry.text, &entry.file.extension), &entry.file.extension);
            (line_count <= rule.min).then(|| check_violation(
                    "min-file-lines",
                    false,
                    entry.file.relative_from_project_root.clone(),
                    format!("file has {line_count} {} and is at or below the banned minimum of {}", check_line_label(line_count), rule.min),
                    json!({ "lineCount": line_count, "min": rule.min }),
            ))
    })
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_push_min_declaration_name_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.min_declaration_name else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .flat_map(|entry| {
            check_collect_declarations(&entry.file, &entry.text)
            .into_iter()
            .filter_map(|declaration| {
                    let length = check_measure_declaration_name(&declaration.name);
                    (length < rule.min).then(|| check_violation(
                            "min-declaration-name",
                            false,
                            entry.file.relative_from_project_root.clone(),
                            format!(
                                "{} {} has {length} {} and is below the minimum name length of {}",
                                declaration.kind,
                                declaration.name,
                                if length == 1 { "character" } else { "characters" },
                                rule.min,
                            ),
                            json!({
                                    "declarationKind": declaration.kind,
                                    "declarationName": declaration.name,
                                    "line": declaration.line,
                                    "length": length,
                                    "min": rule.min,
                            }),
                    ))
            })
            .collect::<Vec<_>>()
    })
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_push_max_file_line_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.max_file_lines else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .flat_map(|entry| check_max_file_line_file_violations(entry, rule.max))
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_max_file_line_file_violations(entry: &CheckTextFile, max: usize) -> Vec<CodeDisciplineViolation> {
    let line_count = count_lines(&entry.text);
    let code_line_count = count_code_lines(&mask_comments_for_line_count(&entry.text, &entry.file.extension), &entry.file.extension);
    if code_line_count > max {
        vec![create_max_file_lines_violation(&entry.file, code_line_count, max)]
    } else if line_count > max {
        vec![create_max_file_lines_warning(&entry.file, line_count, code_line_count, max)]
    } else {
        Vec::new()
    }
}

fn check_push_max_character_line_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.max_characters_per_line else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .flat_map(|entry| check_max_character_file_violations(entry, rule.max))
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_max_character_file_violations(entry: &CheckTextFile, max: usize) -> Vec<CodeDisciplineViolation> {
    if entry.file.extension == ".svg" {
        return Vec::new();
    }
    let mut violations = Vec::new();
    let mut svg_depth = 0_i32;
    for (index, line) in entry.text.lines().enumerate() {
        if is_ts_family_extension(&entry.file.extension) {
            let open = line.matches("<svg").count() as i32;
            let close = line.matches("</svg").count() as i32;
            let inside_svg = svg_depth > 0 || open > 0;
            svg_depth = (svg_depth + open - close).max(0);
            if inside_svg {
                continue;
            }
        }
        let count = line.chars().count();
        if count <= max {
            continue;
        }
        violations.push(check_violation(
                "max-characters-per-line",
                false,
                entry.file.relative_from_project_root.clone(),
                format!("line {} has {count} characters and exceeds the limit of {max}", index + 1),
                json!({ "line": index + 1, "characterCount": count, "max": max }),
        ));
    }
    violations
}

fn check_push_max_function_line_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.max_function_lines else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .flat_map(|entry| check_max_function_file_violations(entry, rule.max))
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_max_function_file_violations(entry: &CheckTextFile, max: usize) -> Vec<CodeDisciplineViolation> {
    let masked = mask_comments_for_line_count(&entry.text, &entry.file.extension);
    check_collect_function_spans(&entry.file, &entry.text)
    .into_iter()
    .flat_map(|span| {
            let code_count = count_code_lines_in_range(&masked, span.start_line, span.end_line);
            if code_count > max {
                vec![create_max_function_lines_violation(
                        &entry.file,
                        &span.kind,
                        &span.name,
                        code_count,
                        max,
                        span.start_line,
                        span.end_line,
                )]
            } else if span.line_count > max {
                vec![create_max_function_lines_warning(
                        &entry.file,
                        &span.kind,
                        &span.name,
                        span.line_count,
                        code_count,
                        max,
                        span.start_line,
                        span.end_line,
                )]
            } else {
                Vec::new()
            }
    })
    .collect()
}
