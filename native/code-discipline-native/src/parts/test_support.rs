#[cfg(test)]
fn test_source_file(path: &str, extension: &str) -> ScannedSourceFile {
    ScannedSourceFile {
        absolute_path: format!("/repo/{path}"),
        relative_from_project_root: path.to_string(),
        relative_from_source_root: path.strip_prefix("src/").unwrap_or(path).to_string(),
        extension: extension.to_string(),
        byte_size: 0,
    }
}

#[cfg(test)]
fn formatter_test_options(max: usize) -> NativeFormatterOptions {
    NativeFormatterOptions {
        max_characters_per_line: max,
        indent_width: None,
        final_newline: true,
        trim_trailing_whitespace: true,
        collapse_blank_lines: true,
    }
}

#[cfg(test)]
fn assert_formatter_lines_fit(text: &str, max: usize) {
    for (index, line) in text.lines().enumerate() {
        assert!(
            count_display_characters(line) <= max,
            "line {} has {} characters: {}",
            index + 1,
            count_display_characters(line),
            line,
        );
    }
}
