use napi::Result;
use napi_derive::napi;
use serde::Serialize;

#[derive(Clone, Copy)]
enum CommentKind {
    Line,
    Block,
}

#[derive(Clone, Copy)]
struct CommentRange {
    start: usize,
    end: usize,
    kind: CommentKind,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommentStripResult {
    changed: bool,
    text: String,
    comment_count: usize,
    line_comments: usize,
    block_comments: usize,
}

fn err(message: impl Into<String>) -> napi::Error {
    napi::Error::from_reason(message.into())
}

fn is_ts_family_extension(extension: &str) -> bool {
    matches!(
        extension,
        ".cjs" | ".cts" | ".js" | ".jsx" | ".mjs" | ".mts" | ".ts" | ".tsx"
    )
}

fn is_go_extension(extension: &str) -> bool {
    extension == ".go"
}

fn is_rust_extension(extension: &str) -> bool {
    extension == ".rs"
}

fn scan_escaped_quoted_literal(text: &str, start: usize, quote: u8) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index += 2;
            continue;
        }

        let current = bytes[index];
        index += 1;
        if current == quote {
            return index;
        }
    }

    bytes.len()
}

fn scan_backtick_literal(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index += 2;
            continue;
        }
        if bytes[index] == b'`' {
            return index + 1;
        }
        index += 1;
    }

    bytes.len()
}

fn scan_line_comment(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 2;

    while index < bytes.len() && bytes[index] != b'\n' && bytes[index] != b'\r' {
        index += 1;
    }

    index
}

fn scan_block_comment(text: &str, start: usize, nested: bool) -> usize {
    let bytes = text.as_bytes();
    let mut index = start + 2;
    let mut depth = 1_u32;

    while index < bytes.len() {
        if nested && bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
            depth += 1;
            index += 2;
            continue;
        }

        if bytes[index] == b'*' && bytes.get(index + 1) == Some(&b'/') {
            depth -= 1;
            index += 2;
            if depth == 0 {
                return index;
            }
            continue;
        }

        index += 1;
    }

    bytes.len()
}

fn collect_c_like_comment_ranges(
    text: &str,
    keep_backtick_literal: bool,
    nested_blocks: bool,
) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if current == b'/' && next == Some(b'/') {
            let end = scan_line_comment(text, index);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Line,
            });
            index = end;
            continue;
        }

        if current == b'/' && next == Some(b'*') {
            let end = scan_block_comment(text, index, nested_blocks);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Block,
            });
            index = end;
            continue;
        }

        if current == b'"' || current == b'\'' {
            index = scan_escaped_quoted_literal(text, index, current);
            continue;
        }

        if keep_backtick_literal && current == b'`' {
            index = scan_backtick_literal(text, index);
            continue;
        }

        index += 1;
    }

    ranges
}

fn scan_rust_raw_string(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = start;

    if bytes.get(index) == Some(&b'b') {
        if bytes.get(index + 1) != Some(&b'r') {
            return None;
        }
        index += 1;
    }

    if bytes.get(index) != Some(&b'r') {
        return None;
    }
    index += 1;

    let mut hash_count = 0_usize;
    while bytes.get(index) == Some(&b'#') {
        hash_count += 1;
        index += 1;
    }

    if bytes.get(index) != Some(&b'"') {
        return None;
    }
    index += 1;

    while index < bytes.len() {
        if bytes[index] == b'"' {
            let mut matched = true;
            for hash_index in 0..hash_count {
                if bytes.get(index + 1 + hash_index) != Some(&b'#') {
                    matched = false;
                    break;
                }
            }

            if matched {
                return Some(index + 1 + hash_count);
            }
        }

        index += 1;
    }

    Some(bytes.len())
}

fn scan_rust_char_literal(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = start + 1;

    if index >= bytes.len() || bytes[index] == b'\n' || bytes[index] == b'\r' {
        return None;
    }

    if bytes[index] == b'\\' {
        index += 1;

        if index >= bytes.len() {
            return Some(bytes.len());
        }

        if bytes[index] == b'u' && bytes.get(index + 1) == Some(&b'{') {
            index += 2;
            while index < bytes.len() && bytes[index] != b'}' {
                index += 1;
            }
            if index < bytes.len() {
                index += 1;
            }
        } else {
            index += 1;
        }
    } else {
        index += 1;
    }

    if bytes.get(index) == Some(&b'\'') {
        Some(index + 1)
    } else {
        None
    }
}

fn collect_rust_comment_ranges(text: &str) -> Vec<CommentRange> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0_usize;

    while index < bytes.len() {
        if let Some(raw_end) = scan_rust_raw_string(text, index) {
            index = raw_end;
            continue;
        }

        let current = bytes[index];
        let next = bytes.get(index + 1).copied();

        if current == b'b' && (next == Some(b'"') || next == Some(b'\'')) {
            index = scan_escaped_quoted_literal(text, index + 1, next.unwrap());
            continue;
        }

        if current == b'"' {
            index = scan_escaped_quoted_literal(text, index, b'"');
            continue;
        }

        if current == b'\'' {
            if let Some(char_end) = scan_rust_char_literal(text, index) {
                index = char_end;
                continue;
            }
        }

        if current == b'/' && next == Some(b'/') {
            let end = scan_line_comment(text, index);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Line,
            });
            index = end;
            continue;
        }

        if current == b'/' && next == Some(b'*') {
            let end = scan_block_comment(text, index, true);
            ranges.push(CommentRange {
                start: index,
                end,
                kind: CommentKind::Block,
            });
            index = end;
            continue;
        }

        index += 1;
    }

    ranges
}

fn collect_comment_ranges(text: &str, extension: &str) -> Vec<CommentRange> {
    if is_ts_family_extension(extension) {
        return collect_c_like_comment_ranges(text, true, false);
    }

    if is_go_extension(extension) {
        return collect_c_like_comment_ranges(text, true, false);
    }

    if is_rust_extension(extension) {
        return collect_rust_comment_ranges(text);
    }

    Vec::new()
}

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

fn strip_comments_internal(text: &str, extension: &str) -> CommentStripResult {
    let ranges = collect_comment_ranges(text, extension);

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

#[napi]
pub fn strip_comments(text: String, extension: String) -> Result<String> {
    let result = strip_comments_internal(&text, &extension);
    serde_json::to_string(&result).map_err(|error| err(error.to_string()))
}
