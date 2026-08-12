fn check_push_redundant_path_segment_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.redundant_path_segments else {
        return;
    };
    let files = check_files_for_rule(text_files, &rule.exclude_dirs)
    .into_iter()
    .map(|entry| entry.file)
    .collect::<Vec<_>>();
    violations.append(&mut collect_redundant_path_segments_violations(&files, &rule.separators));
}

fn check_push_import_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.imports else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .filter(|entry| check_supports_imports(&entry.file.extension))
    .flat_map(|entry| check_import_file_violations(entry, rule))
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_import_file_violations(entry: &CheckTextFile, rule: &NativeImportsRule) -> Vec<CodeDisciplineViolation> {
    let mut violations = Vec::new();
    let specifiers = check_collect_module_specifiers(entry);
    for occurrence in &specifiers {
        if !check_relative_specifier(&occurrence.specifier) {
            continue;
        }
        let Some(resolved_file) = check_resolve_relative_import(&occurrence.specifier, &entry.file, rule) else {
            violations.push(check_violation(
                    "imports",
                    occurrence.removal_start.is_some() && occurrence.removal_end.is_some(),
                    entry.file.relative_from_project_root.clone(),
                    format!("unresolved import {} should be removed", occurrence.specifier),
                    json!({ "specifier": occurrence.specifier }),
            ));
            continue;
        };
        if check_relative_allowed(&occurrence.specifier, rule) {
            continue;
        }
        let Some(alias_id) = rule.alias_ids_by_file_path.get(&resolved_file) else {
            continue;
        };
        violations.push(check_violation(
                "imports",
                true,
                entry.file.relative_from_project_root.clone(),
                format!("relative import {} should be rewritten to {alias_id}", occurrence.specifier),
                json!({
                        "specifier": occurrence.specifier,
                        "aliasId": alias_id,
                        "resolvedFile": resolved_file,
                }),
        ));
    }
    if rule.remove_dead_imports && is_ts_family_extension(&entry.file.extension) {
        violations.extend(check_dead_import_violations(entry));
    }
    violations
}

fn check_dead_import_violations(entry: &CheckTextFile) -> Vec<CodeDisciplineViolation> {
    let imports = check_collect_imported_names(&entry.text);
    if imports.is_empty() {
        return Vec::new();
    }
    let used_text = entry
    .text
    .lines()
    .filter(|line| !line.trim_start().starts_with("import "))
    .collect::<Vec<_>>()
    .join("\n");
    imports
    .into_iter()
    .filter(|name| !check_contains_identifier(&used_text, name))
    .map(|name| check_violation(
            "imports",
            true,
            entry.file.relative_from_project_root.clone(),
            format!("unused import {name} should be removed"),
            json!({ "name": name }),
    ))
    .collect()
}

fn check_collect_imported_names(text: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut pending = String::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        if pending.is_empty() && !trimmed.starts_with("import ") {
            continue;
        }
        if pending.is_empty() {
            if check_side_effect_import_statement(trimmed) {
                continue;
            }
            pending.push_str(trimmed);
        } else {
            pending.push(' ');
            pending.push_str(trimmed);
        }
        if !pending.contains(" from ") {
            continue;
        }
        names.extend(check_collect_imported_names_from_statement(&pending));
        pending.clear();
    }
    names
}

fn check_side_effect_import_statement(statement: &str) -> bool {
    let clause = statement["import ".len()..].trim_start();
    clause.starts_with('"') || clause.starts_with('\'')
}

fn check_collect_imported_names_from_statement(statement: &str) -> Vec<String> {
    let mut names = Vec::new();
    let clause = statement["import ".len()..]
    .split(" from ")
    .next()
    .unwrap_or("")
    .trim()
    .trim_start_matches("type ")
    .trim();
    if let Some(rest) = clause.strip_prefix("{") {
        names.extend(check_collect_named_imports(rest));
    } else if let Some(rest) = check_strip_namespace_import_clause(clause) {
        names.push(rest.trim().to_string());
    } else if !clause.is_empty() {
        let default = clause.split(',').next().unwrap_or("").trim();
        if !default.is_empty() {
            names.push(default.to_string());
        }
        if let Some(start) = clause.find('{') {
            names.extend(check_collect_named_imports(&clause[start + 1..]));
        }
    }
    names
}

fn check_strip_namespace_import_clause(clause: &str) -> Option<&str> {
    clause
    .strip_prefix("* as ")
    .or_else(|| clause.strip_prefix("*as "))
}

fn check_collect_named_imports(value: &str) -> Vec<String> {
    value
    .trim_end_matches(';')
    .trim_end_matches('}')
    .split(',')
    .filter_map(|piece| {
            let part = piece.trim();
            let name = part.split_whitespace().last().unwrap_or("");
            (!name.is_empty()).then(|| name.to_string())
    })
    .collect()
}

fn check_contains_identifier(text: &str, identifier: &str) -> bool {
    let mut start = 0_usize;
    while let Some(index) = text[start..].find(identifier) {
        let absolute = start + index;
        let before = text[..absolute].chars().next_back().unwrap_or(' ');
        let after = text[absolute + identifier.len()..].chars().next().unwrap_or(' ');
        if !check_identifier_char(before) && !check_identifier_char(after) {
            return true;
        }
        start = absolute + 1;
    }
    false
}

fn check_identifier_char(value: char) -> bool {
    value.is_ascii_alphanumeric() || value == '_' || value == '$'
}

fn check_push_remove_comment_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.remove_comments else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .filter(|entry| supports_remove_comments(&entry.file.extension))
    .filter_map(|entry| {
            let result = strip_comments_internal(&entry.text, &entry.file.extension, &rule.exclude);
            result.changed.then(|| create_remove_comments_violation(&entry.file, &result))
    })
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_push_structural_blank_line_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.structural_blank_lines else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .filter(|entry| supports_remove_comments(&entry.file.extension))
    .filter_map(|entry| {
            let result = check_rewrite_structural_blank_lines(&entry.file, &entry.text);
            let boundary_label = if result.boundary_count == 1 { "boundary" } else { "boundaries" };
            result.changed.then(|| check_violation(
                    "structural-blank-lines",
                    true,
                    entry.file.relative_from_project_root.clone(),
                    format!(
                        "file has {} structural {boundary_label} with incorrect blank line spacing",
                        result.boundary_count,
                    ),
                    json!({
                            "boundaryCount": result.boundary_count,
                            "insertedBlankLines": result.inserted_blank_lines,
                            "removedBlankLines": result.removed_blank_lines,
                    }),
            ))
    })
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_push_dry_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.dry else {
        return;
    };
    let files = check_files_for_rule(text_files, &rule.exclude_dirs)
    .into_iter()
    .filter(|entry| check_supports_dry(&entry.file.extension))
    .collect::<Vec<_>>();
    violations.append(&mut check_collect_dry_violations(&files, rule));
}
