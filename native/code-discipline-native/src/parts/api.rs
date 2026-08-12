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
pub fn collect_dry_descriptors(request_json: String) -> Result<String> {
    let request: NativeDryDescriptorRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let text_files = check_read_text_files(request.source_files)
    .into_iter()
    .filter(|entry| check_supports_dry(&entry.file.extension))
    .collect::<Vec<_>>();
    let descriptors = check_collect_dry_descriptors(&text_files);
    serde_json::to_string(&NativeDryDescriptorResponse { descriptors })
    .map_err(|error| err(error.to_string()))
}

#[napi]
pub fn collect_dry_violations_from_descriptors(request_json: String) -> Result<String> {
    let request: NativeDryViolationsFromDescriptorsRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let violations = check_collect_dry_violations_from_descriptors(
        request.descriptors,
        &request.rule,
    );
    serde_json::to_string(&NativeCheckRulesResponse { violations })
    .map_err(|error| err(error.to_string()))
}

#[napi]
pub fn start_dry_descriptor_session() -> Result<String> {
    check_start_dry_descriptor_session()
}

#[napi]
pub fn append_dry_descriptors_to_session(request_json: String) -> Result<String> {
    let request: NativeDrySessionAppendRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let response = check_append_dry_descriptors_to_session(
        &request.session_id,
        request.source_files,
    )?;
    serde_json::to_string(&response).map_err(|error| err(error.to_string()))
}

#[napi]
pub fn finish_dry_descriptor_session(request_json: String) -> Result<String> {
    let request: NativeDrySessionFinishRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let violations = check_finish_dry_descriptor_session(&request.session_id, &request.rule)?;
    serde_json::to_string(&NativeCheckRulesResponse { violations })
    .map_err(|error| err(error.to_string()))
}

#[napi]
pub fn discard_dry_descriptor_session(request_json: String) -> Result<String> {
    let request: NativeDrySessionRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    check_discard_dry_descriptor_session(&request.session_id)?;
    Ok("{}".to_string())
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
        if push_block_function_file_result(file, &request, &mut violations, &mut handled_paths)? {
            continue;
        }

        push_simple_typescript_function_file_result(file, &request, &mut violations, &mut handled_paths)?;
    }

    serde_json::to_string(&NativeMaxFunctionLinesResult {
            violations,
            handled_paths,
    })
    .map_err(|error| err(error.to_string()))
}

fn read_source_file_text(file: &ScannedSourceFile) -> Result<String> {
    fs::read_to_string(&file.absolute_path).map_err(|error| err(error.to_string()))
}

fn push_block_function_file_result(
    file: &ScannedSourceFile,
    request: &MaxFunctionLinesRequest,
    violations: &mut Vec<CodeDisciplineViolation>,
    handled_paths: &mut Vec<String>,
) -> Result<bool> {
    if !supports_block_function_lines(&file.extension) {
        return Ok(false);
    }

    let text = read_source_file_text(file)?;
    push_function_line_reports(
        violations,
        file,
        &text,
        request.max,
        request.warning,
        collect_block_function_reports,
    );
    handled_paths.push(file.absolute_path.clone());
    Ok(true)
}

fn push_simple_typescript_function_file_result(
    file: &ScannedSourceFile,
    request: &MaxFunctionLinesRequest,
    violations: &mut Vec<CodeDisciplineViolation>,
    handled_paths: &mut Vec<String>,
) -> Result<()> {
    if !is_ts_family_extension(&file.extension) {
        return Ok(());
    }

    let text = read_source_file_text(file)?;
    if !is_simple_typescript_function_file(&text) {
        return Ok(());
    }

    push_function_line_reports(
        violations,
        file,
        &text,
        request.max,
        request.warning,
        collect_simple_typescript_function_reports,
    );
    handled_paths.push(file.absolute_path.clone());
    Ok(())
}

fn push_function_line_reports(
    violations: &mut Vec<CodeDisciplineViolation>,
    file: &ScannedSourceFile,
    text: &str,
    max: usize,
    include_warning: bool,
    collector: fn(&ScannedSourceFile, &str, usize, FunctionLineReportKind) -> Vec<CodeDisciplineViolation>,
) {
    violations.extend(collector(file, text, max, FunctionLineReportKind::Violation));
    if include_warning {
        violations.extend(collector(file, text, max, FunctionLineReportKind::Warning));
    }
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
