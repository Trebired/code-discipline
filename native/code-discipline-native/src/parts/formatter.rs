#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeFormatterOptions {
    #[serde(default = "default_formatter_line_limit")]
    max_characters_per_line: usize,
    #[serde(default)]
    indent_width: Option<usize>,
    #[serde(default = "default_true")]
    final_newline: bool,
    #[serde(default = "default_true")]
    trim_trailing_whitespace: bool,
    #[serde(default = "default_true")]
    collapse_blank_lines: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormatSourceTextRequest {
    text: String,
    extension: String,
    options: NativeFormatterOptions,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormatSourceFilesRequest {
    source_files: Vec<ScannedSourceFile>,
    options: NativeFormatterOptions,
    mode: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFormatSourceTextResult {
    changed: bool,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFormatFileResult {
    file_path: String,
    checked: bool,
    changed: bool,
    ignored: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFormatSourceFilesResult {
    files: Vec<NativeFormatFileResult>,
}

fn default_formatter_line_limit() -> usize {
    100
}

fn default_true() -> bool {
    true
}

const DEEP_SCRIPT_FORMAT_BYTE_LIMIT: usize = 2 * 1024 * 1024;

fn uses_lightweight_large_script_format(text: &str, extension: &str) -> bool {
    is_ts_family_extension(extension) && text.len() > DEEP_SCRIPT_FORMAT_BYTE_LIMIT
}

fn is_brace_indented_extension(extension: &str) -> bool {
    is_ts_family_extension(extension)
    || is_go_extension(extension)
    || is_rust_extension(extension)
    || is_cpp_extension(extension)
    || is_csharp_extension(extension)
    || is_qml_extension(extension)
    || is_style_extension(extension)
}

fn indent_width_for_extension(extension: &str, options: &NativeFormatterOptions) -> usize {
    if let Some(width) = options.indent_width {
        return width.max(1);
    }

    if is_go_extension(extension)
    || is_rust_extension(extension)
    || is_python_extension(extension)
    || is_csharp_extension(extension)
    {
        4
    } else {
        2
    }
}

fn normalize_line_endings(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn count_display_characters(text: &str) -> usize {
    text.chars().count()
}

fn leading_whitespace(text: &str) -> &str {
    let end = text
    .char_indices()
    .find_map(|(index, ch)| (!matches!(ch, ' ' | '\t')).then_some(index))
    .unwrap_or(text.len());
    &text[..end]
}

fn leading_columns(text: &str, tab_width: usize) -> usize {
    leading_whitespace(text)
    .chars()
    .map(|ch| if ch == '\t' { tab_width } else { 1 })
    .sum()
}

fn trim_trailing_if_enabled(line: &str, options: &NativeFormatterOptions) -> String {
    if options.trim_trailing_whitespace {
        line.trim_end().to_string()
    } else {
        line.to_string()
    }
}

struct FormattedLine {
    locked: bool,
    text: String,
}

fn push_formatted_line(lines: &mut Vec<FormattedLine>, text: String, locked: bool, options: &NativeFormatterOptions) {
    let is_blank = text.trim().is_empty();

    if locked {
        lines.push(FormattedLine { locked, text });
        return;
    }

    if is_blank {
        let after_blank = lines.last().is_some_and(|item| !item.locked && item.text.trim().is_empty());
        if options.collapse_blank_lines && (lines.is_empty() || after_blank) {
            return;
        }
        lines.push(FormattedLine { locked, text: String::new() });
        return;
    }

    lines.push(FormattedLine { locked, text });
}

fn finalize_formatted_lines(mut lines: Vec<FormattedLine>, options: &NativeFormatterOptions) -> String {
    while lines.last().is_some_and(|line| !line.locked && line.text.trim().is_empty()) {
        lines.pop();
    }

    let mut text = lines.into_iter().map(|line| line.text).collect::<Vec<_>>().join("\n");
    if options.final_newline && !text.is_empty() {
        text.push('\n');
    }
    text
}

fn count_leading_closers(masked_trimmed: &str) -> usize {
    masked_trimmed
    .chars()
    .take_while(|ch| matches!(ch, '}' | ']' | ')'))
    .count()
}

fn brace_balance(masked_line: &str) -> isize {
    let mut balance = 0_isize;

    for ch in masked_line.chars() {
        match ch {
            '{' | '[' | '(' => balance += 1,
            '}' | ']' | ')' => balance -= 1,
            _ => {}
        }
    }

    balance
}

fn literal_safe_line(raw_line: &str, flags: LiteralLine, options: &NativeFormatterOptions) -> String {
    if flags.ends_inside {
        raw_line.to_string()
    } else {
        trim_trailing_if_enabled(raw_line, options)
    }
}

fn format_brace_indented_text(
    text: &str,
    extension: &str,
    options: &NativeFormatterOptions,
) -> Vec<FormattedLine> {
    let indent_width = indent_width_for_extension(extension, options);
    let masked = mask_source_spans(text, extension);
    let literal_flags = literal_line_flags(text, extension);
    let raw_lines: Vec<&str> = text.split('\n').collect();
    let masked_lines: Vec<&str> = masked.split('\n').collect();
    let mut lines = Vec::with_capacity(raw_lines.len());
    let mut indent_level = 0_usize;
    let mut continuation_level = 0_usize;

    for (index, raw_line) in raw_lines.iter().enumerate() {
        if index == raw_lines.len().saturating_sub(1) && raw_line.is_empty() {
            continue;
        }

        let flags = literal_flags.get(index).copied().unwrap_or_default();
        let kept = literal_safe_line(raw_line, flags, options);
        let content = kept.trim_start();
        let masked_line = masked_lines.get(index).copied().unwrap_or_default();
        if flags.starts_inside {
            push_formatted_line(&mut lines, kept.clone(), true, options);
        } else if content.is_empty() {
            push_formatted_line(&mut lines, String::new(), false, options);
            continue;
        } else {
            let leading_closers = count_leading_closers(masked_line.trim_start());
            let line_indent = indent_level.saturating_sub(leading_closers) + continuation_level;
            let indent = " ".repeat(line_indent * indent_width);
            push_formatted_line(&mut lines, format!("{indent}{content}"), flags.ends_inside, options);
        }

        let next_indent = indent_level as isize + brace_balance(masked_line);
        indent_level = next_indent.max(0) as usize;
        continuation_level = usize::from(!flags.ends_inside && continues_formatter_expression(content));
    }

    lines
}

fn format_indentation_preserving_text(
    text: &str,
    extension: &str,
    options: &NativeFormatterOptions,
) -> Vec<FormattedLine> {
    let indent_width = indent_width_for_extension(extension, options);
    let explicit_indent_width = options.indent_width.is_some();
    let literal_flags = literal_line_flags(text, extension);
    let raw_lines: Vec<&str> = text.split('\n').collect();
    let mut lines = Vec::with_capacity(raw_lines.len());

    for (index, raw_line) in raw_lines.iter().enumerate() {
        if index == raw_lines.len().saturating_sub(1) && raw_line.is_empty() {
            continue;
        }

        let flags = literal_flags.get(index).copied().unwrap_or_default();
        let kept = literal_safe_line(raw_line, flags, options);
        let content = kept.trim_start();
        if flags.starts_inside {
            push_formatted_line(&mut lines, kept.clone(), true, options);
        } else if content.is_empty() {
            push_formatted_line(&mut lines, String::new(), false, options);
        } else if explicit_indent_width {
            let level = leading_columns(&kept, indent_width) / indent_width;
            let line = format!("{}{}", " ".repeat(level * indent_width), content);
            push_formatted_line(&mut lines, line, flags.ends_inside, options);
        } else {
            let leading = leading_whitespace(&kept).replace('\t', &" ".repeat(indent_width));
            push_formatted_line(&mut lines, format!("{leading}{content}"), flags.ends_inside, options);
        }
    }

    lines
}

fn is_jsx_extension(extension: &str) -> bool {
    let normalized = extension.to_ascii_lowercase();
    normalized == ".tsx" || normalized == ".jsx"
}

fn is_script_spacing_extension(extension: &str) -> bool {
    if is_jsx_extension(extension) {
        return false;
    }
    is_ts_family_extension(extension) || is_qml_extension(extension)
}

const FORMAT_SETTLE_ROUNDS: usize = 4;

fn format_source_internal(
    text: &str,
    extension: &str,
    options: &NativeFormatterOptions,
) -> String {
    let mut current = format_source_once(text, extension, options);
    for _ in 1..FORMAT_SETTLE_ROUNDS {
        let next = format_source_once(&current, extension, options);
        if next == current {
            break;
        }
        current = next;
    }
    current
}

fn format_source_once(
    text: &str,
    extension: &str,
    options: &NativeFormatterOptions,
) -> String {
    let normalized = normalize_line_endings(text);
    if uses_lightweight_large_script_format(&normalized, extension) {
        return finalize_formatted_lines(
            format_indentation_preserving_text(&normalized, extension, options),
            options,
        );
    }

    let normalized = if is_ts_family_extension(extension) && !is_jsx_extension(extension) {
        normalize_script_statements(&normalized)
    } else {
        normalized
    };
    let normalized = if is_script_spacing_extension(extension) {
        normalize_script_spacing(&normalized)
    } else {
        normalized
    };
    let lines = if is_brace_indented_extension(extension) {
        format_brace_indented_text(&normalized, extension, options)
    } else {
        format_indentation_preserving_text(&normalized, extension, options)
    };
    let lines = wrap_comment_lines(lines, extension, options);
    let lines = wrap_source_lines(lines, extension, options);
    finalize_formatted_lines(lines, options)
}

fn format_file(file: &ScannedSourceFile, options: &NativeFormatterOptions, mode: &str) -> NativeFormatFileResult {
    if !supports_remove_comments(&file.extension) {
        return NativeFormatFileResult {
            file_path: file.relative_from_project_root.clone(),
            checked: false,
            changed: false,
            ignored: true,
            error: None,
        };
    }

    let source = match fs::read_to_string(&file.absolute_path) {
        Ok(value) => value,
        Err(error) => {
            return NativeFormatFileResult {
                file_path: file.relative_from_project_root.clone(),
                checked: false,
                changed: false,
                ignored: false,
                error: Some(error.to_string()),
            };
        }
    };
    let formatted = format_source_internal(&source, &file.extension, options);
    let changed = formatted != source;

    if mode == "fix" && changed {
        if let Err(error) = fs::write(&file.absolute_path, formatted) {
            return NativeFormatFileResult {
                file_path: file.relative_from_project_root.clone(),
                checked: true,
                changed: false,
                ignored: false,
                error: Some(error.to_string()),
            };
        }
    }

    NativeFormatFileResult {
        file_path: file.relative_from_project_root.clone(),
        checked: true,
        changed,
        ignored: false,
        error: None,
    }
}
