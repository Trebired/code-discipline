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
struct SourceFilesRequest {
    source_files: Vec<ScannedSourceFile>,
    #[serde(default)]
    excluded_comment_patterns: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StripCommentsRequest {
    text: String,
    extension: String,
    #[serde(default)]
    excluded_comment_patterns: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaxFileLinesRequest {
    source_files: Vec<ScannedSourceFile>,
    max: usize,
    warning: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RedundantPathSegmentsRequest {
    source_files: Vec<ScannedSourceFile>,
    separators: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaxFunctionLinesRequest {
    source_files: Vec<ScannedSourceFile>,
    max: usize,
    warning: bool,
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
    severity: Option<String>,
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

fn is_python_extension(extension: &str) -> bool {
    extension == ".py"
}

fn is_qml_extension(extension: &str) -> bool {
    extension == ".qml"
}

fn is_shell_extension(extension: &str) -> bool {
    matches!(extension, ".bash" | ".sh" | ".zsh")
}

fn is_scss_extension(extension: &str) -> bool {
    extension == ".scss"
}

fn is_style_extension(extension: &str) -> bool {
    matches!(extension, ".scss" | ".css")
}
