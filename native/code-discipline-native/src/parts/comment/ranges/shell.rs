fn is_shell_comment_boundary(line: &str, index: usize) -> bool {
    if index == 0 {
        return true;
    }
    line.as_bytes()
    .get(index - 1)
    .is_some_and(|byte| byte.is_ascii_whitespace() || b";&|(){}".contains(byte))
}

fn shell_comment_start(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    let mut single = false;
    let mut double = false;
    let mut backtick = false;
    let mut escaped = false;

    for index in 0..bytes.len() {
        let current = bytes[index];
        if escaped {
            escaped = false;
            continue;
        }
        if !single && current == b'\\' {
            escaped = true;
            continue;
        }
        if !double && !backtick && current == b'\'' {
            single = !single;
        } else if !single && !backtick && current == b'"' {
            double = !double;
        } else if !single && current == b'`' {
            backtick = !backtick;
        } else if !single
        && !double
        && !backtick
        && current == b'#'
        && is_shell_comment_boundary(line, index)
        {
            return Some(index);
        }
    }

    None
}

fn parse_shell_heredoc_word(line: &str, start: usize, limit: usize) -> String {
    let bytes = line.as_bytes();
    if matches!(bytes.get(start), Some(b'"') | Some(b'\'')) {
        let quote = bytes[start];
        let mut end = start + 1;
        while end < limit && bytes.get(end) != Some(&quote) {
            end += 1;
        }
        return if end < limit {
            line[start + 1..end].to_string()
        } else {
            String::new()
        };
    }
    let mut end = start;
    while end < limit && !bytes[end].is_ascii_whitespace() && !b";&|()<>".contains(&bytes[end])
    {
        end += 1;
    }
    line[start..end].to_string()
}

fn shell_heredoc_delimiter(line: &str, limit: usize) -> Option<(String, bool)> {
    let bytes = line.as_bytes();
    let mut single = false;
    let mut double = false;
    let mut index = 0_usize;
    while index + 1 < limit {
        let current = bytes[index];
        if !double && current == b'\'' {
            single = !single;
        } else if !single && current == b'"' {
            double = !double;
        }
        if single || double || current != b'<' || bytes.get(index + 1) != Some(&b'<') {
            index += 1;
            continue;
        }
        let mut cursor = index + 2;
        let strip_tabs = bytes.get(cursor) == Some(&b'-');
        if strip_tabs {
            cursor += 1;
        }
        while cursor < limit && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        let delimiter = parse_shell_heredoc_word(line, cursor, limit);
        return if delimiter.is_empty() {
            None
        } else {
            Some((delimiter, strip_tabs))
        };
    }
    None
}

fn collect_shell_comment_ranges(text: &str) -> Vec<CommentRange> {
    let mut ranges = Vec::new();
    let mut line_start = 0_usize;
    let mut heredoc: Option<(String, bool)> = None;

    while line_start <= text.len() {
        let newline = text[line_start..].find('\n').map(|index| line_start + index);
        let content_end = match newline {
            Some(index) if index > 0 && text.as_bytes()[index - 1] == b'\r' => index - 1,
            Some(index) => index,
            None => text.len(),
        };
        let line = &text[line_start..content_end];
        if let Some((delimiter, strip_tabs)) = heredoc.as_ref() {
            let candidate = if *strip_tabs {
                line.trim_start_matches('\t')
            } else {
                line
            };
            if candidate.trim_end() == delimiter {
                heredoc = None;
            }
        } else {
            let comment_start = shell_comment_start(line);
            let limit = comment_start.unwrap_or(line.len());
            if !(line_start == 0 && line.starts_with("#!")) {
                if let Some(start) = comment_start {
                    ranges.push(CommentRange {
                            start: line_start + start,
                            end: content_end,
                            kind: CommentKind::Line,
                    });
                }
            }
            heredoc = shell_heredoc_delimiter(line, limit);
        }
        let Some(newline_index) = newline else {
            break;
        };
        line_start = newline_index + 1;
    }

    ranges
}
