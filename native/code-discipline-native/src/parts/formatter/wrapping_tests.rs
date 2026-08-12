#[cfg(test)]
mod formatter_wrapping_tests {
    use super::*;
    use super::assert_formatter_lines_fit as assert_lines_fit;
    use super::formatter_test_options as options;

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
            concat!(
                "function dateFormatIndex(format) { const formats = [\"date\", \"date_time\", ",
                "\"full_date_time\", \"iso_date\", \"iso_date_time\", \"time\"]; ",
                "const index = formats.indexOf(format || \"date\"); return index < 0 ? 0 : index }",
            ),
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
            concat!(
                "r#\"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80mm\" ",
                "height=\"50mm\" viewBox=\"0 0 80 50\"><rect width=\"80\" ",
                "height=\"50\" fill=\"white\"/></svg>\"#",
            ),
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
            concat!(
                "<text x=\"10\" y=\"20\" text-anchor=\"middle\" font-family=\"Inter\" ",
                "font-size=\"12\" font-weight=\"600\" fill=\"black\">{value}</text>",
            ),
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

    #[test]
    fn wraps_rust_raw_svg_element_attributes() {
        let source = [
            "fn render() {",
            "    svg.push_str(&format!(",
            "        r#\"",
            concat!(
                "        <text x=\"{text_x}\" y=\"{y}\" text-anchor=\"{anchor}\" ",
                "font-family=\"{family}\" font-size=\"{font_size_mm}\" ",
                "font-weight=\"{weight}\" fill=\"black\">{escaped}</text>",
            ),
            "        \"#,",
            "    ));",
            "}",
            "",
        ]
        .join("\n");
        let formatted = format_source_internal(&source, ".rs", &options(150));

        assert!(formatted.contains("<text"));
        assert!(formatted.contains("fill=\"black\">{escaped}</text>"));
        assert_lines_fit(&formatted, 150);
        assert_eq!(format_source_internal(&formatted, ".rs", &options(150)), formatted);
    }

    #[test]
    fn wraps_qml_string_concatenation_properties() {
        let source = [
            "Kirigami.InlineMessage {",
            concat!(
                "  text: \"Development output is enabled. Print actions create SVG files under \" ",
                "+ root.appState.data_dir + \"/development-prints and do not send paper to a printer.\"",
            ),
            "}",
            "",
        ]
        .join("\n");
        let formatted = format_source_internal(&source, ".qml", &options(150));

        assert!(formatted.contains("\" +\n"));
        assert!(formatted.contains("root.appState.data_dir +"));
        assert_lines_fit(&formatted, 150);
    }

    #[test]
    fn expands_compact_qml_blocks_below_line_limit() {
        let source = [
            "QtObject {",
            "  function ticketWidthCm() { return parsedCm(props.widthText, 5) }",
            "  function gridMinimumK(axisMm) { const step = gridStepMm(axisMm); return Math.ceil(-axisMm / (2 * step)) }",
            "  function fittedImageSizeMm(width, height) {",
            "    if (height > 10) { height = 10; width = height }",
            "    return { width, height }",
            "  }",
            "}",
            "",
        ]
        .join("\n");
        let formatted = format_source_internal(&source, ".qml", &options(150));

        assert!(formatted.contains("function ticketWidthCm() {\n    return parsedCm(props.widthText, 5)\n  }"));
        assert!(formatted.contains("const step = gridStepMm(axisMm);"));
        assert!(formatted.contains("if (height > 10) {\n      height = 10;\n      width = height\n    }"));
        assert_lines_fit(&formatted, 150);
    }
}
