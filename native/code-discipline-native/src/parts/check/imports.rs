fn check_collect_module_specifiers(file: &CheckTextFile) -> Vec<CheckModuleSpecifier> {
    if is_scss_extension(&file.file.extension) {
        return check_collect_scss_specifiers(&file.text);
    }
    check_collect_script_specifiers(&file.text)
}

fn check_collect_script_specifiers(text: &str) -> Vec<CheckModuleSpecifier> {
    let mut specifiers = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("import ") || trimmed.starts_with("export ") {
            if let Some(specifier) = check_extract_static_module_specifier(trimmed) {
                specifiers.push(specifier);
            }
        }
        let mut rest = trimmed;
        while let Some(index) = rest.find("import(") {
            let after = &rest[index + "import(".len()..];
            if let Some(specifier) = check_quoted_specifier(after) {
                specifiers.push(specifier);
            }
            rest = &after[1.min(after.len())..];
        }
    }
    specifiers
}

fn check_extract_static_module_specifier(line: &str) -> Option<CheckModuleSpecifier> {
    if let Some(index) = line.find(" from ") {
        return check_quoted_specifier(&line[index + 6..]);
    }
    if line.starts_with("import ") {
        return check_quoted_specifier(&line["import ".len()..]).map(|mut specifier| {
                specifier.removal_start = Some(0);
                specifier.removal_end = Some(line.len() + 1);
                specifier
        });
    }
    None
}

fn check_quoted_specifier(text: &str) -> Option<CheckModuleSpecifier> {
    let trimmed = text.trim_start();
    let quote = trimmed.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let mut escaped = false;
    for (index, ch) in trimmed[1..].char_indices() {
        if escaped {
            escaped = false;
        } else if ch == '\\' {
            escaped = true;
        } else if ch == quote {
            return Some(CheckModuleSpecifier {
                    specifier: trimmed[1..1 + index].to_string(),
                    removal_end: None,
                    removal_start: None,
            });
        }
    }
    None
}

fn check_collect_scss_specifiers(text: &str) -> Vec<CheckModuleSpecifier> {
    let mut specifiers = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        let directive = ["@use", "@forward", "@import"]
        .iter()
        .find(|directive| trimmed.starts_with(**directive));
        if directive.is_none() {
            continue;
        }
        for quoted in check_collect_quoted_segments(trimmed) {
            specifiers.push(CheckModuleSpecifier {
                    specifier: quoted,
                    removal_end: None,
                    removal_start: None,
            });
            if directive != Some(&"@import") {
                break;
            }
        }
    }
    specifiers
}

fn check_collect_quoted_segments(text: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut quote = '\0';
    let mut start = 0_usize;
    let mut escaped = false;
    for (index, ch) in text.char_indices() {
        if quote != '\0' {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == quote {
                result.push(text[start..index].to_string());
                quote = '\0';
            }
            continue;
        }
        if ch == '"' || ch == '\'' {
            quote = ch;
            start = index + 1;
        }
    }
    result
}

fn check_relative_specifier(specifier: &str) -> bool {
    specifier.starts_with("./") || specifier.starts_with("../")
}

fn check_resolve_relative_import(
    specifier: &str,
    file: &ScannedSourceFile,
    rule: &NativeImportsRule,
) -> Option<String> {
    if !check_relative_specifier(specifier) {
        return None;
    }
    let base = Path::new(&file.absolute_path).parent()?.join(specifier);
    let resolved = if is_scss_extension(&file.extension) {
        check_resolve_sass_candidate(&base)
    } else {
        check_resolve_file_candidate(&base, &rule.source_extensions)
    }?;
    let source_root = Path::new(&rule.source_root);
    if !resolved.starts_with(source_root) {
        return None;
    }
    Some(resolved.to_string_lossy().to_string())
}

fn check_resolve_file_candidate(base: &Path, extensions: &[String]) -> Option<PathBuf> {
    let mut candidates = vec![base.to_path_buf()];
    if let Some(extension) = base.extension().map(|value| format!(".{}", value.to_string_lossy().to_lowercase())) {
        if matches!(extension.as_str(), ".js" | ".jsx" | ".mjs" | ".cjs") {
            let stem = base.with_extension("");
            candidates.extend(extensions.iter().map(|extension| PathBuf::from(format!("{}{}", stem.to_string_lossy(), extension))));
        }
    }
    candidates.extend(extensions.iter().map(|extension| PathBuf::from(format!("{}{}", base.to_string_lossy(), extension))));
    for candidate in candidates {
        if candidate.is_file() {
            return Some(check_clean_path(candidate));
        }
    }
    for extension in extensions {
        let candidate = base.join(format!("index{extension}"));
        if candidate.is_file() {
            return Some(check_clean_path(candidate));
        }
    }
    None
}

fn check_resolve_sass_candidate(base: &Path) -> Option<PathBuf> {
    let parent = base.parent().unwrap_or_else(|| Path::new(""));
    let basename = base.file_name()?.to_string_lossy();
    let candidates = [
        PathBuf::from(format!("{}.scss", base.to_string_lossy())),
        parent.join(format!("_{}.scss", basename)),
        base.join("index.scss"),
        base.join("_index.scss"),
    ];
    candidates.into_iter().find(|candidate| candidate.is_file()).map(check_clean_path)
}

fn check_relative_allowed(specifier: &str, rule: &NativeImportsRule) -> bool {
    rule.allow_relative
    .iter()
    .any(|entry| specifier == entry || specifier.starts_with(entry))
}
