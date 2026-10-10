use crate::error::Error;

/** @id CODE-DRV-002 @implements REQ-DRV-004 */
pub fn line_col(src: &str, offset: usize) -> (usize, usize) {
    let offset = offset.min(src.len());
    let before = &src[..offset];
    let line = before.matches('\n').count() + 1;
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    (line, before[line_start..].chars().count() + 1)
}

/** @id CODE-DRV-003 @implements REQ-DRV-003 */
pub fn render_error(src: &str, err: &Error) -> String {
    let span = err.span();
    let (line, col) = line_col(src, span.start);
    let text = src.lines().nth(line - 1).unwrap_or("");
    let width = src[span.start.min(src.len())..span.end.min(src.len())].chars().count().max(1);
    format!(
        "{}:{}: {}\n{}\n{}{}",
        line,
        col,
        err.message(),
        text,
        " ".repeat(col - 1),
        "^".repeat(width)
    )
}
