#[cfg(test)]
mod c_family_tests {
    use super::*;
    use super::test_source_file as file;

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

        let violations = collect_block_function_reports(
            &file,
            &source,
            5,
            FunctionLineReportKind::Violation,
        );

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

        let violations = collect_block_function_reports(
            &file,
            &source,
            5,
            FunctionLineReportKind::Violation,
        );

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
