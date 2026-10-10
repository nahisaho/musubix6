#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
#include "lsm/errors.hpp"

namespace lsm {

/** @id CODE-BLOOM-001 @implements REQ-BLOOM-009 */
inline uint64_t fnv1a64(const std::string& s) {
  uint64_t h = 0xcbf29ce484222325ull;
  for (unsigned char c : s) { h ^= c; h *= 0x100000001b3ull; }
  return h;
}

/** @id CODE-BLOOM-002 @implements REQ-BLOOM-001 REQ-BLOOM-002 REQ-BLOOM-003 REQ-BLOOM-004 REQ-BLOOM-005 REQ-BLOOM-006 REQ-BLOOM-007 REQ-BLOOM-008 */
class BloomFilter {
 public:
  BloomFilter(uint64_t n, double p) {
    if (n == 0 || !(p > 0.0 && p < 1.0)) throw std::invalid_argument("bloom: bad n/p");
    const double ln2 = std::log(2.0);
    double m = std::ceil(-static_cast<double>(n) * std::log(p) / (ln2 * ln2));
    m_ = (static_cast<uint64_t>(m) + 7) / 8 * 8;
    double k = std::round(static_cast<double>(m_) / static_cast<double>(n) * ln2);
    k_ = k < 1.0 ? 1u : static_cast<uint32_t>(k);
    bits_.assign(m_ / 8, 0);
  }
  uint64_t bit_count() const { return m_; }
  uint32_t hash_count() const { return k_; }

  void add(const std::string& key) {
    uint64_t h1, h2;
    hashes(key, h1, h2);
    for (uint32_t i = 0; i < k_; ++i) {
      uint64_t b = (h1 + i * h2) % m_;
      bits_[b >> 3] |= static_cast<uint8_t>(1u << (b & 7));
    }
  }
  bool may_contain(const std::string& key) const {
    uint64_t h1, h2;
    hashes(key, h1, h2);
    for (uint32_t i = 0; i < k_; ++i) {
      uint64_t b = (h1 + i * h2) % m_;
      if (!(bits_[b >> 3] & (1u << (b & 7)))) return false;
    }
    return true;
  }

  std::string serialize() const {
    std::string out("BLM1", 4);
    put(out, k_, 4);
    put(out, m_, 8);
    out.append(reinterpret_cast<const char*>(bits_.data()), bits_.size());
    return out;
  }
  static BloomFilter deserialize(const std::string& in) {
    if (in.size() < 16 || std::memcmp(in.data(), "BLM1", 4) != 0) throw FormatError("bloom: bad magic");
    uint64_t k = get(in, 4, 4), m = get(in, 8, 8);
    if (k == 0 || m == 0 || m % 8 != 0 || in.size() != 16 + m / 8) throw FormatError("bloom: bad length");
    BloomFilter f(1, 0.5);
    f.k_ = static_cast<uint32_t>(k);
    f.m_ = m;
    f.bits_.assign(in.begin() + 16, in.end());
    return f;
  }

  void merge(const BloomFilter& o) {
    if (o.m_ != m_ || o.k_ != k_) throw std::invalid_argument("bloom: merge shape mismatch");
    for (size_t i = 0; i < bits_.size(); ++i) bits_[i] |= o.bits_[i];
  }

 private:
  static void hashes(const std::string& key, uint64_t& h1, uint64_t& h2) {
    h1 = fnv1a64(key);
    uint64_t x = h1 + 0x9e3779b97f4a7c15ull;
    x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ull;
    x = (x ^ (x >> 27)) * 0x94d049bb133111ebull;
    h2 = (x ^ (x >> 31)) | 1ull;
  }
  static void put(std::string& out, uint64_t v, int bytes) {
    for (int i = 0; i < bytes; ++i) out.push_back(static_cast<char>((v >> (8 * i)) & 0xff));
  }
  static uint64_t get(const std::string& in, size_t off, int bytes) {
    uint64_t v = 0;
    for (int i = 0; i < bytes; ++i) v |= static_cast<uint64_t>(static_cast<unsigned char>(in[off + i])) << (8 * i);
    return v;
  }
  uint64_t m_ = 0;
  uint32_t k_ = 0;
  std::vector<uint8_t> bits_;
};
}  // namespace lsm
