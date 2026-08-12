#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeExcludeDirEntry {
    #[serde(default)]
    #[serde(rename = "type")]
    entry_type: String,
    #[serde(default)]
    pattern: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeBannedPatternEntry {
    value: String,
    normalized_value: String,
    #[serde(default)]
    allowed_files: Vec<String>,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeBannedPatternsRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    #[serde(default)]
    patterns: Vec<NativeBannedPatternEntry>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeBannedFileEntry {
    glob: String,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeBannedFilesRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    #[serde(default)]
    patterns: Vec<NativeBannedFileEntry>,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeMinFileLinesRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    min: usize,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeMinDeclarationNameRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    min: usize,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeMaxFileLinesRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    max: usize,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeMaxCharactersPerLineRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    max: usize,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeMaxFunctionLinesRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    max: usize,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeRedundantPathSegmentsRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    #[serde(default)]
    separators: Vec<String>,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeImportsRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    #[serde(default)]
    allow_relative: Vec<String>,
    #[serde(default)]
    alias_ids_by_file_path: HashMap<String, String>,
    #[serde(default)]
    remove_dead_imports: bool,
    source_root: String,
    #[serde(default)]
    source_extensions: Vec<String>,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeRemoveCommentsRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    #[serde(default)]
    exclude: Vec<String>,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeStructuralBlankLinesRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeDryRule {
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    #[serde(default)]
    min_duplicate_characters: usize,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NativeCheckRules {
    #[serde(default)]
    banned_patterns: Option<NativeBannedPatternsRule>,
    #[serde(default)]
    banned_files: Option<NativeBannedFilesRule>,
    #[serde(default)]
    min_file_lines: Option<NativeMinFileLinesRule>,
    #[serde(default)]
    min_declaration_name: Option<NativeMinDeclarationNameRule>,
    #[serde(default)]
    max_file_lines: Option<NativeMaxFileLinesRule>,
    #[serde(default)]
    max_characters_per_line: Option<NativeMaxCharactersPerLineRule>,
    #[serde(default)]
    max_function_lines: Option<NativeMaxFunctionLinesRule>,
    #[serde(default)]
    redundant_path_segments: Option<NativeRedundantPathSegmentsRule>,
    #[serde(default)]
    imports: Option<NativeImportsRule>,
    #[serde(default)]
    remove_comments: Option<NativeRemoveCommentsRule>,
    #[serde(default)]
    structural_blank_lines: Option<NativeStructuralBlankLinesRule>,
    #[serde(default)]
    dry: Option<NativeDryRule>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeCheckRulesRequest {
    source_files: Vec<ScannedSourceFile>,
    rules: NativeCheckRules,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCheckRulesResponse {
    violations: Vec<CodeDisciplineViolation>,
}

#[derive(Clone)]
struct CheckTextFile {
    file: ScannedSourceFile,
    text: String,
}

#[derive(Clone)]
struct CheckModuleSpecifier {
    specifier: String,
    removal_end: Option<usize>,
    removal_start: Option<usize>,
}

#[derive(Clone)]
struct CheckFunctionSpan {
    kind: String,
    name: String,
    start_line: usize,
    end_line: usize,
    line_count: usize,
}

#[derive(Clone)]
struct CheckDeclaration {
    kind: String,
    line: usize,
    name: String,
}

#[derive(Clone)]
struct CheckBoundaryRewrite {
    boundary_count: usize,
    changed: bool,
    inserted_blank_lines: usize,
    removed_blank_lines: usize,
}

#[derive(Clone)]
struct CheckDryDescriptor {
    character_count: usize,
    classification: String,
    file_path: String,
    fingerprint: String,
    language: String,
    name: String,
    start_line: usize,
}
