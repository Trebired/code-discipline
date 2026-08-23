const CHECK_STATE_DIR: &str = ".trebired/code-discipline";

fn check_normalized_path(value: &str) -> String {
    normalize_relative_path(value).trim_end_matches('/').to_string()
}

fn check_is_state_path(value: &str) -> bool {
    let normalized = check_normalized_path(value);
    normalized == CHECK_STATE_DIR || normalized.starts_with(&format!("{CHECK_STATE_DIR}/"))
}

fn check_matches_glob(file_path: &str, glob: &str) -> bool {
    let path = normalize_relative_path(file_path);
    let pattern = normalize_relative_path(glob);
    check_match_glob_parts(
        &path.split('/').collect::<Vec<_>>(),
        &pattern.split('/').collect::<Vec<_>>(),
    )
}

fn check_match_glob_parts(path_parts: &[&str], pattern_parts: &[&str]) -> bool {
    if pattern_parts.is_empty() {
        return path_parts.is_empty();
    }
    if pattern_parts[0] == "**" {
        return check_match_glob_parts(path_parts, &pattern_parts[1..])
        ||(!path_parts.is_empty() && check_match_glob_parts(&path_parts[1..], pattern_parts));
    }
    if path_parts.is_empty() {
        return false;
    }
    check_match_glob_segment(path_parts[0], pattern_parts[0])
    && check_match_glob_parts(&path_parts[1..], &pattern_parts[1..])
}

fn check_match_glob_segment(value: &str, pattern: &str) -> bool {
    let value_chars = value.chars().collect::<Vec<_>>();
    let pattern_chars = pattern.chars().collect::<Vec<_>>();
    check_match_segment_chars(&value_chars, &pattern_chars)
}

fn check_match_segment_chars(value: &[char], pattern: &[char]) -> bool {
    if pattern.is_empty() {
        return value.is_empty();
    }
    match pattern[0] {
        '*' => {
            check_match_segment_chars(value, &pattern[1..])
            ||(!value.is_empty() && check_match_segment_chars(&value[1..], pattern))
        }
        '?' => !value.is_empty() && check_match_segment_chars(&value[1..], &pattern[1..]),
        ch => !value.is_empty() && value[0] == ch && check_match_segment_chars(&value[1..], &pattern[1..]),
    }
}

fn check_posix_dirname(value: &str) -> String {
    posix_dirname(value)
}

fn check_matches_excluded_folder(file_path: &str, folder_pattern: &str) -> bool {
    let pattern = check_normalized_path(folder_pattern);
    if pattern.is_empty() {
        return false;
    }
    let directory = check_posix_dirname(file_path);
    if !pattern.contains('/') {
        if directory.split('/').any(|part| check_matches_glob(part, &pattern)) {
            return true;
        }
    }
    directory == pattern
    || directory.starts_with(&format!("{pattern}/"))
    || file_path == pattern
    || file_path.starts_with(&format!("{pattern}/"))
    || check_matches_glob(&directory, &pattern)
    || check_matches_glob(&directory, &format!("**/{pattern}"))
    || check_matches_glob(file_path, &format!("{pattern}/**"))
    || check_matches_glob(file_path, &format!("**/{pattern}/**"))
}

fn check_is_rule_excluded(file: &ScannedSourceFile, exclude_dirs: &[NativeExcludeDirEntry]) -> bool {
    let relative_path = normalize_relative_path(&file.relative_from_project_root);
    exclude_dirs.iter().any(|entry| {
            if entry.entry_type == "file" {
                check_matches_glob(&relative_path, &entry.pattern)
            } else {
                check_matches_excluded_folder(&relative_path, &entry.pattern)
            }
    })
}

fn check_files_for_rule(
    source_files: &[CheckTextFile],
    exclude_dirs: &[NativeExcludeDirEntry],
) -> Vec<CheckTextFile> {
    source_files
    .iter()
    .filter(|entry| !check_is_rule_excluded(&entry.file, exclude_dirs))
    .cloned()
    .collect()
}

fn check_read_text_files(source_files: Vec<ScannedSourceFile>) -> Vec<CheckTextFile> {
    source_files
    .into_par_iter()
    .filter_map(|file| {
            let text = fs::read_to_string(&file.absolute_path).ok()?;
            Some(CheckTextFile { file, text })
    })
    .collect()
}

fn check_clean_path(value: PathBuf) -> PathBuf {
    let mut clean = PathBuf::new();
    for component in value.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                clean.pop();
            }
            _ => clean.push(component.as_os_str()),
        }
    }
    clean
}

fn check_line_label(count: usize) -> &'static str {
    if count == 1 { "line" } else { "lines" }
}

fn check_language_key(extension: &str) -> String {
    if is_ts_family_extension(extension) {
        "typescript".to_string()
    } else if is_go_extension(extension) {
        "go".to_string()
    } else if is_rust_extension(extension) {
        "rust".to_string()
    } else if is_cpp_extension(extension) {
        "cpp".to_string()
    } else if is_csharp_extension(extension) {
        "csharp".to_string()
    } else if is_python_extension(extension) {
        "python".to_string()
    } else if is_shell_extension(extension) {
        "shell".to_string()
    } else if is_qml_extension(extension) {
        "qml".to_string()
    } else {
        extension.to_string()
    }
}

fn check_supports_imports(extension: &str) -> bool {
    is_ts_family_extension(extension) || is_scss_extension(extension)
}

fn check_supports_dry(extension: &str) -> bool {
    is_ts_family_extension(extension)
    || is_go_extension(extension)
    || is_rust_extension(extension)
    || is_cpp_extension(extension)
    || is_csharp_extension(extension)
    || is_python_extension(extension)
    || is_shell_extension(extension)
    || is_qml_extension(extension)
}

fn check_violation(
    rule: &str,
    fix: bool,
    file_path: String,
    message: String,
    details: serde_json::Value,
) -> CodeDisciplineViolation {
    CodeDisciplineViolation {
        rule: rule.to_string(),
        fix,
        file_path,
        message,
        details,
        severity: None,
        suggested_path: None,
    }
}
