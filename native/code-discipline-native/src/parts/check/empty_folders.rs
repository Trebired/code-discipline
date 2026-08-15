#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeRemoveEmptyFoldersRequest {
    project_root: String,
    source_root: String,
    #[serde(default)]
    exclude_dirs: Vec<NativeExcludeDirEntry>,
    #[serde(default)]
    ignore_patterns: Vec<String>,
}

#[derive(Serialize)]
struct NativeRemoveEmptyFoldersResponse {
    violations: Vec<CodeDisciplineViolation>,
    directory_count: usize,
}

#[derive(Serialize)]
struct NativeRemoveEmptyFoldersFixResponse {
    ok: bool,
    #[serde(rename = "violationCount")]
    violation_count: usize,
    violations: Vec<CodeDisciplineViolation>,
    deleted_files: usize,
    directory_count: usize,
}

#[derive(Clone)]
struct EmptyFolderEntry {
    absolute_path: PathBuf,
    relative_from_project_root: String,
}

struct EmptyFolderScanResult {
    directory_count: usize,
    entries: Vec<EmptyFolderEntry>,
}

#[napi]
pub fn run_remove_empty_folders_rule(request_json: String) -> Result<String> {
    let request: NativeRemoveEmptyFoldersRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let scan = collect_empty_folders(&request)?;
    let violations = scan
    .entries
    .iter()
    .map(create_empty_folder_violation)
    .collect::<Vec<_>>();

    serde_json::to_string(&NativeRemoveEmptyFoldersResponse {
            violations,
            directory_count: scan.directory_count,
    })
    .map_err(|error| err(error.to_string()))
}

#[napi]
pub fn fix_remove_empty_folders_rule(request_json: String) -> Result<String> {
    let request: NativeRemoveEmptyFoldersRequest =
    serde_json::from_str(&request_json).map_err(|error| err(error.to_string()))?;
    let mut deleted_files = 0_usize;
    let mut directory_count = 0_usize;

    loop {
        let mut scan = collect_empty_folders(&request)?;
        directory_count += scan.directory_count;
        if scan.entries.is_empty() {
            break;
        }

        scan.entries.sort_by(|left, right| {
                empty_folder_depth(&right.relative_from_project_root)
                .cmp(&empty_folder_depth(&left.relative_from_project_root))
                .then(right.relative_from_project_root.cmp(&left.relative_from_project_root))
        });

        let mut deleted_this_pass = 0_usize;
        for entry in scan.entries {
            if fs::remove_dir(&entry.absolute_path).is_ok() {
                deleted_files += 1;
                deleted_this_pass += 1;
            }
        }

        if deleted_this_pass == 0 {
            break;
        }
    }

    serde_json::to_string(&NativeRemoveEmptyFoldersFixResponse {
            ok: true,
            violation_count: 0,
            violations: Vec::new(),
            deleted_files,
            directory_count,
    })
    .map_err(|error| err(error.to_string()))
}

fn collect_empty_folders(request: &NativeRemoveEmptyFoldersRequest) -> Result<EmptyFolderScanResult> {
    let context = create_empty_folder_scan_context(request);
    let source_root = check_clean_path(PathBuf::from(&request.source_root));
    let mut queue = vec![DirectoryTask {
            absolute_path: source_root.clone(),
            relative_dir: String::new(),
    }];
    let mut directory_count = 0_usize;
    let mut entries = Vec::new();

    while let Some(task) = queue.pop() {
        let dir_entries = fs::read_dir(&task.absolute_path)
        .map_err(|error| err(error.to_string()))?
        .filter_map(|entry| entry.ok())
        .collect::<Vec<_>>();
        directory_count += 1;

        if task.absolute_path != source_root && dir_entries.is_empty() {
            let relative_from_project_root = path_relative_from(&context.project_root, &task.absolute_path);
            entries.push(EmptyFolderEntry {
                    absolute_path: task.absolute_path,
                    relative_from_project_root,
            });
            continue;
        }

        for dir_entry in dir_entries {
            let file_type = dir_entry.file_type().map_err(|error| err(error.to_string()))?;
            if file_type.is_dir() {
                push_scanned_directory(&task, &context, dir_entry, &mut queue);
            }
        }
    }

    entries.sort_by(|left, right| {
            left.relative_from_project_root
            .cmp(&right.relative_from_project_root)
    });

    Ok(EmptyFolderScanResult {
            directory_count,
            entries,
    })
}

fn create_empty_folder_scan_context(request: &NativeRemoveEmptyFoldersRequest) -> DirectoryScanContext {
    create_directory_scan_context(&SourceScanRequest {
            project_root: request.project_root.clone(),
            source_root: request.source_root.clone(),
            source_extensions: Vec::new(),
            ignore_patterns: request.ignore_patterns.clone(),
            exclude_dirs: request
            .exclude_dirs
            .iter()
            .map(|entry| SourceScanExcludeInput::Entry(SourceScanExcludeEntry {
                        entry_type: entry.entry_type.clone(),
                        pattern: entry.pattern.clone(),
            }))
            .collect(),
    })
}

fn create_empty_folder_violation(entry: &EmptyFolderEntry) -> CodeDisciplineViolation {
    check_violation(
        "remove-empty-folders",
        true,
        entry.relative_from_project_root.clone(),
        "empty folder should be removed".to_string(),
        json!({ "path": entry.relative_from_project_root }),
    )
}

fn empty_folder_depth(value: &str) -> usize {
    normalize_relative_path(value)
    .split('/')
    .filter(|part| !part.is_empty())
    .count()
}
