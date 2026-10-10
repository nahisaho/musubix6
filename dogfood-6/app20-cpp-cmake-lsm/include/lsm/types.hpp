#pragma once
#include <cstdint>
#include <stdexcept>
#include <string>

namespace lsm {
enum class ValueType : uint8_t { Delete = 0, Put = 1 };
enum class LookupState { NotFound, Found, Deleted };
struct Entry {
  std::string key;
  uint64_t seq = 0;
  ValueType type = ValueType::Put;
  std::string value;
};
struct LookupResult {
  LookupState state = LookupState::NotFound;
  std::string value;
};
}  // namespace lsm

namespace lsm {
/** @id CODE-MEM-001 @implements REQ-MEM-006 */
// internal-key order: user key ascending, then seq descending (newest first)
inline bool internal_less(const std::string& ak, uint64_t aseq, const std::string& bk, uint64_t bseq) {
  int c = ak.compare(bk);
  return c != 0 ? c < 0 : aseq > bseq;
}
inline bool entry_less(const Entry& a, const Entry& b) { return internal_less(a.key, a.seq, b.key, b.seq); }
}  // namespace lsm
