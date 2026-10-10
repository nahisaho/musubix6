#pragma once
#include <algorithm>
#include <memory>
#include <vector>
#include "lsm/sstable.hpp"
#include "lsm/types.hpp"

namespace lsm {

/** @id CODE-CMP-001 @implements REQ-CMP-001 REQ-CMP-002 REQ-CMP-003 */
class VectorCursor {
 public:
  explicit VectorCursor(const std::vector<Entry>& v) : v_(&v) {}
  bool valid() const { return i_ < v_->size(); }
  const Entry& entry() const { return (*v_)[i_]; }
  void next() { ++i_; }
 private:
  const std::vector<Entry>* v_;
  size_t i_ = 0;
};

// Cursor concept: valid(), entry() -> const Entry&, next(). Lower cursor index = newer source.
template <class Cursor>
class MergeIterator {
 public:
  explicit MergeIterator(std::vector<Cursor> cursors) : cs_(std::move(cursors)) {
    for (size_t i = 0; i < cs_.size(); ++i)
      if (cs_[i].valid()) heap_.push_back(i);
    std::make_heap(heap_.begin(), heap_.end(), after());
  }
  bool valid() const { return !heap_.empty(); }
  const Entry& entry() const { return cs_[heap_.front()].entry(); }
  void next() {
    const std::string key = entry().key;
    const uint64_t seq = entry().seq;
    while (!heap_.empty() && cs_[heap_.front()].entry().key == key && cs_[heap_.front()].entry().seq == seq) {
      size_t t = heap_.front();
      std::pop_heap(heap_.begin(), heap_.end(), after());
      heap_.pop_back();
      cs_[t].next();
      if (cs_[t].valid()) { heap_.push_back(t); std::push_heap(heap_.begin(), heap_.end(), after()); }
    }
  }
 private:
  // min-heap on internal order; equal entries favour the lower (newer) cursor index
  auto after() const {
    return [this](size_t a, size_t b) {
      const Entry& x = cs_[a].entry();
      const Entry& y = cs_[b].entry();
      if (entry_less(y, x)) return true;
      if (entry_less(x, y)) return false;
      return a > b;
    };
  }
  std::vector<Cursor> cs_;
  std::vector<size_t> heap_;
};

struct CompactionOptions {
  uint64_t oldest_snapshot = 0;
  bool bottommost = false;
  size_t block_size = 4096;
  size_t target_file_size = SIZE_MAX;
};
struct CompactionStats { size_t input_entries = 0, output_entries = 0, dropped_versions = 0, dropped_tombstones = 0; };
struct CompactionResult { std::vector<std::string> files; CompactionStats stats; };

/** @id CODE-CMP-002 @implements REQ-CMP-004 REQ-CMP-005 REQ-CMP-006 REQ-CMP-007 REQ-CMP-008 REQ-CMP-009 REQ-CMP-012 */
template <class Cursor>
CompactionResult compact(std::vector<Cursor> inputs, const CompactionOptions& opt) {
  CompactionResult res;
  MergeIterator<Cursor> it(std::move(inputs));
  std::unique_ptr<SstWriter> w;
  size_t file_bytes = 0;
  std::string cur_key, last_written;
  bool have_key = false, base_seen = false;
  for (; it.valid(); it.next()) {
    const Entry& e = it.entry();
    ++res.stats.input_entries;
    if (!have_key || e.key != cur_key) { cur_key = e.key; have_key = true; base_seen = false; }
    if (base_seen) { ++res.stats.dropped_versions; continue; }
    if (e.seq <= opt.oldest_snapshot) {
      base_seen = true;
      if (e.type == ValueType::Delete && opt.bottommost) { ++res.stats.dropped_tombstones; continue; }
    }
    if (w && file_bytes >= opt.target_file_size && e.key != last_written) {
      res.files.push_back(w->finish());
      w.reset();
    }
    if (!w) { w = std::make_unique<SstWriter>(opt.block_size); file_bytes = 0; }
    w->add(e);
    file_bytes += e.key.size() + e.value.size() + 16;
    last_written = e.key;
    ++res.stats.output_entries;
  }
  if (w) res.files.push_back(w->finish());
  return res;
}

struct FileMeta { uint64_t id; std::string min_key, max_key; uint64_t bytes; };

/** @id CODE-CMP-003 @implements REQ-CMP-010 */
inline bool overlaps(const std::string& amin, const std::string& amax, const std::string& bmin, const std::string& bmax) {
  return amin <= bmax && bmin <= amax;
}
inline std::vector<FileMeta> pick_overlapping(const std::vector<FileMeta>& files, const std::string& lo, const std::string& hi) {
  std::vector<FileMeta> out;
  for (auto& f : files)
    if (overlaps(f.min_key, f.max_key, lo, hi)) out.push_back(f);
  return out;
}

struct LevelConfig { size_t l0_trigger = 4; uint64_t base_bytes = 10u << 20; uint64_t multiplier = 10; };

/** @id CODE-CMP-004 @implements REQ-CMP-011 */
inline int pick_compaction_level(const std::vector<uint64_t>& level_bytes, size_t l0_files, const LevelConfig& cfg) {
  int best = -1;
  double best_score = 1.0;
  double capacity = static_cast<double>(cfg.base_bytes);
  for (size_t lvl = 0; lvl + 1 < level_bytes.size(); ++lvl) {
    double score;
    if (lvl == 0) {
      score = static_cast<double>(l0_files) / static_cast<double>(cfg.l0_trigger);
    } else {
      score = static_cast<double>(level_bytes[lvl]) / capacity;
      capacity *= static_cast<double>(cfg.multiplier);
    }
    if (score >= best_score && (best < 0 || score > best_score)) { best = static_cast<int>(lvl); best_score = score; }
  }
  return best;
}
}  // namespace lsm
