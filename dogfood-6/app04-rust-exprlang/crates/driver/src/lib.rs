pub mod error;
pub mod render;

pub use error::Error;
pub use render::{line_col, render_error};

use exprlang_eval::Value;

/** @id CODE-DRV-001 @implements REQ-DRV-001 @implements REQ-DRV-002 */
pub fn run(src: &str) -> Result<Value, Error> {
    let ast = exprlang_syntax::parser::parse(src).map_err(Error::Parse)?;
    exprlang_types::check(&ast).map_err(Error::Type)?;
    exprlang_eval::eval(&ast).map_err(Error::Eval)
}
