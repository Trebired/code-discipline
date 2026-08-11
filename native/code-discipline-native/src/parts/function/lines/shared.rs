fn reset_pending_function_state(
    pending_header: &mut String,
    pending_start_line: &mut usize,
    pending_brace_depth: &mut i32,
    pending_name: &mut String,
    pending_kind: &mut String,
) {
    pending_header.clear();
    *pending_start_line = 0;
    *pending_brace_depth = 0;
    pending_name.clear();
    *pending_kind = "function".to_string();
}

fn update_pending_block_function(
    file: &ScannedSourceFile,
    line: &str,
    pending_header: &mut String,
    pending_start_line: &mut usize,
    pending_name: &mut String,
    pending_kind: &mut String,
    index: usize,
) -> bool {
    if pending_header.is_empty() {
        if !header_start_matches(line, &file.extension) {
            return false;
        }
        *pending_header = line.to_string();
        *pending_start_line = index + 1;
        *pending_kind = if is_go_extension(&file.extension) && line.contains("func (") {
            "method".to_string()
        } else {
            "function".to_string()
        };
        *pending_name = extract_function_name(pending_header, &file.extension);
        return true;
    }

    pending_header.push('\n');
    pending_header.push_str(line);
    if pending_name.is_empty() || pending_name == "anonymous" {
        *pending_name = extract_function_name(pending_header, &file.extension);
    }
    true
}

fn should_continue_pending_block_function(
    pending_header: &str,
    pending_brace_depth: i32,
) -> bool {
    pending_brace_depth == 0 && !strip_comments_and_strings(pending_header).contains('{')
}
