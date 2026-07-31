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

fn collect_folderize_violations(
    source_files: &[ScannedSourceFile],
    separators: &[String],
) -> Vec<CodeDisciplineViolation> {
    let mut matches = Vec::<(ScannedSourceFile, PrefixMatch)>::new();

    for file in source_files {
        if !supports_folderization_fix(&file.extension) {
            continue;
        }
        if let Some(prefix_match) = find_prefix_match(file, separators) {
            matches.push((file.clone(), prefix_match));
        }
    }

    let mut violations = Vec::new();

    for (file, prefix_match) in matches.iter() {
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

        violations.push(create_folderize_violation(
            file,
            suggested_path,
            mode,
            &prefix_match.prefix,
            &prefix_match.remainder,
            &prefix_match.separator,
        ));
    }

    violations.sort_by(|left, right| left.file_path.cmp(&right.file_path));
    violations
}
