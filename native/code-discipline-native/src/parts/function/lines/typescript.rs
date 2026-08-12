fn is_simple_typescript_function_file(text: &str) -> bool {
    !text.contains("class ")
    && !text.contains("interface ")
    && !text.contains(" constructor(")
    && !text.contains("\n  get ")
    && !text.contains("\n  set ")
}

fn extract_word_after(source: &str, marker: &str) -> String {
    let Some(index) = source.find(marker) else {
        return "anonymous".to_string();
    };
    source[index + marker.len()..]
    .trim_start()
    .chars()
    .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '$')
    .collect::<String>()
}

fn extract_assignment_name(line: &str) -> String {
    let Some(eq_index) = line.find('=') else {
        return "anonymous".to_string();
    };
    let before = &line[..eq_index];
    let token = before
    .split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_' || ch == '$'))
    .filter(|part| !part.is_empty())
    .last()
    .unwrap_or("anonymous");
    token.to_string()
}

fn find_typescript_function_start(line: &str) -> Option<(String, String)> {
    let stripped = strip_line_comments_and_strings(line, ".ts");
    if stripped.contains("function ") && stripped.contains('{') {
        let name = extract_word_after(&stripped, "function ");
        return Some((
                "function".to_string(),
                if name.is_empty() {
                    "anonymous".to_string()
                } else {
                    name
                },
        ));
    }

    if stripped.contains("=>") && stripped.contains('{') {
        let name = extract_assignment_name(&stripped);
        return Some(("arrow-function".to_string(), name));
    }

    None
}
