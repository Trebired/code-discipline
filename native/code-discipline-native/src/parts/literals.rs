#[derive(Clone, Copy)]
struct SourceSpan {
    start: usize,
    end: usize,
    is_comment: bool,
}

#[derive(Clone, Copy, Default)]
struct LiteralLine {
    starts_inside: bool,
    ends_inside: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaskSourceRequest {
    text: String,
    extension: String,
}

fn floor_char_boundary_at(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char_boundary_at(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn push_span(spans: &mut Vec<SourceSpan>, text: &str, start: usize, end: usize, is_comment: bool) {
    let start = floor_char_boundary_at(text, start);
    let end = ceil_char_boundary_at(text, end).max(start);
    spans.push(SourceSpan { start, end, is_comment });
}

fn collect_source_spans(text: &str, extension: &str) -> Vec<SourceSpan> {
    if is_rust_extension(extension) {
        return collect_rust_spans(text);
    }
    if is_python_extension(extension) {
        return collect_python_spans(text);
    }
    if is_shell_extension(extension) {
        return collect_shell_spans(text);
    }
    match script_dialect_for_extension(extension) {
        Some(dialect) => collect_script_spans(text, dialect),
        None => Vec::new(),
    }
}

fn mask_source_spans(text: &str, extension: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut cursor = 0_usize;
    for span in collect_source_spans(text, extension) {
        result.push_str(&text[cursor..span.start]);
        for ch in text[span.start..span.end].chars() {
            result.push(if ch == '\n' || ch == '\r' { ch } else { ' ' });
        }
        cursor = span.end;
    }
    result.push_str(&text[cursor..]);
    result
}

fn mask_line_literals(line: &str, extension: &str) -> String {
    let mut bytes = line.as_bytes().to_vec();
    for span in collect_source_spans(line, extension) {
        bytes[span.start..span.end].fill(b' ');
    }
    String::from_utf8(bytes).unwrap_or_else(|_| " ".repeat(line.len()))
}

fn literal_texts<'a>(line: &'a str, extension: &str) -> Vec<&'a str> {
    collect_source_spans(line, extension)
    .into_iter()
    .filter(|span| !span.is_comment && span.end > span.start)
    .map(|span| &line[span.start..span.end])
    .collect()
}

fn literal_line_flags(text: &str, extension: &str) -> Vec<LiteralLine> {
    let line_starts = std::iter::once(0)
    .chain(text.match_indices('\n').map(|(index, _)| index + 1))
    .collect::<Vec<_>>();
    let mut flags = vec![LiteralLine::default(); line_starts.len()];
    for span in collect_source_spans(text, extension).into_iter().filter(|span| !span.is_comment) {
        let mut line = line_starts.partition_point(|start| *start <= span.start) - 1;
        for _ in text[span.start..span.end].matches('\n') {
            flags[line].ends_inside = true;
            line += 1;
            flags[line].starts_inside = true;
        }
    }
    flags
}
