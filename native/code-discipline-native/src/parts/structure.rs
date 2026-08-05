#[derive(Clone)]
struct PrefixMatch {
    prefix: String,
    remainder: String,
    separator: String,
    index: usize,
    path_segment: Option<String>,
}

fn find_prefix_match(file: &ScannedSourceFile, separators: &[String]) -> Option<PrefixMatch> {
    let basename = strip_extension(
        posix_basename(&file.relative_from_source_root),
        &file.extension,
    );
    let mut best_match: Option<PrefixMatch> = None;

    for separator in separators {
        let Some(index) = basename.find(separator) else {
            continue;
        };
        if index == 0 {
            continue;
        }

        let prefix = basename[..index].to_string();
        let remainder = basename[index + separator.len()..].to_string();
        if prefix.is_empty() || remainder.is_empty() {
            continue;
        }

        if best_match
            .as_ref()
            .map(|item| index < item.index)
            .unwrap_or(true)
        {
            best_match = Some(PrefixMatch {
                prefix,
                remainder,
                separator: separator.clone(),
                index,
                path_segment: None,
            });
        }
    }

    best_match
}

fn normalize_path_segment_token(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !matches!(ch, '_' | '-' | ' ' | '\t'))
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn singularize_path_segment_token(value: &str) -> String {
    let normalized = normalize_path_segment_token(value);
    normalized
        .strip_suffix('s')
        .filter(|base| !base.is_empty())
        .unwrap_or(&normalized)
        .to_string()
}

fn path_segment_tokens(file: &ScannedSourceFile) -> Vec<(String, String)> {
    let directory = posix_dirname(&file.relative_from_source_root);
    if directory.is_empty() || directory == "." {
        return Vec::new();
    }

    let mut seen = HashSet::new();
    let mut tokens = Vec::new();
    for segment in directory.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }

        let token = singularize_path_segment_token(segment);
        if token.is_empty() || !seen.insert(token.clone()) {
            continue;
        }

        tokens.push((token, segment.to_string()));
    }

    tokens
}

fn find_redundant_path_segment_match(
    file: &ScannedSourceFile,
    separators: &[String],
) -> Option<PrefixMatch> {
    let basename = strip_extension(
        posix_basename(&file.relative_from_source_root),
        &file.extension,
    );
    let path_segments = path_segment_tokens(file);
    let mut best_match: Option<PrefixMatch> = None;

    if path_segments.is_empty() {
        return None;
    }

    for separator in separators {
        if separator.is_empty() {
            continue;
        }
        let Some(index) = basename.rfind(separator) else {
            continue;
        };
        if index == 0 {
            continue;
        }

        let prefix = basename[..index].to_string();
        let remainder = basename[index + separator.len()..].to_string();
        if prefix.is_empty() || remainder.is_empty() {
            continue;
        }
        let remainder_token = singularize_path_segment_token(&remainder);
        let path_segment = path_segments
            .iter()
            .find(|(token, _)| token == &remainder_token)
            .map(|(_, segment)| segment.clone());
        let Some(path_segment) = path_segment else {
            continue;
        };

        if best_match
            .as_ref()
            .map(|item| index > item.index)
            .unwrap_or(true)
        {
            best_match = Some(PrefixMatch {
                prefix,
                remainder,
                separator: separator.clone(),
                index,
                path_segment: Some(path_segment),
            });
        }
    }

    best_match
}

fn collect_redundant_path_segments_violations(
    source_files: &[ScannedSourceFile],
    separators: &[String],
) -> Vec<CodeDisciplineViolation> {
    let mut matches = Vec::<(ScannedSourceFile, PrefixMatch)>::new();
    let mut path_segment_matches = Vec::<(ScannedSourceFile, PrefixMatch)>::new();

    for file in source_files {
        if !supports_redundant_path_segments_fix(&file.extension) {
            continue;
        }
        if let Some(path_segment_match) = find_redundant_path_segment_match(file, separators) {
            path_segment_matches.push((file.clone(), path_segment_match));
        }
        if let Some(prefix_match) = find_prefix_match(file, separators) {
            matches.push((file.clone(), prefix_match));
        }
    }

    let mut violations = Vec::new();
    let path_segment_paths: HashSet<String> = path_segment_matches
        .iter()
        .map(|(file, _)| file.absolute_path.clone())
        .collect();

    for (file, path_segment_match) in path_segment_matches.iter() {
        let target_file_name = format!("{}{}", path_segment_match.prefix, file.extension);
        let project_dir = posix_dirname(&file.relative_from_project_root);
        let suggested_path = join_posix(&project_dir, &target_file_name);

        violations.push(create_redundant_path_segments_violation(
            file,
            suggested_path,
            "redundant-path-segment",
            &path_segment_match.prefix,
            &path_segment_match.remainder,
            path_segment_match.path_segment.as_deref(),
            &path_segment_match.separator,
        ));
    }

    for (file, prefix_match) in matches.iter() {
        if path_segment_paths.contains(&file.absolute_path) {
            continue;
        }

        let directory_name =
            posix_basename(&posix_dirname(&file.relative_from_project_root)).to_string();
        let directory_key = format!(
            "{}::{}",
            posix_dirname(&file.relative_from_source_root),
            prefix_match.prefix
        );
        let grouped_count = matches
            .iter()
            .filter(|(candidate, candidate_match)| {
                format!(
                    "{}::{}",
                    posix_dirname(&candidate.relative_from_source_root),
                    candidate_match.prefix
                ) == directory_key
            })
            .count();

        let mode = if directory_name == prefix_match.prefix {
            Some("repeated-folder-prefix")
        } else if grouped_count >= 2 {
            Some("same-directory-group")
        } else {
            None
        };

        let Some(mode) = mode else {
            continue;
        };

        let target_file_name = format!("{}{}", prefix_match.remainder, file.extension);
        let project_dir = posix_dirname(&file.relative_from_project_root);
        let suggested_path = if mode == "repeated-folder-prefix" {
            join_posix(&project_dir, &target_file_name)
        } else {
            join_posix(
                &join_posix(&project_dir, &prefix_match.prefix),
                &target_file_name,
            )
        };

        violations.push(create_redundant_path_segments_violation(
            file,
            suggested_path,
            mode,
            &prefix_match.prefix,
            &prefix_match.remainder,
            None,
            &prefix_match.separator,
        ));
    }

    violations.sort_by(|left, right| left.file_path.cmp(&right.file_path));
    violations
}
