#[cfg(test)]
mod formatter_tests {
    use super::*;

    fn options(max: usize) -> NativeFormatterOptions {
        NativeFormatterOptions {
            max_characters_per_line: max,
            indent_width: None,
            final_newline: true,
            trim_trailing_whitespace: true,
            collapse_blank_lines: true,
        }
    }

    fn assert_lines_fit(text: &str, max: usize) {
        for (index, line) in text.lines().enumerate() {
            assert!(
                count_display_characters(line) <= max,
                "line {} has {} characters: {}",
                index + 1,
                count_display_characters(line),
                line,
            );
        }
    }

    #[test]
    fn wraps_typescript_strings_and_call_arguments() {
        let source = [
            "export function run(){",
            "const message = \"The formatter keeps this TypeScript string value identical while splitting the expression over multiple lines.\"",
            "return sendEvent(\"app.start\", message, { enabled: true, retries: 3, mode: \"normal\" })",
            "}",
            "",
        ]
        .join("\n");
        let formatted = format_source_internal(&source, ".ts", &options(72));

        assert!(formatted.contains("\"The formatter keeps this TypeScript string value \" +"));
        assert!(formatted.contains("return sendEvent("));
        assert_lines_fit(&formatted, 72);
    }

    #[test]
    fn wraps_qml_strings_arrays_and_one_line_functions() {
        let source = [
            "Item {",
            "function dateFormatIndex(format) { const formats = [\"date\", \"date_time\", \"full_date_time\", \"iso_date\", \"iso_date_time\", \"time\"]; const index = formats.indexOf(format || \"date\"); return index < 0 ? 0 : index }",
            "Controls.Label {",
            "text: \"This clears records and counters while preserving the label string as a JavaScript concatenation.\"",
            "}",
            "}",
            "",
        ]
        .join("\n");
        let formatted = format_source_internal(&source, ".qml", &options(84));

        assert!(formatted.contains("function dateFormatIndex(format) {"));
        assert!(formatted.contains("const formats = ["));
        assert!(formatted.contains("text: \"This clears records"));
        assert!(formatted.contains(" +\n      \""));
        assert_lines_fit(&formatted, 84);
    }

    #[test]
    fn wraps_python_strings_with_implicit_concatenation() {
        let source = [
            "def report():",
            "    lines = [",
            "        \"The formatter preserves this Python string value by using implicit string literal concatenation inside parentheses.\",",
            "    ]",
            "    return lines",
            "",
        ]
        .join("\n");
        let formatted = format_source_internal(&source, ".py", &options(76));

        assert!(formatted.contains("        ("));
        assert!(formatted.contains("\"The formatter preserves this Python string value by using \""));
        assert_lines_fit(&formatted, 76);
    }

    #[test]
    fn wraps_rust_raw_strings_with_concat_macro() {
        let source = [
            "fn svg() -> &'static str {",
            "r#\"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80mm\" height=\"50mm\" viewBox=\"0 0 80 50\"><rect width=\"80\" height=\"50\" fill=\"white\"/></svg>\"#",
            "}",
            "",
        ]
        .join("\n");
        let formatted = format_source_internal(&source, ".rs", &options(92));

        assert!(formatted.contains("concat!("));
        assert!(formatted.contains("r#\"<svg xmlns=\""));
        assert_lines_fit(&formatted, 92);
    }

    #[test]
    fn wraps_markup_attributes_without_splitting_text_content() {
        let source = [
            "fn render() -> String {",
            "format!(",
            "r#\"",
            "<text x=\"10\" y=\"20\" text-anchor=\"middle\" font-family=\"Inter\" font-size=\"12\" font-weight=\"600\" fill=\"black\">{value}</text>",
            "\"#,",
            "value = \"ok\",",
            ")",
            "}",
            "",
        ]
        .join("\n");
        let formatted = format_source_internal(&source, ".rs", &options(88));

        assert!(formatted.contains("font-weight=\"600\" fill=\"black\">{value}</text>"));
        assert!(!formatted.contains("fill=\"black\">\n"));
        assert_lines_fit(&formatted, 88);
    }
}
