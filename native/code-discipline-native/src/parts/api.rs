pub fn strip_comments(text: String, extension: String) -> Result<String> {
    let result = strip_comments_internal(&text, &extension);
    serde_json::to_string(&result).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn scan_source_files(request_json: String) -> Result<String> {
    let options: SourceScanRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut rows = Vec::new();
    walk_source_directory(Path::new(&options.source_root), "", &options, &mut rows)?;
    rows.sort_by(|left, right| {
        left.relative_from_project_root
            .cmp(&right.relative_from_project_root)
    });
    serde_json::to_string(&rows).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn run_max_file_lines_rule(request_json: String) -> Result<String> {
    let request: MaxFileLinesRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut violations = Vec::new();

    for file in request.source_files.iter() {
        let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
        let line_count = count_lines(&text);

        if line_count > request.max {
            violations.push(create_max_file_lines_violation(
                file,
                line_count,
                request.max,
            ));
        }
    }

    serde_json::to_string(&violations).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn run_max_block_function_lines_rule(request_json: String) -> Result<String> {
    let request: MaxFunctionLinesRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut violations = Vec::new();
    let mut handled_paths = Vec::new();

    for file in request.source_files.iter() {
        if is_go_extension(&file.extension) || is_rust_extension(&file.extension) {
            let text =
                fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
            violations.extend(collect_block_function_violations(file, &text, request.max));
            handled_paths.push(file.absolute_path.clone());
            continue;
        }

        if is_ts_family_extension(&file.extension) {
            let text =
                fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
            if is_simple_typescript_function_file(&text) {
                violations.extend(collect_simple_typescript_function_violations(
                    file,
                    &text,
                    request.max,
                ));
                handled_paths.push(file.absolute_path.clone());
            }
        }
    }

    serde_json::to_string(&NativeMaxFunctionLinesResult {
        violations,
        handled_paths,
    })
    .map_err(|error| err(error.to_string()))
}

#[napi]
pub fn run_folderize_compound_files_rule(request_json: String) -> Result<String> {
    let request: FolderizeRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let violations = collect_folderize_violations(&request.source_files, &request.separators);
    serde_json::to_string(&violations).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn collect_remove_comments_violations(request_json: String) -> Result<String> {
    let request: SourceFilesRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut violations = Vec::new();

    for file in request.source_files.iter() {
        if !supports_remove_comments(&file.extension) {
            continue;
        }

        let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
        let result = strip_comments_internal(&text, &file.extension);
        if !result.changed {
            continue;
        }

        violations.push(create_remove_comments_violation(file, &result));
    }

    serde_json::to_string(&violations).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn fix_remove_comments_rule(request_json: String) -> Result<String> {
    let request: SourceFilesRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut rewritten_files = 0_usize;
    let mut removed_comments = 0_usize;

    for file in request.source_files.iter() {
        if !supports_remove_comments(&file.extension) {
            continue;
        }

        let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
        let result = strip_comments_internal(&text, &file.extension);
        if !result.changed {
            continue;
        }

        fs::write(&file.absolute_path, result.text).map_err(|error| err(error.to_string()))?;
        rewritten_files += 1;
        removed_comments += result.comment_count;
    }

    let result = FixRuleResult {
        ok: true,
        violation_count: 0,
        violations: Vec::new(),
        rewritten_files,
        removed_comments,
    };

    serde_json::to_string(&result).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn run_evasion_guards_rule(request_json: String) -> Result<String> {
    let request: EvasionGuardsRequest =
        serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut violations = Vec::new();

    for file in request.source_files.iter() {
        let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
        violations.extend(collect_evasion_guard_violations(
            file,
            &text,
            &request.evasion_guards,
        ));
    }

    serde_json::to_string(&violations).map_err(|error| err(error.to_string()))
}
