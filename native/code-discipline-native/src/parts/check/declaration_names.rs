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
                    (length < rule.min).then(|| {
                            create_declaration_name_violation(
                                "min-declaration-name",
                                &entry.file.relative_from_project_root,
                                &declaration,
                                length,
                                "below the minimum",
                                "min",
                                rule.min,
                            )
                    })
            })
            .collect::<Vec<_>>()
    })
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn check_push_max_declaration_name_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    text_files: &[CheckTextFile],
    rules: &NativeCheckRules,
) {
    let Some(rule) = &rules.max_declaration_name else {
        return;
    };
    let mut rows = check_files_for_rule(text_files, &rule.exclude_dirs)
    .par_iter()
    .flat_map(|entry| {
            check_collect_declarations(&entry.file, &entry.text)
            .into_iter()
            .filter_map(|declaration| {
                    let length = check_measure_declaration_name(&declaration.name);
                    (length > rule.max).then(|| {
                            create_declaration_name_violation(
                                "max-declaration-name",
                                &entry.file.relative_from_project_root,
                                &declaration,
                                length,
                                "exceeds the maximum",
                                "max",
                                rule.max,
                            )
                    })
            })
            .collect::<Vec<_>>()
    })
    .collect::<Vec<_>>();
    violations.append(&mut rows);
}

fn create_declaration_name_violation(
    rule: &str,
    file_path: &str,
    declaration: &CheckDeclaration,
    length: usize,
    comparator: &str,
    limit_key: &str,
    limit: usize,
) -> CodeDisciplineViolation {
    let mut details = json!({
            "declarationKind": declaration.kind,
            "declarationName": declaration.name,
            "line": declaration.line,
            "length": length,
    });
    if let Some(object) = details.as_object_mut() {
        object.insert(limit_key.to_string(), json!(limit));
    }
    check_violation(
        rule,
        false,
        file_path.to_string(),
        format!(
            "{} {} has {length} {} and {comparator} name length of {limit}",
            declaration.kind,
            declaration.name,
            if length == 1 { "character" } else { "characters" },
        ),
        details,
    )
}
