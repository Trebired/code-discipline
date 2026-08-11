#[napi]
pub fn format_source_text(request_json: String) -> Result<String> {
    let request: FormatSourceTextRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let text = format_source_internal(&request.text, &request.extension, &request.options);
    serde_json::to_string(&NativeFormatSourceTextResult {
            changed: text != request.text,
            text,
    })
    .map_err(|error| err(error.to_string()))
}

#[napi]
pub fn format_source_files(request_json: String) -> Result<String> {
    let request: FormatSourceFilesRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut files: Vec<NativeFormatFileResult> = request
    .source_files
    .par_iter()
    .map(|file| format_file(file, &request.options, &request.mode))
    .collect();
    files.sort_by(|left, right| left.file_path.cmp(&right.file_path));
    serde_json::to_string(&NativeFormatSourceFilesResult { files })
    .map_err(|error| err(error.to_string()))
}

#[napi]
pub fn strip_comments(request_json: String) -> Result<String> {
    let request: StripCommentsRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let result = strip_comments_internal(
        &request.text,
        &request.extension,
        &request.excluded_comment_patterns,
    );
    serde_json::to_string(&result).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn scan_source_files(request_json: String) -> Result<String> {
    let options: SourceScanRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let response = scan_source_directory(&options)?;
    serde_json::to_string(&response).map_err(|error| err(error.to_string()))
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
        let code_line_count =
        count_code_lines(&mask_comments_for_line_count(&text, &file.extension), &file.extension);

        if code_line_count > request.max {
            violations.push(create_max_file_lines_violation(
                    file,
                    code_line_count,
                    request.max,
            ));
        } else if request.warning && line_count > request.max {
            violations.push(create_max_file_lines_warning(
                    file,
                    line_count,
                    code_line_count,
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
        if is_go_extension(&file.extension)
        || is_rust_extension(&file.extension)
        || is_cpp_extension(&file.extension)
        || is_csharp_extension(&file.extension)
        {
            let text =
            fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))?;
            violations.extend(collect_block_function_violations(file, &text, request.max));
            if request.warning {
                violations.extend(collect_block_function_warnings(file, &text, request.max));
            }
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
                if request.warning {
                    violations.extend(collect_simple_typescript_function_warnings(
                            file,
                            &text,
                            request.max,
                    ));
                }
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
pub fn run_redundant_path_segments_rule(request_json: String) -> Result<String> {
    let request: RedundantPathSegmentsRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let violations =
    collect_redundant_path_segments_violations(&request.source_files, &request.separators);
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
        let result = strip_comments_internal(
            &text,
            &file.extension,
            &request.excluded_comment_patterns,
        );
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
        let result = strip_comments_internal(
            &text,
            &file.extension,
            &request.excluded_comment_patterns,
        );
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
