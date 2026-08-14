#[cfg(test)]
mod tests {
    use super::*;
    use super::test_source_file as file;

    #[test]
    fn detects_block_function_line_violations() {
        let source = [
            "pub fn build_payload() -> String {",
            "    let one = \"sam\";",
            "    let two = \"admin\";",
            "    let three = \"global\";",
            "    format!(\"{one}{two}{three}\")",
            "}",
            "",
        ]
        .join("\n");
        let file = file("src/lib.rs", ".rs");

        let violations = collect_block_function_reports(
            &file,
            &source,
            5,
            FunctionLineReportKind::Violation,
        );

        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].rule, "max-function-lines");
        assert_eq!(violations[0].file_path, "src/lib.rs");
    }

    #[test]
    fn ignores_rust_bodyless_function_signatures() {
        let source = [
            "trait Runner {",
            "    fn trait_only(",
            "        value: String,",
            "    ) -> String;",
            "}",
            "",
            "extern \"C\" {",
            "    fn foreign_call(",
            "        value: i32,",
            "    );",
            "}",
            "",
            "pub(crate) async fn build_payload(",
            "    value: String,",
            ") -> String",
            "where",
            "    String: Clone,",
            "{",
            "    let one = value.clone();",
            "    let two = value;",
            "    format!(\"{one}{two}\")",
            "}",
            "",
        ]
        .join("\n");
        let file = file("src/lib.rs", ".rs");

        let violations = collect_block_function_reports(
            &file,
            &source,
            4,
            FunctionLineReportKind::Violation,
        );

        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].details["functionName"].as_str(), Some("build_payload"));
        assert_eq!(violations[0].details["startLine"].as_u64(), Some(13));
    }

    #[test]
    fn detects_simple_typescript_arrow_function_line_violations() {
        let source = [
            "export const buildPayload = () => {",
            "  const user = \"sam\";",
            "  const role = \"admin\";",
            "  const scope = \"global\";",
            "  return { user, role, scope };",
            "};",
            "",
        ]
        .join("\n");
        let file = file("src/functions.ts", ".ts");

        let violations = collect_simple_typescript_function_reports(
            &file,
            &source,
            5,
            FunctionLineReportKind::Violation,
        );

        assert_eq!(violations.len(), 1);
        assert_eq!(
            violations[0].message,
            "arrow-function buildPayload has 6 lines and exceeds the limit of 5"
        );
    }

    #[test]
    fn formats_brace_languages_with_stable_indentation() {
        let source = [
            "export function run(){",
            "const value = {",
            "name: \"one\"",
            "}",
            "return value",
            "}",
            "",
        ]
        .join("\n");
        let options = NativeFormatterOptions {
            max_characters_per_line: 100,
            indent_width: Some(2),
            final_newline: true,
            trim_trailing_whitespace: true,
            collapse_blank_lines: true,
        };

        let formatted = format_source_internal(&source, ".ts", &options);

        assert_eq!(
            formatted,
            [
                "export function run() {",
                "  const value = {",
                "    name: \"one\"",
                "  };",
                "  return value;",
                "}",
                "",
            ]
            .join("\n")
        );
    }

    #[test]
    fn preserves_python_blocks_and_wraps_comments() {
        let source = [
            "#!/usr/bin/env python3",
            "def run():   ",
            "    # this comment is long enough that it should wrap at a small configured width",
            "    return True",
            "",
            "",
        ]
        .join("\n");
        let options = NativeFormatterOptions {
            max_characters_per_line: 44,
            indent_width: None,
            final_newline: true,
            trim_trailing_whitespace: true,
            collapse_blank_lines: true,
        };

        let formatted = format_source_internal(&source, ".py", &options);

        assert_eq!(
            formatted,
            [
                "#!/usr/bin/env python3",
                "def run():",
                "    # this comment is long enough that it",
                "    # should wrap at a small configured",
                "    # width",
                "    return True",
                "",
            ]
            .join("\n")
        );
    }

    #[test]
    fn formats_qml_and_style_sources() {
        let options = NativeFormatterOptions {
            max_characters_per_line: 100,
            indent_width: Some(2),
            final_newline: true,
            trim_trailing_whitespace: true,
            collapse_blank_lines: true,
        };
        let qml = ["Item {", "MouseArea {", "onClicked: {", "console.log(\"ok\")", "}", "}", "}", ""].join("\n");
        let css = [".item {", "color: red;", "@media screen {", "display: block;", "}", "}", ""].join("\n");

        assert_eq!(
            format_source_internal(&qml, ".qml", &options),
            ["Item {", "  MouseArea {", "    onClicked: {", "      console.log(\"ok\")", "    }", "  }", "}", ""].join("\n")
        );
        assert_eq!(
            format_source_internal(&css, ".css", &options),
            [".item {", "  color: red;", "  @media screen {", "    display: block;", "  }", "}", ""].join("\n")
        );
    }
}
