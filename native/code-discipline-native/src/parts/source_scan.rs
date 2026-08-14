#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceScanRequest {
    project_root: String,
    source_root: String,
    source_extensions: Vec<String>,
    #[serde(default)]
    exclude_dirs: Vec<SourceScanExcludeInput>,
    #[serde(default)]
    ignore_patterns: Vec<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceScanExcludeEntry {
    #[serde(default)]
    #[serde(rename = "type")]
    entry_type: String,
    #[serde(default)]
    pattern: String,
}

#[derive(Clone, Deserialize)]
#[serde(untagged)]
enum SourceScanExcludeInput {
    Entry(SourceScanExcludeEntry),
    Pattern(String),
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedSourceFile {
    absolute_path: String,
    relative_from_project_root: String,
    relative_from_source_root: String,
    extension: String,
    #[serde(default)]
    byte_size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceScanSummary {
    chunk_count: usize,
    directory_count: usize,
    file_count: usize,
    elapsed_ms: f64,
    concurrency: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceScanResponse {
    rows: Vec<ScannedSourceFile>,
    metrics: SourceScanSummary,
}

#[derive(Clone)]
struct DirectoryTask {
    absolute_path: PathBuf,
    relative_dir: String,
}

#[derive(Clone)]
struct DirectoryScanContext {
    project_root: PathBuf,
    source_extensions: HashSet<String>,
    exclude_file_patterns: Vec<String>,
    exclude_folder_patterns: Vec<String>,
    exclude_folder_paths: Vec<(String, String)>,
    excluded_directory_names: HashSet<String>,
    ignore_patterns: Vec<String>,
}

struct DirectoryScanResult {
    directories: Vec<DirectoryTask>,
    files: Vec<ScannedSourceFile>,
}

const CODE_DISCIPLINE_STATE_DIR: &str = ".trebired/code-discipline";

fn resolve_scan_concurrency() -> usize {
    if let Ok(value) = std::env::var("TB_CODE_DISCIPLINE_SCAN_CONCURRENCY") {
        if let Ok(parsed) = value.parse::<usize>() {
            if parsed > 0 {
                return parsed;
            }
        }
    }

    let parallelism = std::thread::available_parallelism()
    .map(|value| value.get())
    .unwrap_or(4);
    std::cmp::min(64, std::cmp::max(8, parallelism.saturating_mul(4)))
}

fn create_directory_scan_context(options: &SourceScanRequest) -> DirectoryScanContext {
    let exclude_entries = options
    .exclude_dirs
    .iter()
    .filter_map(normalize_source_scan_exclude_entry)
    .collect::<Vec<_>>();
    let mut exclude_folder_patterns = exclude_entries
    .iter()
    .filter(|entry| entry.entry_type != "file")
    .map(|entry| entry.pattern.clone())
    .collect::<Vec<_>>();
    if !exclude_folder_patterns
    .iter()
    .any(|entry| entry == CODE_DISCIPLINE_STATE_DIR)
    {
        exclude_folder_patterns.push(CODE_DISCIPLINE_STATE_DIR.to_string());
    }
    let excluded_directory_names = exclude_folder_patterns
    .iter()
    .filter(|entry| !entry.contains('/'))
    .cloned()
    .collect::<HashSet<_>>();

    DirectoryScanContext {
        project_root: PathBuf::from(&options.project_root),
        source_extensions: options
        .source_extensions
        .iter()
        .map(|entry| entry.to_lowercase())
        .collect::<HashSet<_>>(),
        exclude_file_patterns: exclude_entries
        .iter()
        .filter(|entry| entry.entry_type == "file")
        .map(|entry| entry.pattern.clone())
        .collect::<Vec<_>>(),
        exclude_folder_paths: exclude_folder_patterns
        .iter()
        .filter(|entry| entry.contains('/'))
        .map(|entry| (entry.clone(), format!("{entry}/")))
        .collect::<Vec<_>>(),
        exclude_folder_patterns,
        excluded_directory_names,
        ignore_patterns: options
        .ignore_patterns
        .iter()
        .map(|entry| normalize_relative_path(entry.trim_end_matches('/')))
        .filter(|entry| !entry.is_empty())
        .collect(),
    }
}

fn normalize_source_scan_exclude_entry(entry: &SourceScanExcludeInput) -> Option<SourceScanExcludeEntry> {
    let normalized = match entry {
        SourceScanExcludeInput::Entry(entry) => SourceScanExcludeEntry {
            entry_type: if entry.entry_type == "file" { "file".to_string() } else { "folder".to_string() },
            pattern: normalize_relative_path(entry.pattern.trim_end_matches('/')),
        },
        SourceScanExcludeInput::Pattern(pattern) => SourceScanExcludeEntry {
            entry_type: "folder".to_string(),
            pattern: normalize_relative_path(pattern.trim_end_matches('/')),
        },
    };
    if normalized.pattern.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn should_exclude_directory(
    relative_dir: &str,
    project_relative_dir: &str,
    directory_name: &str,
    exclude_folder_patterns: &[String],
    exclude_folder_paths: &[(String, String)],
    excluded_directory_names: &HashSet<String>,
    ignore_patterns: &[String],
) -> bool {
    let normalized_relative_dir = normalize_relative_path(relative_dir);
    let normalized_project_relative_dir = normalize_relative_path(project_relative_dir);

    if excluded_directory_names.contains(directory_name) {
        return true;
    }

    if exclude_folder_patterns.iter().any(|entry| {
            check_matches_glob(directory_name, entry)
            || check_matches_glob(&normalized_relative_dir, entry)
            || check_matches_glob(&normalized_project_relative_dir, entry)
    }) {
        return true;
    }

    exclude_folder_paths.iter().any(|(exact, prefix)| {
            normalized_relative_dir == *exact
            || normalized_relative_dir.starts_with(prefix)
            || normalized_project_relative_dir == *exact
            || normalized_project_relative_dir.starts_with(prefix)
    })
    || ignore_patterns
    .iter()
    .any(|entry| should_exclude_directory_by_ignore_pattern(&normalized_project_relative_dir, directory_name, entry))
}

fn should_exclude_directory_by_ignore_pattern(
    project_relative_dir: &str,
    directory_name: &str,
    pattern: &str,
) -> bool {
    let normalized = normalize_relative_path(pattern).trim_end_matches('/').to_string();
    if normalized.is_empty() {
        return false;
    }
    if !normalized.contains('/') {
        return check_matches_glob(directory_name, &normalized)
        || check_matches_glob(project_relative_dir, &normalized)
        || check_matches_glob(project_relative_dir, &format!("**/{normalized}"));
    }
    let children = format!("{normalized}/**");
    check_matches_glob(project_relative_dir, &normalized)
    || check_matches_glob(project_relative_dir, &children)
}

fn should_exclude_file(file: &ScannedSourceFile, context: &DirectoryScanContext) -> bool {
    let relative_path = normalize_relative_path(&file.relative_from_project_root);
    if check_is_state_path(&relative_path) {
        return true;
    }
    context
    .exclude_file_patterns
    .iter()
    .any(|pattern| check_matches_glob(&relative_path, pattern))
}

fn scan_directory(task: DirectoryTask, context: &DirectoryScanContext) -> Result<DirectoryScanResult> {
    let mut entries = fs::read_dir(&task.absolute_path)
    .map_err(|error| err(error.to_string()))?
    .filter_map(|entry| entry.ok())
    .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.file_name().cmp(&right.file_name()));

    let mut directories = Vec::new();
    let mut files = Vec::new();

    for entry in entries {
        let file_type = entry.file_type().map_err(|error| err(error.to_string()))?;
        if file_type.is_dir() {
            push_scanned_directory(&task, context, entry, &mut directories);
            continue;
        }
        if file_type.is_file() {
            push_scanned_file(&task, context, entry, &mut files);
        }
    }

    Ok(DirectoryScanResult { directories, files })
}

fn relative_entry_path(task: &DirectoryTask, file_name: &str) -> String {
    normalize_relative_path(if task.relative_dir.is_empty() {
            file_name.to_string()
        } else {
            format!("{}/{}", task.relative_dir, file_name)
    })
}

fn push_scanned_directory(
    task: &DirectoryTask,
    context: &DirectoryScanContext,
    entry: fs::DirEntry,
    directories: &mut Vec<DirectoryTask>,
) {
    let absolute_path = entry.path();
    let file_name = entry.file_name().to_string_lossy().to_string();
    let relative_path = relative_entry_path(task, &file_name);
    let project_relative_path = path_relative_from(&context.project_root, &absolute_path);
    if should_exclude_directory(
        &relative_path,
        &project_relative_path,
        &file_name,
        &context.exclude_folder_patterns,
        &context.exclude_folder_paths,
        &context.excluded_directory_names,
        &context.ignore_patterns,
    ) {
        return;
    }

    directories.push(DirectoryTask {
            absolute_path,
            relative_dir: relative_path,
    });
}

fn push_scanned_file(
    task: &DirectoryTask,
    context: &DirectoryScanContext,
    entry: fs::DirEntry,
    files: &mut Vec<ScannedSourceFile>,
) {
    let absolute_path = entry.path();
    let extension = extension_for_path(&absolute_path);
    if !context.source_extensions.contains(&extension) {
        return;
    }
    let file_name = entry.file_name().to_string_lossy().to_string();

    let file = ScannedSourceFile {
        absolute_path: absolute_path.to_string_lossy().to_string(),
        relative_from_project_root: path_relative_from(&context.project_root, &absolute_path),
        relative_from_source_root: relative_entry_path(task, &file_name),
        extension,
        byte_size: entry.metadata().map(|metadata| metadata.len()).unwrap_or(0),
    };
    if should_exclude_file(&file, context) {
        return;
    }
    files.push(file);
}

fn scan_source_directory(options: &SourceScanRequest) -> Result<SourceScanResponse> {
    let started_at = Instant::now();
    let concurrency = resolve_scan_concurrency();
    let context = create_directory_scan_context(options);
    let mut queue = vec![DirectoryTask {
            absolute_path: PathBuf::from(&options.source_root),
            relative_dir: String::new(),
    }];
    let mut rows = Vec::new();
    let mut directory_count = 0_usize;
    let mut chunk_count = 0_usize;

    while !queue.is_empty() {
        let batch_size = std::cmp::min(concurrency, queue.len());
        let batch = queue.drain(..batch_size).collect::<Vec<_>>();
        let results = batch
        .into_par_iter()
        .map(|task| scan_directory(task, &context))
        .collect::<Vec<_>>();
        chunk_count += 1;
        directory_count += batch_size;

        for result in results {
            let result = result?;
            queue.extend(result.directories);
            rows.extend(result.files);
        }
    }

    rows.sort_by(|left, right| {
            left.relative_from_project_root
            .cmp(&right.relative_from_project_root)
    });

    Ok(SourceScanResponse {
            metrics: SourceScanSummary {
                chunk_count,
                concurrency,
                directory_count,
                elapsed_ms: started_at.elapsed().as_secs_f64() * 1000.0,
                file_count: rows.len(),
            },
            rows,
    })
}
