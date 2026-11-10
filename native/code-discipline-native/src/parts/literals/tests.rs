#[cfg(test)]
mod literal_tests {
    use super::*;

    fn options() -> NativeFormatterOptions {
        formatter_test_options(150)
    }

    fn string_body(lines: &[&str]) -> String {
        lines.join("\n")
    }

    fn assert_literal_kept(extension: &str, before: &[&str], literal: &[&str], after: &[&str]) {
        let literal = string_body(literal);
        let source = [string_body(before), literal.clone(), string_body(after), String::new()].join("\n");
        let formatted = format_source_internal(&source, extension, &options());

        assert!(formatted.contains(&literal), "{extension} literal changed: {formatted:?}");
        assert_eq!(format_source_internal(&formatted, extension, &options()), formatted);
    }

    #[test]
    fn keeps_rust_strings_byte_for_byte() {
        let inner = ["      keep   ", "", "", "   me", "  \"#;"];
        assert_literal_kept(".rs", &["fn a() {", "  let s = r#\""], &inner, &["}"]);
        assert_literal_kept(".rs", &["fn a() {", "  let s = \"x   "], &["      y", "", "  z\";"], &["}"]);
        assert_literal_kept(".rs", &["fn a() {", "  let s = b\"a"], &["      b\";"], &["}"]);
        assert_literal_kept(".rs", &["fn a() {", "  let s = \"one \\"], &["      two\";"], &["}"]);
    }

    #[test]
    fn keeps_script_templates_and_go_raw_strings() {
        assert_literal_kept(".ts", &["export const a = `"], &["      keep   ", "", "", "   me", "`;"], &[]);
        assert_literal_kept(".ts", &["export const a = `x ${fn(`"], &["   inner", "`)} y", "    z`;"], &[]);
        assert_literal_kept(".go", &["func f() string {", "  return `"], &["      keep   ", "", "   me", "`"], &["}"]);
    }

    #[test]
    fn keeps_python_shell_and_c_family_literals() {
        assert_literal_kept(".py", &["def f():", "    s = \"\"\""], &["      keep   ", "", "", "   me", "\"\"\""], &["    return s"]);
        assert_literal_kept(".sh", &["f() {", "  cat <<EOF"], &["      keep   ", "", "   me", "EOF"], &["}"]);
        assert_literal_kept(".sh", &["f() {", "  echo \"a"], &["      keep   ", "", "   me\""], &["}"]);
        assert_literal_kept(".cs", &["class A {", "  string s = @\""], &["      keep   ", "", "   me", "\";"], &["}"]);
        assert_literal_kept(".cs", &["class A {", "  string s = \"\"\""], &["      keep   ", "", "   me", "  \"\"\";"], &["}"]);
        assert_literal_kept(".cpp", &["int main() {", "  auto s = R\"("], &["      keep   ", "", "   me", ")\";"], &["}"]);
    }

    #[test]
    fn code_after_a_multiline_literal_is_still_formatted() {
        let source = "fn a() {\n  let s = \"x\n  y\";\n  go();\n}\n";
        let formatted = format_source_internal(source, ".rs", &options());

        assert_eq!(formatted, "fn a() {\n    let s = \"x\n  y\";\n    go();\n}\n");
    }

    #[test]
    fn trims_trailing_whitespace_outside_literals() {
        let formatted = format_source_internal("fn a() {   \n    go();   \n}\n", ".rs", &options());

        assert_eq!(formatted, "fn a() {\n    go();\n}\n");
    }

    #[test]
    fn rust_lifetimes_do_not_open_a_string() {
        let source = "fn a<'a>(x: &'a str) -> &'a str {\n    x\n}\nfn b() {}\n";
        let masked = mask_source_spans(source, ".rs");

        assert_eq!(masked, source);
    }

    #[test]
    fn masks_strings_and_comments_keeping_lines() {
        let source = "let a = \"{\n\";\n// }\nlet b = '{';\n";
        let masked = mask_source_spans(source, ".rs");

        assert!(!masked.contains('{'));
        assert!(!masked.contains('}'));
        assert_eq!(masked.matches('\n').count(), source.matches('\n').count());
    }

    #[test]
    fn literal_flags_mark_every_line_a_literal_touches() {
        let flags = literal_line_flags("a\nb = \"x\ny\nz\";\nc\n", ".rs");
        let marks = flags.iter().map(|flag| (flag.starts_inside, flag.ends_inside)).collect::<Vec<_>>();

        assert_eq!(marks, vec![(false, false), (false, true), (true, true), (true, false), (false, false), (false, false)]);
    }

    #[test]
    fn jsx_apostrophes_do_not_swallow_following_lines() {
        let source = "const a = <p>don't</p>;\nconst b = 1;\n";
        let flags = literal_line_flags(source, ".tsx");

        assert!(flags.iter().all(|flag| !flag.starts_inside && !flag.ends_inside));
    }

    #[test]
    fn shell_arithmetic_shift_is_not_a_heredoc() {
        let flags = literal_line_flags("x=$((1<<2))\necho hi\n", ".sh");

        assert!(flags.iter().all(|flag| !flag.starts_inside && !flag.ends_inside));
    }
}
