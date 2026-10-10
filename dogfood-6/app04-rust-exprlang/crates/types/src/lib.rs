pub mod checker;
pub mod env;
pub mod error;

pub use checker::{check, check_in};
pub use env::TypeEnv;
pub use error::{TypeError, TypeErrorKind};
