fn create_block_comment_replacement(comment_text: &str) -> String {
    let newline_only = comment_text
    .chars()
    .filter(|ch| *ch == '\r' || *ch == '\n')
    .collect::<String>();

    if newline_only.is_empty() {
        " ".to_string()
    } else {
        newline_only
    }
}

fn find_line_start(text: &str, index: usize) -> usize {
    text[..index]
    .rfind('\n')
    .map(|position| position + 1)
    .unwrap_or(0)
}

fn find_line_end(text: &str, index: usize) -> (usize, usize) {
    let newline = text[index..].find('\n').map(|position| index + position);
    let break_end = newline.map(|position| position + 1).unwrap_or(text.len());
    let content_end = match newline {
        Some(position) if position > 0 && text.as_bytes()[position - 1] == b'\r' => position - 1,
        Some(position) => position,
        None => text.len(),
    };

    (content_end, break_end)
}

fn resolve_comment_replacement(
    text: &str,
    range: CommentRange,
    previous_end: usize,
) -> (usize, usize, String) {
    let line_start = find_line_start(text, range.start);
    let (content_end, break_end) = find_line_end(text, range.end);
    let prefix = &text[line_start..range.start];
    let suffix = &text[range.end..content_end];

    if line_start >= previous_end && prefix.trim().is_empty() && suffix.trim().is_empty() {
        return (line_start, break_end, String::new());
    }

    let value = match range.kind {
        CommentKind::Line => String::new(),
        CommentKind::Block => create_block_comment_replacement(&text[range.start..range.end]),
    };

    (range.start, range.end, value)
}

fn should_exclude_comment(
    text: &str,
    range: CommentRange,
    excluded_comment_patterns: &[String],
) -> bool {
    if excluded_comment_patterns.is_empty() {
        return false;
    }

    let comment_text = &text[range.start..range.end];
    excluded_comment_patterns
    .iter()
    .any(|pattern| !pattern.is_empty() && comment_text.contains(pattern))
}

fn strip_comments_internal(
    text: &str,
    extension: &str,
    excluded_comment_patterns: &[String],
) -> CommentStripResult {
    let ranges = collect_comment_ranges(text, extension)
    .into_iter()
    .filter(|range| !should_exclude_comment(text, *range, excluded_comment_patterns))
    .collect::<Vec<_>>();

    if ranges.is_empty() {
        return CommentStripResult {
            changed: false,
            text: text.to_string(),
            comment_count: 0,
            line_comments: 0,
            block_comments: 0,
        };
    }

    let mut rewritten = String::with_capacity(text.len());
    let mut previous_end = 0_usize;
    let mut line_comments = 0_usize;
    let mut block_comments = 0_usize;

    for range in ranges.iter().copied() {
        let (start, end, value) = resolve_comment_replacement(text, range, previous_end);
        rewritten.push_str(&text[previous_end..start]);
        rewritten.push_str(&value);
        previous_end = end;

        match range.kind {
            CommentKind::Line => line_comments += 1,
            CommentKind::Block => block_comments += 1,
        }
    }

    rewritten.push_str(&text[previous_end..]);

    CommentStripResult {
        changed: rewritten != text,
        text: rewritten,
        comment_count: line_comments + block_comments,
        line_comments,
        block_comments,
    }
}
