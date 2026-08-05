#[cfg(test)]
mod structure_tests {
    use super::*;
    use super::test_source_file as file;

    fn violations(files: &[ScannedSourceFile]) -> Vec<CodeDisciplineViolation> {
        collect_source_file_structure_violations(files, &["_".to_string()], &["page".to_string()])
    }

    #[test]
    fn scans_source_file_structure_candidates_with_suggested_paths() {
        let files = vec![
            file("src/user_route.ts", ".ts"),
            file("src/user_model.ts", ".ts"),
            file("src/other.ts", ".ts"),
        ];
        let violations = violations(&files);

        assert_eq!(violations.len(), 2);
        assert_eq!(violations[0].file_path, "src/user_model.ts");
        assert_eq!(violations[0].suggested_path.as_deref(), Some("src/user/model.ts"));
        assert_eq!(violations[1].file_path, "src/user_route.ts");
        assert_eq!(violations[1].suggested_path.as_deref(), Some("src/user/route.ts"));
    }

    #[test]
    fn scans_source_file_structure_candidates_across_supported_languages() {
        let files = vec![
            file("src/view_logic.qml", ".qml"),
            file("src/view_model.qml", ".qml"),
            file("src/render_svg.rs", ".rs"),
            file("src/render_text.rs", ".rs"),
            file("src/task_run.sh", ".sh"),
            file("src/task_sync.sh", ".sh"),
            file("src/other.txt", ".txt"),
        ];
        let violations = violations(&files);
        let paths = violations
            .iter()
            .map(|violation| violation.file_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(violations.len(), 6);
        assert!(paths.contains(&"src/render_svg.rs"));
        assert!(paths.contains(&"src/task_run.sh"));
        assert!(paths.contains(&"src/view_logic.qml"));
        assert!(!paths.contains(&"src/other.txt"));
    }

    #[test]
    fn removes_redundant_role_suffixes_before_grouping() {
        let files = vec![
            file("src/pages/home_page.ts", ".ts"),
            file("src/pages/other_page.ts", ".ts"),
            file("src/pages/home_route.ts", ".ts"),
        ];
        let violations = violations(&files);
        let home = violations
            .iter()
            .find(|violation| violation.file_path == "src/pages/home_page.ts")
            .unwrap();
        let other = violations
            .iter()
            .find(|violation| violation.file_path == "src/pages/other_page.ts")
            .unwrap();

        assert_eq!(home.suggested_path.as_deref(), Some("src/pages/home.ts"));
        assert_eq!(home.details["mode"], "redundant-role-suffix");
        assert_eq!(home.details["roleSuffix"], "page");
        assert_eq!(other.suggested_path.as_deref(), Some("src/pages/other.ts"));
    }
}
