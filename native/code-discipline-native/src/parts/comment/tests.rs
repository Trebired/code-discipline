#[cfg(test)]
mod comment_tests {
    use super::*;

    #[test]
    fn strips_comment_only_lines_and_keeps_literals() {
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
    fn keeps_code_after_quoted_regex_literals() {
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
    fn preserves_rust_raw_strings_with_nested_comments() {
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
    fn preserves_python_strings_and_header_comments() {
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
}
