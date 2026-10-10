#pragma once
#include <cstdint>
#include <string>
#include "lsm/bloom.hpp"

namespace lsm {

/** @id CODE-SST-001 @implements REQ-SST-001 */
inline void put_varint(std::string& out, uint64_t v) {
  while (v >= 0x80) { out.push_back(static_cast<char>((v & 0x7f) | 0x80)); v >>= 7; }
  out.push_back(static_cast<char>(v));
}
inline uint64_t get_varint(const std::string& in, size_t& pos) {
  uint64_t v = 0;
  for (int shift = 0; shift <= 63; shift += 7) {
    if (pos >= in.size()) throw FormatError("varint: truncated");
    unsigned char b = static_cast<unsigned char>(in[pos++]);
    if (shift == 63 && b > 1) throw FormatError("varint: overflow");
    v |= static_cast<uint64_t>(b & 0x7f) << shift;
    if (!(b & 0x80)) return v;
  }
  throw FormatError("varint: too long");
}

inline void put_fixed(std::string& out, uint64_t v, int bytes) {
  for (int i = 0; i < bytes; ++i) out.push_back(static_cast<char>((v >> (8 * i)) & 0xff));
}
inline uint64_t get_fixed(const std::string& in, size_t& pos, int bytes) {
  if (pos + static_cast<size_t>(bytes) > in.size()) throw FormatError("fixed: truncated");
  uint64_t v = 0;
  for (int i = 0; i < bytes; ++i) v |= static_cast<uint64_t>(static_cast<unsigned char>(in[pos + i])) << (8 * i);
  pos += static_cast<size_t>(bytes);
  return v;
}

/** @id CODE-SST-002 @implements REQ-SST-002 */
inline uint32_t crc32(const std::string& s) {
  uint32_t crc = 0xFFFFFFFFu;
  for (unsigned char c : s) {
    crc ^= c;
    for (int k = 0; k < 8; ++k) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
  }
  return ~crc;
}
}  // namespace lsm
