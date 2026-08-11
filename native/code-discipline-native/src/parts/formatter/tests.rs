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
    fn normalizes_operator_and_punctuation_spacing() {
        let source = [
            "function outer(data:Data):void{",
            "const character=data.text[data.index]??\"\";",
            "if(character===\"a\"){",
            "data.result.push(\"a\");",
            "}else{",
            "data.index+=1;",
            "}",
            "}",
            "const items=[1,2,3].map((value)=>{return value*2});",
            "type Shape={a:string,b:number};",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(120));

        assert_eq!(
            formatted,
            [
                "function outer(data: Data): void {",
                "  const character = data.text[data.index] ?? \"\";",
                "  if (character === \"a\") {",
                "    data.result.push(\"a\");",
                "  } else {",
                "    data.index += 1;",
                "  }",
                "}",
                "const items = [1, 2, 3].map((value) => { return value * 2 });",
                "type Shape = { a: string, b: number };",
                "",
            ]
            .join("\n")
        );
    }

    #[test]
    fn spacing_leaves_generics_ternaries_and_calls_intact() {
        let source = [
            "const map = new Map<string, Array<number>>();",
            "const picked = ready ? first : second;",
            "const run = (() => { return compute(); })();",
            "const negated = -value + (-other);",
            "const chained = list?.items?.[0] ?? fallback;",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(120));

        assert_eq!(formatted, source);
    }

    #[test]
    fn spacing_separates_closing_brackets_from_following_words() {
        let source = [
            "const ok = check(list.some((part) => match(part)))return;",
            "for (const [key, slug]of Object.entries(map)as Array<[string, string]>) {",
            "}",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(200));

        assert!(formatted.contains(")) return;"));
        assert!(formatted.contains("] of Object.entries(map) as Array<[string, string]>"));
    }

    #[test]
    fn preserves_shebang_lines_verbatim() {
        let source = [
            "#!/usr/bin/env node",
            "const value=1;",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(120));

        assert_eq!(
            formatted,
            ["#!/usr/bin/env node", "const value = 1;", ""].join("\n")
        );
    }

    #[test]
    fn normalizes_single_quotes_and_inserts_statement_semicolons() {
        let source = [
            "const name = 'one'",
            "const other = 'has \"quote\" inside'",
            "function run() {",
            "  return name",
            "}",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(120));

        assert_eq!(
            formatted,
            [
                "const name = \"one\";",
                "const other = 'has \"quote\" inside';",
                "function run() {",
                "  return name;",
                "}",
                "",
            ]
            .join("\n")
        );
    }

    #[test]
    fn never_terminates_multi_line_generic_type_arguments() {
        let source = [
            "type Invocation = ResultLike<",
            "  {",
            "    exportShape: Handler[\"exportShape\"];",
            "    invoked: boolean;",
            "  },",
            "  {",
            "    error?: string;",
            "    missing?: string[];",
            "  }",
            ">;",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(120));

        assert!(!formatted.contains("};"));
        assert!(formatted.contains("exportShape: Handler[\"exportShape\"];"));
        assert!(formatted.contains("error?: string;"));
        assert!(formatted.contains("missing?: string[];"));
        assert!(formatted.trim_end().ends_with(">;"));
    }

    #[test]
    fn keeps_template_literals_holding_regex_and_nested_templates_intact() {
        let source = [
            "function shellEscape(value) {",
            "  return `'${String(value).replace(/'/gu, `'\\''`)}'`;",
            "}",
            "const line = `const backup = ${JSON.stringify(backupPath)};`;",
            "const picked = flag ? [`./native/${binary}`] : [];",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(200));

        assert_eq!(formatted, source);
    }

    #[test]
    fn never_terminates_braceless_control_flow_headers() {
        let source = [
            "function theme() {",
            "  if (typeof document === \"undefined\")",
            "    return \"\";",
            "  for (const entry of list)",
            "    total += entry;",
            "  while (pending)",
            "    drain();",
            "  return total;",
            "}",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(120));

        assert!(!formatted.contains("\"undefined\");"));
        assert!(!formatted.contains("of list);"));
        assert!(!formatted.contains("(pending);"));
        assert!(formatted.contains("return total;"));
    }

    #[test]
    fn never_terminates_import_and_export_specifier_lists() {
        let source = [
            "import {",
            "  alpha,",
            "  beta",
            "} from \"./pair.js\";",
            "var value = 42;",
            "export {",
            "  value",
            "};",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(120));

        assert!(!formatted.contains("beta;"));
        assert!(!formatted.contains("value;\n}"));
        assert!(formatted.contains("} from \"./pair.js\";"));
        assert!(formatted.trim_end().ends_with("};"));
    }

    #[test]
    fn never_terminates_for_await_headers() {
        let source = [
            "async function read(stream) {",
            "  const chunks = [];",
            "  for await (const chunk of stream)",
            "    chunks.push(chunk);",
            "  return chunks;",
            "}",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(120));

        assert!(formatted.contains("for await (const chunk of stream)"));
        assert!(!formatted.contains("of stream);"));
        assert!(formatted.contains("chunks.push(chunk);"));
    }

    #[test]
    fn spacing_normalization_is_idempotent() {
        let source = [
            "function outer(data:Data):void{",
            "const value=data.a===1?data.b:data.c;",
            "}",
            "",
        ]
        .join("\n");

        let once = format_source_internal(&source, ".ts", &options(120));
        let twice = format_source_internal(&once, ".ts", &options(120));

        assert_eq!(once, twice);
    }

    #[test]
    fn indents_consistently_after_a_regex_literal_containing_a_quote() {
        let source = [
            "function outer(): void {",
            "  const pattern = /^r(#{0,16})\"/;",
            "  if (pattern !== null) {",
            "    inner();",
            "  }",
            "}",
            "",
        ]
        .join("\n");

        let formatted = format_source_internal(&source, ".ts", &options(96));

        assert_eq!(formatted, source);
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

    #[test]
    fn wraps_rust_raw_svg_element_attributes() {
        let source = [
            "fn render() {",
            "    svg.push_str(&format!(",
            "        r#\"",
            "        <text x=\"{text_x}\" y=\"{y}\" text-anchor=\"{anchor}\" font-family=\"{family}\" font-size=\"{font_size_mm}\" font-weight=\"{weight}\" fill=\"black\">{escaped}</text>",
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
            "  text: \"Development output is enabled. Print actions create SVG files under \" + root.appState.data_dir + \"/development-prints and do not send paper to a printer.\"",
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
