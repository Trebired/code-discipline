#[derive(Clone)]
struct PrefixMatch {
    prefix: String,
    remainder: String,
    separator: String,
    index: usize,
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
            });
        }
    }

    best_match
}

fn normalize_role_token(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !matches!(ch, '_' | '-' | ' ' | '\t'))
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn directory_matches_role_suffix(directory_name: &str, role_suffix: &str) -> bool {
    let normalized_directory = normalize_role_token(directory_name);
    let normalized_suffix = normalize_role_token(role_suffix);
    normalized_directory == normalized_suffix || normalized_directory == format!("{normalized_suffix}s")
}

fn find_redundant_role_suffix_match(
    file: &ScannedSourceFile,
    separators: &[String],
    role_suffixes: &[String],
) -> Option<PrefixMatch> {
    let basename = strip_extension(
        posix_basename(&file.relative_from_source_root),
        &file.extension,
    );
    let directory_name = posix_basename(&posix_dirname(&file.relative_from_source_root)).to_string();
    let normalized_basename = basename.to_lowercase();
    let mut best_match: Option<PrefixMatch> = None;
    let mut best_score = 0_usize;

    for role_suffix in role_suffixes {
        if !directory_matches_role_suffix(&directory_name, role_suffix) {
            continue;
        }

        for separator in separators {
            let suffix_token = format!("{separator}{role_suffix}");
            let normalized_suffix_token = suffix_token.to_lowercase();
            if !normalized_basename.ends_with(&normalized_suffix_token) {
                continue;
            }

            let index = basename.len().saturating_sub(suffix_token.len());
            if index == 0 {
                continue;
            }

            if suffix_token.len() <= best_score {
                continue;
            }

            best_score = suffix_token.len();
            best_match = Some(PrefixMatch {
                prefix: basename[..index].to_string(),
                remainder: role_suffix.clone(),
                separator: separator.clone(),
                index,
            });
        }
    }

    best_match
}

fn collect_source_file_structure_violations(
    source_files: &[ScannedSourceFile],
    separators: &[String],
    role_suffixes: &[String],
) -> Vec<CodeDisciplineViolation> {
    let mut matches = Vec::<(ScannedSourceFile, PrefixMatch)>::new();
    let mut role_suffix_matches = Vec::<(ScannedSourceFile, PrefixMatch)>::new();

    for file in source_files {
        if !supports_source_file_structure_fix(&file.extension) {
            continue;
        }
        if let Some(role_suffix_match) =
            find_redundant_role_suffix_match(file, separators, role_suffixes)
        {
            role_suffix_matches.push((file.clone(), role_suffix_match));
        }
        if let Some(prefix_match) = find_prefix_match(file, separators) {
            matches.push((file.clone(), prefix_match));
        }
    }

    let mut violations = Vec::new();
    let role_suffix_paths: HashSet<String> = role_suffix_matches
        .iter()
        .map(|(file, _)| file.absolute_path.clone())
        .collect();

    for (file, role_suffix_match) in role_suffix_matches.iter() {
        let target_file_name = format!("{}{}", role_suffix_match.prefix, file.extension);
        let project_dir = posix_dirname(&file.relative_from_project_root);
        let suggested_path = join_posix(&project_dir, &target_file_name);

        violations.push(create_source_file_structure_violation(
            file,
            suggested_path,
            "redundant-role-suffix",
            &role_suffix_match.prefix,
            &role_suffix_match.remainder,
            Some(&role_suffix_match.remainder),
            &role_suffix_match.separator,
        ));
    }

    for (file, prefix_match) in matches.iter() {
        if role_suffix_paths.contains(&file.absolute_path) {
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

        violations.push(create_source_file_structure_violation(
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
