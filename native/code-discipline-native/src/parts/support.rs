#[derive(Clone, Copy)]
enum CommentKind {
    Line,
    Block,
}

#[derive(Clone, Copy)]
struct CommentRange {
    start: usize,
    end: usize,
    kind: CommentKind,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommentStripResult {
    changed: bool,
    text: String,
    comment_count: usize,
    line_comments: usize,
    block_comments: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceScanRequest {
    project_root: String,
    source_root: String,
    source_extensions: Vec<String>,
    exclude_dirs: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedSourceFile {
    absolute_path: String,
    relative_from_project_root: String,
    relative_from_source_root: String,
    extension: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceFilesRequest {
    source_files: Vec<ScannedSourceFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaxFileLinesRequest {
    source_files: Vec<ScannedSourceFile>,
    max: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackedCodeGuardOptions {
    min_packed_line_columns: usize,
    max_semicolons_per_line: usize,
    max_structural_tokens_per_line: usize,
    max_packed_function_lines: usize,
    max_packed_function_statements: usize,
    min_packed_function_characters: usize,
    max_packed_file_non_empty_lines: usize,
    min_packed_file_characters: usize,
    min_packed_file_structural_tokens: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvasionGuardsOptions {
    packed_code: Option<PackedCodeGuardOptions>,
    runtime_code_hiding: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvasionGuardsRequest {
    source_files: Vec<ScannedSourceFile>,
    evasion_guards: EvasionGuardsOptions,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FolderizeRequest {
    source_files: Vec<ScannedSourceFile>,
    separators: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaxFunctionLinesRequest {
    source_files: Vec<ScannedSourceFile>,
    max: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeDisciplineViolation {
    rule: String,
    fix: bool,
    file_path: String,
    message: String,
    details: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    suggested_path: Option<String>,
}

#[derive(Serialize)]
struct FixRuleResult {
    ok: bool,
    #[serde(rename = "violationCount")]
    violation_count: usize,
    violations: Vec<CodeDisciplineViolation>,
    rewritten_files: usize,
    removed_comments: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeMaxFunctionLinesResult {
    violations: Vec<CodeDisciplineViolation>,
    handled_paths: Vec<String>,
}

fn err(message: impl Into<String>) -> napi::Error {
    napi::Error::from_reason(message.into())
}

fn to_posix_path(value: &Path) -> String {
    value.to_string_lossy().replace('\\', "/")
}

fn normalize_relative_path(value: impl AsRef<str>) -> String {
    let mut normalized = value.as_ref().replace('\\', "/");
    while normalized.starts_with("./") {
        normalized = normalized[2..].to_string();
    }
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    if normalized == "." {
        String::new()
    } else {
        normalized
    }
}

fn path_relative_from(base: &Path, value: &Path) -> String {
    value
        .strip_prefix(base)
        .map(to_posix_path)
        .map(normalize_relative_path)
        .unwrap_or_else(|_| to_posix_path(value))
}

fn extension_for_path(path: &Path) -> String {
    path.extension()
        .map(|value| format!(".{}", value.to_string_lossy().to_lowercase()))
        .unwrap_or_default()
}

fn should_exclude_directory(
    relative_dir: &str,
    project_relative_dir: &str,
    directory_name: &str,
    exclude_dirs: &[String],
) -> bool {
    let normalized_relative_dir = normalize_relative_path(relative_dir);
    let normalized_project_relative_dir = normalize_relative_path(project_relative_dir);

    exclude_dirs.iter().any(|entry| {
        let normalized_entry = normalize_relative_path(entry);
        directory_name == normalized_entry
            || normalized_relative_dir == normalized_entry
            || normalized_relative_dir.starts_with(&format!("{normalized_entry}/"))
    }) || exclude_dirs.iter().any(|entry| {
        let normalized_entry = normalize_relative_path(entry);
        normalized_project_relative_dir == normalized_entry
            || normalized_project_relative_dir.starts_with(&format!("{normalized_entry}/"))
    })
}

fn walk_source_directory(
    directory_path: &Path,
    relative_dir: &str,
    options: &SourceScanRequest,
    rows: &mut Vec<ScannedSourceFile>,
) -> Result<()> {
    let mut entries = fs::read_dir(directory_path)
        .map_err(|error| err(error.to_string()))?
        .filter_map(|entry| entry.ok())
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.file_name().cmp(&right.file_name()));

    let project_root = PathBuf::from(&options.project_root);
    let source_root = PathBuf::from(&options.source_root);

    for entry in entries {
        let absolute_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let relative_path = normalize_relative_path(if relative_dir.is_empty() {
            file_name.clone()
        } else {
            format!("{relative_dir}/{file_name}")
        });
        let project_relative_path = path_relative_from(&project_root, &absolute_path);
        let file_type = entry.file_type().map_err(|error| err(error.to_string()))?;

        if file_type.is_dir() {
            if should_exclude_directory(
                &relative_path,
                &project_relative_path,
                &file_name,
                &options.exclude_dirs,
            ) {
                continue;
            }

            walk_source_directory(&absolute_path, &relative_path, options, rows)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let extension = extension_for_path(&absolute_path);
        if !options
            .source_extensions
            .iter()
            .any(|item| item == &extension)
        {
            continue;
        }

        rows.push(ScannedSourceFile {
            absolute_path: absolute_path.to_string_lossy().to_string(),
            relative_from_project_root: path_relative_from(&project_root, &absolute_path),
            relative_from_source_root: path_relative_from(&source_root, &absolute_path),
            extension,
        });
    }

    Ok(())
}

fn is_ts_family_extension(extension: &str) -> bool {
    matches!(
        extension,
        ".cjs" | ".cts" | ".js" | ".jsx" | ".mjs" | ".mts" | ".ts" | ".tsx"
    )
}

fn is_go_extension(extension: &str) -> bool {
    extension == ".go"
}

fn is_rust_extension(extension: &str) -> bool {
    extension == ".rs"
}
