#[cfg(test)]
mod tests {
    use super::*;
    use super::test_source_file as file;

    #[test]
    fn strips_comment_only_lines_without_touching_literals() {
        let source = [
            "const url = \"https://example.com\";",
            "const regex = /https?:\\/\\/example\\.com/;",
            "// remove this",
            "/* and this */",
            "export const app = { url, regex };",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".ts", &[]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert_eq!(
            result.text,
            [
                "const url = \"https://example.com\";",
                "const regex = /https?:\\/\\/example\\.com/;",
                "export const app = { url, regex };",
                "",
            ]
            .join("\n")
        );
    }

    #[test]
    fn keeps_code_after_regex_literals_that_contain_quotes() {
        let source = [
            "function startsRawString(data: StripState): boolean {",
            "  const pattern = /^r(#{0,16})\"/.exec(data.text.slice(data.index));",
            "  return pattern !== null;",
            "}",
            "",
            "function handleBlockComment(data: StripState): void {",
            "  const pair = data.text.slice(data.index, data.index + 2);",
            "  if (pair === \"/*\") {",
            "    data.blockDepth += 1;",
            "  } else if (pair === \"*/\") {",
            "    closeBlockComment(data);",
            "  }",
            "}",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".ts", &[]);

        assert!(!result.changed);
        assert_eq!(result.comment_count, 0);
        assert_eq!(result.text, source);
    }

    #[test]
    fn treats_slash_after_values_as_division_not_a_regex() {
        let source = [
            "const ratio = total / count;",
            "const nested = (alpha + beta) / 2;",
            "const indexed = values[0] / 2;",
            "const called = compute() / divisor;",
            "const quoted = \"kept\";",
            "// remove this",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".ts", &[]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 1);
        assert_eq!(
            result.text,
            [
                "const ratio = total / count;",
                "const nested = (alpha + beta) / 2;",
                "const indexed = values[0] / 2;",
                "const called = compute() / divisor;",
                "const quoted = \"kept\";",
                "",
            ]
            .join("\n")
        );
    }

    #[test]
    fn preserves_rust_raw_strings_while_stripping_nested_comments() {
        let source = [
            "pub fn build<'a>() -> &'a str {",
            "    let raw = r#\"// keep /* here */\"#;",
            "    // remove this",
            "    /* outer /* inner */ and this */",
            "    raw",
            "}",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".rs", &[]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert!(result.text.contains("r#\"// keep /* here */\"#"));
        assert!(!result.text.contains("outer"));
        assert!(!result.text.contains("inner"));
    }

    #[test]
    fn preserves_python_strings_shebang_and_encoding_comments() {
        let source = [
            "#!/usr/bin/env python3",
            "# coding: utf-8",
            "value = '# keep literal'",
            "text = \"\"\"# keep triple string\"\"\"",
            "# remove this",
            "result = value + text  # remove inline",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".py", &[]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert!(result.text.contains("#!/usr/bin/env python3"));
        assert!(result.text.contains("# coding: utf-8"));
        assert!(result.text.contains("'# keep literal'"));
        assert!(result.text.contains("# keep triple string"));
        assert!(!result.text.contains("remove this"));
        assert!(!result.text.contains("remove inline"));
    }

    #[test]
    fn preserves_shell_strings_shebang_and_heredocs() {
        let source = [
            "#!/usr/bin/env sh",
            "name='value # keep literal'",
            "cat <<EOF",
            "# keep heredoc",
            "EOF",
            "# remove this",
            "echo \"$name\" # remove inline",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".sh", &[]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert!(result.text.contains("#!/usr/bin/env sh"));
        assert!(result.text.contains("value # keep literal"));
        assert!(result.text.contains("# keep heredoc"));
        assert!(!result.text.contains("remove this"));
        assert!(!result.text.contains("remove inline"));
    }

    #[test]
    fn preserves_qml_strings_and_regex_literals() {
        let source = [
            "import QtQuick",
            "Item {",
            "    property string keep: \"literal // keep\"",
            "    property var matcher: /https?:\\/\\/example/.test(keep)",
            "    // remove this",
            "    function buildTitle() {",
            "        const text = \"/* keep block */\"",
            "        return `${text} // keep template` // remove inline",
            "    }",
            "}",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".qml", &[]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert!(result.text.contains("literal // keep"));
        assert!(result.text.contains("https?:\\/\\/example"));
        assert!(result.text.contains("/* keep block */"));
        assert!(result.text.contains("// keep template"));
        assert!(!result.text.contains("remove this"));
        assert!(!result.text.contains("remove inline"));
    }

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

        let violations = collect_block_function_violations(&file, &source, 5);

        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].rule, "max-function-lines");
        assert_eq!(violations[0].file_path, "src/lib.rs");
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

        let violations = collect_simple_typescript_function_violations(&file, &source, 5);

        assert_eq!(violations.len(), 1);
        assert_eq!(
            violations[0].message,
            "arrow-function buildPayload has 6 lines and exceeds the limit of 5"
        );
    }

    #[test]
    fn preserves_excluded_comments() {
        let source = ["// @ts-nocheck", "// remove this", "export const app = true;", ""].join("\n");
        let result = strip_comments_internal(&source, ".ts", &["@ts-nocheck".to_string()]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 1);
        assert_eq!(
            result.text,
            ["// @ts-nocheck", "export const app = true;", ""].join("\n")
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

    #[test]
    fn preserves_cpp_raw_strings_while_stripping_nested_comments() {
        let source = [
            "std::string build() {",
            "    auto raw = R\"(// keep /* here */)\";",
            "    // remove this",
            "    /* remove this too */",
            "    return raw;",
            "}",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".cpp", &[]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert!(result.text.contains("R\"(// keep /* here */)\""));
        assert!(!result.text.contains("remove this"));
    }

    #[test]
    fn preserves_csharp_verbatim_and_interpolated_strings() {
        let source = [
            "class Program",
            "{",
            "    static void Main()",
            "    {",
            "        var path = @\"C:\\temp\\// not a comment\";",
            "        var greeting = $\"hello {\"world\"} // not a comment\";",
            "        // remove this",
            "        /* remove this too */",
            "    }",
            "}",
            "",
        ]
        .join("\n");

        let result = strip_comments_internal(&source, ".cs", &[]);

        assert!(result.changed);
        assert_eq!(result.comment_count, 2);
        assert!(result.text.contains("@\"C:\\temp\\// not a comment\""));
        assert!(!result.text.contains("remove this"));
    }

    #[test]
    fn detects_cpp_block_function_line_violations() {
        let source = [
            "int buildPayload() {",
            "    int one = 1;",
            "    int two = 2;",
            "    int three = 3;",
            "    return one + two + three;",
            "}",
            "",
        ]
        .join("\n");
        let file = file("src/app.cpp", ".cpp");

        let violations = collect_block_function_violations(&file, &source, 5);

        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].rule, "max-function-lines");
        assert_eq!(violations[0].file_path, "src/app.cpp");
    }

    #[test]
    fn detects_csharp_allman_brace_function_line_violations() {
        let source = [
            "public class Payload",
            "{",
            "    public string Build()",
            "    {",
            "        var one = \"sam\";",
            "        var two = \"admin\";",
            "        var three = \"global\";",
            "        return one + two + three;",
            "    }",
            "}",
            "",
        ]
        .join("\n");
        let file = file("src/Payload.cs", ".cs");

        let violations = collect_block_function_violations(&file, &source, 5);

        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].message, "function Build has 7 lines and exceeds the limit of 5");
    }

    #[test]
    fn formats_cpp_and_csharp_brace_indentation() {
        let options = NativeFormatterOptions {
            max_characters_per_line: 100,
            indent_width: None,
            final_newline: true,
            trim_trailing_whitespace: true,
            collapse_blank_lines: true,
        };
        let cpp = ["int main() {", "if (true) {", "return 0;", "}", "}", ""].join("\n");
        let csharp = ["class Program", "{", "static void Main()", "{", "System.Console.WriteLine(\"ok\");", "}", "}", ""].join("\n");

        assert_eq!(
            format_source_internal(&cpp, ".cpp", &options),
            ["int main() {", "  if (true) {", "    return 0;", "  }", "}", ""].join("\n")
        );
        assert_eq!(
            format_source_internal(&csharp, ".cs", &options),
            [
                "class Program",
                "{",
                "    static void Main()",
                "    {",
                "        System.Console.WriteLine(\"ok\");",
                "    }",
                "}",
                "",
            ]
            .join("\n")
        );
    }
}
