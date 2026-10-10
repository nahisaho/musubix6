#pragma once
#include <stdexcept>

namespace lsm {
struct FormatError : std::runtime_error { using std::runtime_error::runtime_error; };
struct CorruptionError : std::runtime_error { using std::runtime_error::runtime_error; };
}  // namespace lsm
