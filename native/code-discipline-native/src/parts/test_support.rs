#[cfg(test)]
fn test_source_file(path: &str, extension: &str) -> ScannedSourceFile {
    ScannedSourceFile {
        absolute_path: format!("/repo/{path}"),
        relative_from_project_root: path.to_string(),
        relative_from_source_root: path.strip_prefix("src/").unwrap_or(path).to_string(),
        extension: extension.to_string(),
    }
}
