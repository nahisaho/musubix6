#pragma once
#include <algorithm>
#include <vector>
#include "lsm/bloom.hpp"
#include "lsm/coding.hpp"
#include "lsm/errors.hpp"
#include "lsm/memtable.hpp"
#include "lsm/types.hpp"

namespace lsm {
constexpr uint64_t kSstMagic = 0x4C534D5353543031ull;
constexpr size_t kFooterSize = 48;

/** @id CODE-SST-003 @implements REQ-SST-003 REQ-SST-004 REQ-SST-005 */
class SstWriter {
 public:
  explicit SstWriter(size_t block_size = 4096) : block_size_(block_size) {}

  void add(const Entry& e) {
    if (finished_) throw std::logic_error("sst: writer finished");
    if (count_ > 0 && !internal_less(last_key_, last_seq_, e.key, e.seq)) throw std::invalid_argument("sst: entries out of order");
    if (count_ == 0) min_key_ = e.key;
    put_varint(block_, e.key.size());
    put_varint(block_, e.value.size());
    put_fixed(block_, e.seq, 8);
    block_.push_back(static_cast<char>(e.type));
    block_ += e.key;
    block_ += e.value;
    if (user_keys_.empty() || user_keys_.back() != e.key) user_keys_.push_back(e.key);
    last_key_ = e.key;
    last_seq_ = e.seq;
    ++count_;
    if (block_.size() >= block_size_) seal_block();
  }

  std::string finish() {
    if (finished_) throw std::logic_error("sst: writer finished");
    finished_ = true;
    seal_block();
    std::string index;
    put_varint(index, blocks_.size());
    put_varint(index, min_key_.size()); index += min_key_;
    put_varint(index, last_key_.size()); index += last_key_;
    for (auto& b : blocks_) {
      put_varint(index, b.last_key.size());
      index += b.last_key;
      put_fixed(index, b.last_seq, 8);
      put_fixed(index, b.offset, 8);
      put_fixed(index, b.size, 4);
    }
    uint64_t index_off = out_.size();
    out_ += index;
    put_fixed(out_, crc32(index), 4);
    BloomFilter bloom(user_keys_.empty() ? 1 : user_keys_.size(), 0.01);
    for (auto& k : user_keys_) bloom.add(k);
    std::string bb = bloom.serialize();
    uint64_t bloom_off = out_.size();
    out_ += bb;
    put_fixed(out_, crc32(bb), 4);
    put_fixed(out_, bloom_off, 8);
    put_fixed(out_, bb.size(), 8);
    put_fixed(out_, index_off, 8);
    put_fixed(out_, index.size(), 8);
    put_fixed(out_, count_, 8);
    put_fixed(out_, kSstMagic, 8);
    return out_;
  }

 private:
  struct BlockInfo { std::string last_key; uint64_t last_seq; uint64_t offset; uint32_t size; };
  void seal_block() {
    if (block_.empty()) return;
    blocks_.push_back({last_key_, last_seq_, out_.size(), static_cast<uint32_t>(block_.size())});
    out_ += block_;
    put_fixed(out_, crc32(block_), 4);
    block_.clear();
  }
  size_t block_size_;
  std::string out_, block_, last_key_, min_key_;
  uint64_t last_seq_ = 0, count_ = 0;
  std::vector<BlockInfo> blocks_;
  std::vector<std::string> user_keys_;
  bool finished_ = false;
};

class SstIterator;

/** @id CODE-SST-004 @implements REQ-SST-006 REQ-SST-007 REQ-SST-008 REQ-SST-009 REQ-SST-010 REQ-SST-011 REQ-SST-012 */
class SstReader {
 public:
  explicit SstReader(std::string data) : data_(std::move(data)), bloom_(1, 0.5) {
    if (data_.size() < kFooterSize) throw FormatError("sst: too short");
    size_t p = data_.size() - kFooterSize;
    uint64_t bloom_off = get_fixed(data_, p, 8), bloom_size = get_fixed(data_, p, 8);
    uint64_t index_off = get_fixed(data_, p, 8), index_size = get_fixed(data_, p, 8);
    count_ = get_fixed(data_, p, 8);
    if (get_fixed(data_, p, 8) != kSstMagic) throw FormatError("sst: bad magic");
    uint64_t limit = data_.size() - kFooterSize;
    if (!fits(index_off, index_size, limit) || !fits(bloom_off, bloom_size, limit)) throw FormatError("sst: bad footer offsets");
    std::string index = checked(index_off, index_size);
    bloom_ = BloomFilter::deserialize(checked(bloom_off, bloom_size));
    size_t q = 0;
    uint64_t n = get_varint(index, q);
    min_ = get_str(index, q);
    max_ = get_str(index, q);
    for (uint64_t i = 0; i < n; ++i) {
      Block b;
      b.last_key = get_str(index, q);
      b.last_seq = get_fixed(index, q, 8);
      b.offset = get_fixed(index, q, 8);
      b.size = static_cast<uint32_t>(get_fixed(index, q, 4));
      if (!fits(b.offset, b.size, limit)) throw FormatError("sst: bad block handle");
      blocks_.push_back(std::move(b));
    }
  }

  LookupResult get(const std::string& key, uint64_t snapshot = UINT64_MAX) const {
    if (!bloom_.may_contain(key)) return {};
    size_t bi = find_block(key, snapshot);
    if (bi >= blocks_.size()) return {};
    for (const Entry& e : read_block(bi)) {
      if (internal_less(e.key, e.seq, key, snapshot)) continue;
      if (e.key != key) return {};
      if (e.type == ValueType::Delete) return {LookupState::Deleted, std::string()};
      return {LookupState::Found, e.value};
    }
    return {};
  }

  SstIterator seek(const std::string& key) const;
  std::vector<Entry> all_entries() const {
    std::vector<Entry> out;
    for (size_t i = 0; i < blocks_.size(); ++i) {
      auto es = read_block(i);
      out.insert(out.end(), es.begin(), es.end());
    }
    return out;
  }
  std::vector<size_t> block_payload_sizes() const {
    std::vector<size_t> s;
    for (auto& b : blocks_) s.push_back(b.size);
    return s;
  }
  uint64_t block_reads() const { return reads_; }
  const BloomFilter& bloom() const { return bloom_; }
  uint64_t entry_count() const { return count_; }
  const std::string& min_key() const { return min_; }
  const std::string& max_key() const { return max_; }
  size_t block_count() const { return blocks_.size(); }

 private:
  friend class SstIterator;
  struct Block { std::string last_key; uint64_t last_seq = 0, offset = 0; uint32_t size = 0; };
  static bool fits(uint64_t off, uint64_t size, uint64_t limit) { return off <= limit && size <= limit - off && limit - off - size >= 4; }
  static std::string get_str(const std::string& in, size_t& p) {
    uint64_t n = get_varint(in, p);
    if (n > in.size() - p) throw FormatError("sst: bad string");
    std::string s = in.substr(p, n);
    p += n;
    return s;
  }
  std::string checked(uint64_t off, uint64_t size) const {
    std::string payload = data_.substr(off, size);
    size_t p = off + size;
    if (get_fixed(data_, p, 4) != crc32(payload)) throw CorruptionError("sst: checksum mismatch");
    return payload;
  }
  size_t find_block(const std::string& key, uint64_t seq) const {
    size_t i = 0;
    while (i < blocks_.size() && internal_less(blocks_[i].last_key, blocks_[i].last_seq, key, seq)) ++i;
    return i;
  }
  std::vector<Entry> read_block(size_t i) const {
    ++reads_;
    std::string payload = checked(blocks_[i].offset, blocks_[i].size);
    std::vector<Entry> out;
    size_t p = 0;
    while (p < payload.size()) {
      uint64_t kl = get_varint(payload, p), vl = get_varint(payload, p);
      Entry e;
      e.seq = get_fixed(payload, p, 8);
      if (p >= payload.size() || kl > payload.size() - p - 1 || vl > payload.size() - p - 1 - kl) throw CorruptionError("sst: bad entry");
      e.type = payload[p++] == 0 ? ValueType::Delete : ValueType::Put;
      e.key = payload.substr(p, kl);
      e.value = payload.substr(p + kl, vl);
      p += kl + vl;
      out.push_back(std::move(e));
    }
    return out;
  }

  std::string data_;
  BloomFilter bloom_;
  std::vector<Block> blocks_;
  std::string min_, max_;
  uint64_t count_ = 0;
  mutable uint64_t reads_ = 0;
};

class SstIterator {
 public:
  bool valid() const { return valid_; }
  const Entry& entry() const { return cur_[pos_]; }
  void next() {
    if (++pos_ < cur_.size()) return;
    load(blk_ + 1);
  }
 private:
  friend class SstReader;
  SstIterator(const SstReader* r, size_t blk) : r_(r) { load(blk); }
  void load(size_t blk) {
    blk_ = blk;
    pos_ = 0;
    valid_ = blk < r_->blocks_.size();
    cur_ = valid_ ? r_->read_block(blk) : std::vector<Entry>();
    valid_ = valid_ && !cur_.empty();
  }
  const SstReader* r_;
  size_t blk_ = 0, pos_ = 0;
  std::vector<Entry> cur_;
  bool valid_ = false;
};

inline SstIterator SstReader::seek(const std::string& key) const {
  SstIterator it(this, find_block(key, UINT64_MAX));
  while (it.valid() && it.entry().key < key) it.next();
  return it;
}

/** @id CODE-SST-005 @implements REQ-SST-013 */
inline std::string write_sstable(const MemTable& m, size_t block_size = 4096) {
  SstWriter w(block_size);
  for (const Entry& e : m.entries()) w.add(e);
  return w.finish();
}
}  // namespace lsm
