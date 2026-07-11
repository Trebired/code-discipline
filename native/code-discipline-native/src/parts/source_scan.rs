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
    exclude_dir_paths: Vec<(String, String)>,
    excluded_directory_names: HashSet<String>,
}

struct DirectoryScanResult {
    directories: Vec<DirectoryTask>,
    files: Vec<ScannedSourceFile>,
}

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
    let exclude_dirs = options
        .exclude_dirs
        .iter()
        .map(normalize_relative_path)
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();
    let excluded_directory_names = exclude_dirs
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
        exclude_dir_paths: exclude_dirs
            .iter()
            .filter(|entry| entry.contains('/'))
            .map(|entry| (entry.clone(), format!("{entry}/")))
            .collect::<Vec<_>>(),
        excluded_directory_names,
    }
}

fn should_exclude_directory(
    relative_dir: &str,
    project_relative_dir: &str,
    directory_name: &str,
    exclude_dir_paths: &[(String, String)],
    excluded_directory_names: &HashSet<String>,
) -> bool {
    let normalized_relative_dir = normalize_relative_path(relative_dir);
    let normalized_project_relative_dir = normalize_relative_path(project_relative_dir);

    if excluded_directory_names.contains(directory_name) {
        return true;
    }

    exclude_dir_paths.iter().any(|(exact, prefix)| {
        normalized_relative_dir == *exact
            || normalized_relative_dir.starts_with(prefix)
            || normalized_project_relative_dir == *exact
            || normalized_project_relative_dir.starts_with(prefix)
    })
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
        let absolute_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_type = entry.file_type().map_err(|error| err(error.to_string()))?;

        if file_type.is_dir() {
            let relative_path = normalize_relative_path(if task.relative_dir.is_empty() {
                file_name.clone()
            } else {
                format!("{}/{}", task.relative_dir, file_name)
            });
            let project_relative_path = path_relative_from(&context.project_root, &absolute_path);
            if should_exclude_directory(
                &relative_path,
                &project_relative_path,
                &file_name,
                &context.exclude_dir_paths,
                &context.excluded_directory_names,
            ) {
                continue;
            }

            directories.push(DirectoryTask {
                absolute_path,
                relative_dir: relative_path,
            });
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let extension = extension_for_path(&absolute_path);
        if !context.source_extensions.contains(&extension) {
            continue;
        }

        let relative_path = normalize_relative_path(if task.relative_dir.is_empty() {
            file_name.clone()
        } else {
            format!("{}/{}", task.relative_dir, file_name)
        });

        files.push(ScannedSourceFile {
            absolute_path: absolute_path.to_string_lossy().to_string(),
            relative_from_project_root: path_relative_from(&context.project_root, &absolute_path),
            relative_from_source_root: relative_path,
            extension,
        });
    }

    Ok(DirectoryScanResult { directories, files })
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
