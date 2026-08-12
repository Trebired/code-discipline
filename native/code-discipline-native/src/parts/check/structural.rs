#[derive(Clone)]
struct CheckStructuralUnit {
    end_line: usize,
    scope_key: String,
    start_line: usize,
}

#[derive(Clone)]
struct CheckBoundaryEdit {
    insert_count: usize,
    remove_count: usize,
}

fn check_rewrite_structural_blank_lines(file: &ScannedSourceFile, text: &str) -> CheckBoundaryRewrite {
    let units = check_collect_structural_units(file, text);
    let edits = check_compute_structural_edits(text, units);
    CheckBoundaryRewrite {
        boundary_count: edits.len(),
        changed: !edits.is_empty(),
        inserted_blank_lines: edits.iter().map(|edit| edit.insert_count).sum(),
        removed_blank_lines: edits.iter().map(|edit| edit.remove_count).sum(),
    }
}

fn check_compute_structural_edits(text: &str, units: Vec<CheckStructuralUnit>) -> Vec<CheckBoundaryEdit> {
    let lines = text.lines().collect::<Vec<_>>();
    let mut by_scope: HashMap<String, Vec<CheckStructuralUnit>> = HashMap::new();
    for unit in units {
        by_scope.entry(unit.scope_key.clone()).or_default().push(unit);
    }
    let mut edits = Vec::new();
    for rows in by_scope.values_mut() {
        rows.sort_by_key(|entry| entry.start_line);
        for index in 1..rows.len() {
            let previous = &rows[index - 1];
            let next = &rows[index];
            if !check_only_blank_lines_between(&lines, previous.end_line, next.start_line) {
                continue;
            }
            let gap = next.start_line.saturating_sub(previous.end_line + 1);
            if gap == 1 {
                continue;
            }
            edits.push(CheckBoundaryEdit {
                    insert_count: 1_usize.saturating_sub(gap),
                    remove_count: gap.saturating_sub(1),
            });
        }
    }
    edits
}

fn check_only_blank_lines_between(lines: &[&str], previous_end_line: usize, next_start_line: usize) -> bool {
    if next_start_line <= previous_end_line + 1 {
        return true;
    }
    for index in previous_end_line..next_start_line - 1 {
        if lines.get(index).is_some_and(|line| !line.trim().is_empty()) {
            return false;
        }
    }
    true
}

fn check_collect_structural_units(file: &ScannedSourceFile, text: &str) -> Vec<CheckStructuralUnit> {
    if is_python_extension(&file.extension) {
        return check_collect_python_structural_units(text);
    }
    if is_shell_extension(&file.extension) {
        return check_collect_shell_structural_units(text);
    }
    if is_go_extension(&file.extension)
    || is_rust_extension(&file.extension)
    || is_cpp_extension(&file.extension)
    || is_csharp_extension(&file.extension)
    || is_qml_extension(&file.extension)
    || is_style_extension(&file.extension)
    || is_ts_family_extension(&file.extension)
    {
        return check_collect_brace_structural_units(file, text);
    }
    Vec::new()
}

fn check_collect_python_structural_units(text: &str) -> Vec<CheckStructuralUnit> {
    let mut units = Vec::new();
    let mut stack: Vec<(isize, usize)> = Vec::new();
    let mut quote = None;
    let mut last_meaningful = 0_usize;
    for (index, line) in text.lines().enumerate() {
        let line_number = index + 1;
        let inside_triple = quote.is_some();
        if !inside_triple && check_python_meaningful_line(line) {
            let indent = check_measure_python_indent(line);
            while stack.last().is_some_and(|entry| indent <= entry.0) {
                let (start_indent, start_line) = stack.pop().unwrap();
                units.push(CheckStructuralUnit {
                        end_line: last_meaningful.max(start_line),
                        scope_key: format!("indent:{start_indent}"),
                        start_line,
                });
            }
            last_meaningful = line_number;
        }
        if !inside_triple {
            if let Some((indent, _, _)) = check_python_function_start(line) {
                stack.push((indent, line_number));
            } else if line.trim_start().starts_with("class ") {
                stack.push((check_measure_python_indent(line), line_number));
            }
        }
        check_update_python_triple_state(line, &mut quote);
    }
    while let Some((indent, start_line)) = stack.pop() {
        units.push(CheckStructuralUnit {
                end_line: last_meaningful.max(start_line),
                scope_key: format!("indent:{indent}"),
                start_line,
        });
    }
    units
}

fn check_collect_shell_structural_units(text: &str) -> Vec<CheckStructuralUnit> {
    check_collect_shell_function_spans(text)
    .into_iter()
    .map(|span| CheckStructuralUnit {
            end_line: span.end_line,
            scope_key: "shell:function".to_string(),
            start_line: span.start_line,
    })
    .collect()
}

fn check_collect_brace_structural_units(file: &ScannedSourceFile, text: &str) -> Vec<CheckStructuralUnit> {
    let masked = if is_qml_extension(&file.extension) || is_ts_family_extension(&file.extension) {
        strip_comments_and_strings_with(text, true)
    } else {
        strip_comments_and_strings(text)
    };
    let lines = text.lines().collect::<Vec<_>>();
    let masked_lines = masked.lines().collect::<Vec<_>>();
    let mut units = Vec::new();
    let mut depth = 0_i32;
    let mut pending: Option<(i32, bool, usize, i32)> = None;
    for (index, line) in lines.iter().enumerate() {
        let masked_line = masked_lines.get(index).copied().unwrap_or("");
        let depth_before = depth;
        if pending.is_none() && check_is_brace_unit_start(line, &file.extension, depth_before) {
            pending = Some((0, false, index + 1, depth_before));
        }
        let delta = check_count_brace_delta_masked(masked_line);
        if let Some((pending_depth, seen_opening, _, _)) = pending.as_mut() {
            if masked_line.contains('{') {
                *seen_opening = true;
            }
            *pending_depth += delta;
        }
        depth = (depth + delta).max(0);
        if pending.as_ref().is_some_and(|entry| entry.1 && entry.0 <= 0) {
            let (_, _, start_line, scope_depth) = pending.take().unwrap();
            units.push(CheckStructuralUnit {
                    end_line: index + 1,
                    scope_key: format!("brace:{scope_depth}"),
                    start_line,
            });
        }
    }
    units
}

fn check_is_brace_unit_start(line: &str, extension: &str, depth_before: i32) -> bool {
    let trimmed = line.trim_start();
    if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with('*') {
        return false;
    }
    if is_go_extension(extension) {
        return trimmed.starts_with("func ") || trimmed.starts_with("type ");
    }
    if is_rust_extension(extension) {
        return ["fn ", "pub fn ", "pub(crate) fn ", "async fn ", "const fn ", "unsafe fn ", "struct ", "enum ", "impl ", "trait "]
        .iter()
        .any(|prefix| trimmed.starts_with(prefix));
    }
    if is_qml_extension(extension) {
        return check_qml_function_start(trimmed, 1).is_some();
    }
    if is_style_extension(extension) {
        return trimmed.contains('{') && !trimmed.starts_with('}');
    }
    if is_ts_family_extension(extension) {
        return trimmed.starts_with("function ")
        || trimmed.starts_with("async function ")
        || trimmed.starts_with("export function ")
        || trimmed.starts_with("export async function ")
        || trimmed.starts_with("export default function ")
        || trimmed.starts_with("class ")
        || trimmed.starts_with("export class ")
        || trimmed.starts_with("export default class ")
        || (depth_before == 0 && check_ts_arrow_declaration_start(trimmed));
    }
    if is_cpp_extension(extension) || is_csharp_extension(extension) {
        return is_c_family_header_start(line)
        || trimmed.starts_with("class ")
        || trimmed.starts_with("struct ")
        || trimmed.starts_with("namespace ");
    }
    false
}

fn check_ts_arrow_declaration_start(trimmed: &str) -> bool {
    let Some(equals_index) = trimmed.find('=') else {
        return false;
    };
    let prefix = trimmed[..equals_index].trim();
    let value = trimmed[equals_index + 1..].trim_start();
    if !value.contains("=>") || !value.contains('{') {
        return false;
    }
    prefix.starts_with("const ") || prefix.starts_with("let ") || prefix.starts_with("var ")
}
