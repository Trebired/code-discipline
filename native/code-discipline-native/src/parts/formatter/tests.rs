#[cfg(test)]
mod formatter_tests {
    use super::*;
    use super::formatter_test_options as options;

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
    fn spacing_separates_closers_from_words() {
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
    fn normalizes_quotes_and_statement_semicolons() {
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
    fn keeps_templates_with_regex_and_nested_templates() {
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
    fn indents_after_regex_literal_with_quote() {
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
}
