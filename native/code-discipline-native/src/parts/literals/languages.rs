fn scan_csharp_raw_string(text: &str, from: usize, quotes: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = from;
    while index < bytes.len() {
        if bytes[index] != b'"' {
            index += 1;
            continue;
        }
        let run = bytes[index..].iter().take_while(|byte| **byte == b'"').count();
        if run >= quotes {
            return index + quotes;
        }
        index += run;
    }
    bytes.len()
}

fn scan_csharp_prefixed_string(text: &str, index: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut quote = index;
    while matches!(bytes.get(quote), Some(b'@') | Some(b'$')) {
        quote += 1;
    }
    if bytes.get(quote) != Some(&b'"') {
        return None;
    }
    let quotes = bytes[quote..].iter().take_while(|byte| **byte == b'"').count();
    if quotes >= 3 {
        return Some(scan_csharp_raw_string(text, quote + quotes, quotes));
    }
    if bytes[index..quote].contains(&b'@') {
        return Some(scan_csharp_verbatim_string(text, quote));
    }
    (quote > index).then(|| scan_bounded_quoted_literal(text, quote, b'"'))
}

fn collect_rust_spans(text: &str) -> Vec<SourceSpan> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut index = 0_usize;
    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();
        let continues_word = index > 0 && is_identifier_part_byte(bytes[index - 1]);
        let literal_end = if matches!(current, b'r' | b'b') && continues_word {
            None
        } else {
            scan_rust_non_comment_literal(text, index)
        };
        let (end, is_comment) = match (literal_end, current, next) {
            (Some(end), _, _) => (end, false),
            (None, b'/', Some(b'/')) => (scan_line_comment(text, index), true),
            (None, b'/', Some(b'*')) => (scan_block_comment(text, index, true), true),
            _ => {
                index += 1;
                continue;
            }
        };
        push_span(&mut spans, text, index, end, is_comment);
        index = end.max(index + 1);
    }
    spans
}

fn collect_python_spans(text: &str) -> Vec<SourceSpan> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut index = 0_usize;
    while index < bytes.len() {
        let is_quote = matches!(bytes[index], b'"' | b'\'');
        let continues_word = index > 0 && is_identifier_part_byte(bytes[index - 1]);
        let literal_end = if is_quote || !continues_word {
            scan_python_string_literal(text, index)
        } else {
            None
        };
        if let Some(end) = literal_end {
            push_span(&mut spans, text, index, end, false);
            index = end.max(index + 1);
        } else if bytes[index] == b'#' {
            let end = scan_hash_line_comment(text, index);
            push_span(&mut spans, text, index, end, true);
            index = end;
        } else {
            index += 1;
        }
    }
    spans
}

fn is_shell_comment_start(bytes: &[u8], index: usize) -> bool {
    index == 0 || bytes[index - 1].is_ascii_whitespace() || b";&|(){}".contains(&bytes[index - 1])
}

fn parse_shell_heredoc_at(text: &str, index: usize) -> Option<(String, bool)> {
    let line_end = text[index..].find('\n').map_or(text.len(), |offset| index + offset);
    let (delimiter, strip_tabs) = shell_heredoc_delimiter(&text[index..line_end], line_end - index)?;
    let first = delimiter.chars().next()?;
    (first.is_alphabetic() || first == '_').then_some((delimiter, strip_tabs))
}

fn scan_shell_heredoc_end(text: &str, start: usize, delimiter: &str, strip_tabs: bool) -> usize {
    let mut line_start = start;
    while line_start <= text.len() {
        let line_end = text[line_start..].find('\n').map_or(text.len(), |offset| line_start + offset);
        let line = &text[line_start..line_end];
        let candidate = if strip_tabs { line.trim_start_matches('\t') } else { line };
        if candidate.trim_end() == delimiter || line_end == text.len() {
            return line_end;
        }
        line_start = line_end + 1;
    }
    text.len()
}

fn collect_shell_spans(text: &str) -> Vec<SourceSpan> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut heredoc: Option<(String, bool)> = None;
    let mut index = 0_usize;
    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();
        if current == b'\n' {
            let Some((delimiter, strip_tabs)) = heredoc.take() else {
                index += 1;
                continue;
            };
            let end = scan_shell_heredoc_end(text, index + 1, &delimiter, strip_tabs);
            push_span(&mut spans, text, index, end, false);
            index = end;
            continue;
        }
        let (end, is_comment) = match current {
            b'\\' => {
                index += 2;
                continue;
            }
            b'\'' => (text[index + 1..].find('\'').map_or(text.len(), |offset| index + offset + 2), false),
            b'"' => (scan_escaped_quoted_literal(text, index, b'"'), false),
            b'#' if is_shell_comment_start(bytes, index) => (scan_hash_line_comment(text, index), true),
            b'<' if next == Some(b'<') && bytes.get(index + 2) != Some(&b'<') => {
                heredoc = parse_shell_heredoc_at(text, index);
                index += 2;
                continue;
            }
            _ => {
                index += 1;
                continue;
            }
        };
        push_span(&mut spans, text, index, end, is_comment);
        index = end.max(index + 1);
    }
    spans
}
