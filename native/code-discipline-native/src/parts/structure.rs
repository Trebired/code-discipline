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
        let Some(candidate) = redundant_path_segment_candidate(&basename, separator, &path_segments) else {
            continue;
        };

        if best_match
        .as_ref()
        .map(|item| candidate.index > item.index)
        .unwrap_or(true)
        {
            best_match = Some(candidate);
        }
    }

    best_match
}

fn redundant_path_segment_candidate(
    basename: &str,
    separator: &str,
    path_segments: &[(String, String)],
) -> Option<PrefixMatch> {
    if separator.is_empty() {
        return None;
    }
    let index = basename.rfind(separator)?;
    if index == 0 {
        return None;
    }

    let prefix = basename[..index].to_string();
    let remainder = basename[index + separator.len()..].to_string();
    if prefix.is_empty() || remainder.is_empty() {
        return None;
    }
    let path_segment = path_segment_for_remainder(&remainder, path_segments)?;
    Some(PrefixMatch {
            prefix,
            remainder,
            separator: separator.to_string(),
            index,
            path_segment: Some(path_segment),
    })
}

fn path_segment_for_remainder(
    remainder: &str,
    path_segments: &[(String, String)],
) -> Option<String> {
    let remainder_token = singularize_path_segment_token(remainder);
    path_segments
    .iter()
    .find(|(token, _)| token == &remainder_token)
    .map(|(_, segment)| segment.clone())
}

fn collect_redundant_path_segments_violations(
    source_files: &[ScannedSourceFile],
    separators: &[String],
) -> Vec<CodeDisciplineViolation> {
    let (matches, path_segment_matches) = collect_redundant_segment_matches(source_files, separators);
    let mut violations = Vec::new();
    let path_segment_paths: HashSet<String> = path_segment_matches
    .iter()
    .map(|(file, _)| file.absolute_path.clone())
    .collect();
    let prefix_group_counts = collect_prefix_segment_group_counts(&matches);

    push_path_segment_violations(&mut violations, &path_segment_matches);
    push_prefix_segment_violations(&mut violations, &matches, &path_segment_paths, &prefix_group_counts);

    violations.sort_by(|left, right| left.file_path.cmp(&right.file_path));
    violations
}

fn collect_redundant_segment_matches(
    source_files: &[ScannedSourceFile],
    separators: &[String],
) -> (Vec<(ScannedSourceFile, PrefixMatch)>, Vec<(ScannedSourceFile, PrefixMatch)>) {
    let mut matches = Vec::new();
    let mut path_segment_matches = Vec::new();

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

    (matches, path_segment_matches)
}

fn push_path_segment_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    path_segment_matches: &[(ScannedSourceFile, PrefixMatch)],
) {
    for (file, path_segment_match) in path_segment_matches.iter() {
        let target_file_name = format!("{}{}", path_segment_match.prefix, file.extension);
        let suggested_path = join_posix(&posix_dirname(&file.relative_from_project_root), &target_file_name);
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
}

fn push_prefix_segment_violations(
    violations: &mut Vec<CodeDisciplineViolation>,
    matches: &[(ScannedSourceFile, PrefixMatch)],
    path_segment_paths: &HashSet<String>,
    prefix_group_counts: &HashMap<String, usize>,
) {
    for (file, prefix_match) in matches.iter() {
        if path_segment_paths.contains(&file.absolute_path) {
            continue;
        }
        let Some(mode) = prefix_segment_violation_mode(file, prefix_match, prefix_group_counts) else {
            continue;
        };
        let suggested_path = suggested_prefix_segment_path(file, prefix_match, mode);

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
}

fn collect_prefix_segment_group_counts(
    matches: &[(ScannedSourceFile, PrefixMatch)],
) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for (file, prefix_match) in matches {
        let key = prefix_segment_group_key(file, prefix_match);
        *counts.entry(key).or_insert(0) += 1;
    }
    counts
}

fn prefix_segment_group_key(file: &ScannedSourceFile, prefix_match: &PrefixMatch) -> String {
    format!(
        "{}::{}",
        posix_dirname(&file.relative_from_source_root),
        prefix_match.prefix
    )
}

fn prefix_segment_violation_mode(
    file: &ScannedSourceFile,
    prefix_match: &PrefixMatch,
    prefix_group_counts: &HashMap<String, usize>,
) -> Option<&'static str> {
    let directory_name = posix_basename(&posix_dirname(&file.relative_from_project_root)).to_string();
    if directory_name == prefix_match.prefix {
        return Some("repeated-folder-prefix");
    }
    if prefix_group_counts
    .get(&prefix_segment_group_key(file, prefix_match))
    .copied()
    .unwrap_or(0)
    >= 2
    {
        return Some("same-directory-group");
    }

    None
}

fn suggested_prefix_segment_path(
    file: &ScannedSourceFile,
    prefix_match: &PrefixMatch,
    mode: &str,
) -> String {
    let target_file_name = format!("{}{}", prefix_match.remainder, file.extension);
    let project_dir = posix_dirname(&file.relative_from_project_root);
    if mode == "repeated-folder-prefix" {
        return join_posix(&project_dir, &target_file_name);
    }
    join_posix(
        &join_posix(&project_dir, &prefix_match.prefix),
        &target_file_name,
    )
}
