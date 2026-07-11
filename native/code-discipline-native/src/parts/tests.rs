#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, extension: &str) -> ScannedSourceFile {
        ScannedSourceFile {
            absolute_path: format!("/repo/{path}"),
            relative_from_project_root: path.to_string(),
            relative_from_source_root: path.strip_prefix("src/").unwrap_or(path).to_string(),
            extension: extension.to_string(),
        }
    }

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
    fn scans_folderize_candidates_with_suggested_paths() {
        let files = vec![
            file("src/user_route.ts", ".ts"),
            file("src/user_model.ts", ".ts"),
            file("src/other.ts", ".ts"),
        ];

        let violations = collect_folderize_violations(&files, &["_".to_string()]);

        assert_eq!(violations.len(), 2);
        assert_eq!(violations[0].file_path, "src/user_model.ts");
        assert_eq!(
            violations[0].suggested_path.as_deref(),
            Some("src/user/model.ts")
        );
        assert_eq!(violations[1].file_path, "src/user_route.ts");
        assert_eq!(
            violations[1].suggested_path.as_deref(),
            Some("src/user/route.ts")
        );
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
}
