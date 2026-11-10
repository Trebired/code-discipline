fn continues_formatter_expression(masked_trimmed: &str) -> bool {
    let trimmed = masked_trimmed.trim_end();
    trimmed.ends_with('+') || trimmed.ends_with("&&") || trimmed.ends_with("||")
}
