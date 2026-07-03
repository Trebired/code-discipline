use napi::Result;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

include!("parts/support.rs");
include!("parts/comment_ranges.rs");
include!("parts/comment_stripping.rs");
include!("parts/common_violations.rs");
include!("parts/folderize.rs");
include!("parts/function_lines.rs");
include!("parts/evasion_detection.rs");
include!("parts/api.rs");
include!("parts/tests.rs");
