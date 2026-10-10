#pragma once
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>
#include "lsm/compaction.hpp"
#include "lsm/memtable.hpp"
#include "lsm/raii.hpp"
#include "lsm/sstable.hpp"

namespace lsm {

struct DbOptions {
  size_t memtable_bytes = 4096, l0_trigger = 4, block_size = 256, target_file_size = 2048;
  LevelConfig levels;
  int max_levels = 4;
  uint64_t seed = 1;
};

class Db;

/** @id CODE-DB-002 @implements REQ-DB-003 */
// RAII registration of a read sequence with its Db; move-only.
class Snapshot {
 public:
  Snapshot(Snapshot&& o) noexcept : db_(o.db_), seq_(o.seq_) { o.db_ = nullptr; }
  Snapshot& operator=(Snapshot&& o) noexcept {
    if (this != &o) {
      release();
      db_ = o.db_;
      seq_ = o.seq_;
      o.db_ = nullptr;
    }
    return *this;
  }
  Snapshot(const Snapshot&) = delete;
  Snapshot& operator=(const Snapshot&) = delete;
  ~Snapshot() { release(); }
  uint64_t seq() const { return seq_; }
  const Db* owner() const { return db_; }

 private:
  friend class Db;
  Snapshot(Db* db, uint64_t seq) : db_(db), seq_(seq) {}
  inline void release();
  Db* db_;
  uint64_t seq_;
};

class WriteBatch {
 public:
  void put(const std::string& k, const std::string& v) { ops_.push_back({k, v, ValueType::Put}); }
  void del(const std::string& k) { ops_.push_back({k, std::string(), ValueType::Delete}); }
  struct Op { std::string key, value; ValueType type; };
  const std::vector<Op>& ops() const { return ops_; }
 private:
  std::vector<Op> ops_;
};

inline SstReader load_sstable_file(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) throw std::runtime_error("cannot open " + path);
  std::string data((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  return SstReader(std::move(data));
}

/** @id CODE-DB-003 @implements REQ-DB-001 REQ-DB-002 REQ-DB-004 REQ-DB-005 REQ-DB-006 REQ-DB-007 REQ-DB-008 REQ-DB-009 REQ-DB-010 REQ-DB-012 REQ-DB-013 */
class Db {
  struct File {
    File(uint64_t i, std::string d) : id(i), data(std::move(d)), reader(data) {}
    uint64_t id;
    std::string data;
    SstReader reader;
    const std::string& min_key() const { return reader.min_key(); }
    const std::string& max_key() const { return reader.max_key(); }
  };
  using FilePtr = std::shared_ptr<File>;

 public:
  static constexpr size_t kMaxKey = 1024;

  /** @id CODE-DB-004 @implements REQ-DB-014 REQ-DB-015 */
  explicit Db(DbOptions opt = {}) : opt_(opt), mem_(std::make_unique<MemTable>(opt.seed)), levels_(static_cast<size_t>(std::max(opt.max_levels, 2))) {
    opt_.levels.l0_trigger = opt_.l0_trigger;
  }
  Db(const Db&) = delete;
  Db& operator=(const Db&) = delete;

  void put(const std::string& k, const std::string& v) { WriteBatch b; b.put(k, v); write(b); }
  void del(const std::string& k) { WriteBatch b; b.del(k); write(b); }

  void write(const WriteBatch& batch) {
    for (auto& op : batch.ops())
      if (op.key.size() > kMaxKey) throw std::invalid_argument("key too long");
    for (auto& op : batch.ops()) {
      if (op.type == ValueType::Put) mem_->put(op.key, op.value, ++seq_);
      else mem_->del(op.key, ++seq_);
    }
    if (mem_->approximate_bytes() >= opt_.memtable_bytes) flush();
  }

  std::optional<std::string> get(const std::string& key) const { return get_at(key, UINT64_MAX); }
  std::optional<std::string> get(const std::string& key, const Snapshot& s) const {
    check_owner(s);
    return get_at(key, s.seq());
  }

  Snapshot snapshot() {
    snaps_.insert(seq_);
    return Snapshot(this, seq_);
  }

  std::vector<std::pair<std::string, std::string>> scan(const std::string& lo, const std::string& hi, const Snapshot* snap = nullptr) const {
    if (snap) check_owner(*snap);
    const uint64_t at = snap ? snap->seq() : UINT64_MAX;
    std::vector<std::vector<Entry>> sources;
    std::vector<Entry> m;
    for (const Entry& e : mem_->entries())
      if (e.key >= lo && e.key < hi && e.seq <= at) m.push_back(e);
    sources.push_back(std::move(m));
    for (auto& level : levels_)
      for (auto& f : level) {
        if (f->max_key() < lo || f->min_key() >= hi) continue;
        std::vector<Entry> v;
        for (SstIterator it = f->reader.seek(lo); it.valid() && it.entry().key < hi; it.next())
          if (it.entry().seq <= at) v.push_back(it.entry());
        sources.push_back(std::move(v));
      }
    std::vector<VectorCursor> cs;
    for (auto& s : sources) cs.emplace_back(s);
    std::vector<std::pair<std::string, std::string>> out;
    std::string last;
    bool have = false;
    for (MergeIterator<VectorCursor> it(std::move(cs)); it.valid(); it.next()) {
      const Entry& e = it.entry();
      if (have && e.key == last) continue;
      have = true;
      last = e.key;
      if (e.type == ValueType::Put) out.emplace_back(e.key, e.value);
    }
    return out;
  }

  void flush() {
    if (mem_->entry_count() == 0) return;
    mem_->freeze();
    levels_[0].insert(levels_[0].begin(), std::make_shared<File>(next_id_++, write_sstable(*mem_, opt_.block_size)));
    mem_ = std::make_unique<MemTable>(opt_.seed);
    maybe_compact();
  }

  void compact_all() {
    flush();
    for (size_t l = 0; l + 1 < levels_.size(); ++l)
      while (!levels_[l].empty()) compact_level(l);
    auto& last = levels_.back();
    if (last.empty()) return;
    std::vector<FilePtr> inputs = last;
    std::vector<SstIterator> cs;
    for (auto& f : inputs) cs.push_back(f->reader.seek(""));
    CompactionOptions co = compaction_options(true);
    CompactionResult r = compact(std::move(cs), co);
    last.clear();
    for (auto& d : r.files) last.push_back(std::make_shared<File>(next_id_++, std::move(d)));
  }

  uint64_t last_seq() const { return seq_; }
  uint64_t oldest_snapshot() const { return snaps_.empty() ? seq_ : *snaps_.begin(); }
  size_t live_snapshots() const { return snaps_.size(); }
  size_t memtable_entries() const { return mem_->entry_count(); }
  size_t level_file_count(int l) const { return in_range(l) ? levels_[static_cast<size_t>(l)].size() : 0; }
  std::vector<uint64_t> level_file_ids(int l) const {
    std::vector<uint64_t> v;
    if (in_range(l)) for (auto& f : levels_[static_cast<size_t>(l)]) v.push_back(f->id);
    return v;
  }
  std::vector<uint64_t> level_file_sizes(int l) const {
    std::vector<uint64_t> v;
    if (in_range(l)) for (auto& f : levels_[static_cast<size_t>(l)]) v.push_back(f->data.size());
    return v;
  }
  uint64_t level_bytes(int l) const {
    uint64_t s = 0;
    for (uint64_t x : level_file_sizes(l)) s += x;
    return s;
  }
  uint64_t level_entries(int l) const {
    uint64_t s = 0;
    if (in_range(l)) for (auto& f : levels_[static_cast<size_t>(l)]) s += f->reader.entry_count();
    return s;
  }
  uint64_t total_entries() const {
    uint64_t s = 0;
    for (size_t l = 0; l < levels_.size(); ++l) s += level_entries(static_cast<int>(l));
    return s;
  }

  bool check_invariants() const {
    for (size_t i = 1; i < levels_[0].size(); ++i)
      if (levels_[0][i - 1]->id <= levels_[0][i]->id) return false;
    for (size_t l = 1; l < levels_.size(); ++l)
      for (size_t i = 0; i < levels_[l].size(); ++i) {
        if (levels_[l][i]->min_key() > levels_[l][i]->max_key()) return false;
        if (i > 0 && !(levels_[l][i - 1]->max_key() < levels_[l][i]->min_key())) return false;
      }
    return mem_->check_invariants();
  }

  size_t save(const std::string& dir) const {
    std::filesystem::create_directories(dir);
    size_t n = 0;
    for (size_t l = 0; l < levels_.size(); ++l)
      for (auto& f : levels_[l]) {
        ScopedFile out(dir + "/L" + std::to_string(l) + "-" + std::to_string(f->id) + ".sst");
        out.write(f->data);
        out.commit();
        ++n;
      }
    return n;
  }

 private:
  friend class Snapshot;
  void check_owner(const Snapshot& s) const {
    if (s.owner() != this) throw std::invalid_argument("snapshot does not belong to this Db");
  }
  bool in_range(int l) const { return l >= 0 && static_cast<size_t>(l) < levels_.size(); }
  void release_snapshot(uint64_t seq) { snaps_.erase(snaps_.find(seq)); }

  CompactionOptions compaction_options(bool bottommost) const {
    CompactionOptions co;
    co.oldest_snapshot = oldest_snapshot();
    co.bottommost = bottommost;
    co.block_size = opt_.block_size;
    co.target_file_size = opt_.target_file_size;
    return co;
  }

  std::optional<std::string> get_at(const std::string& key, uint64_t at) const {
    auto fold = [](const LookupResult& r) -> std::optional<std::optional<std::string>> {
      if (r.state == LookupState::Found) return std::optional<std::string>(r.value);
      if (r.state == LookupState::Deleted) return std::optional<std::string>();
      return std::nullopt;
    };
    if (auto r = fold(mem_->get(key, at))) return *r;
    for (size_t l = 0; l < levels_.size(); ++l)
      for (auto& f : levels_[l]) {
        if (key < f->min_key() || key > f->max_key()) continue;
        if (auto r = fold(f->reader.get(key, at))) return *r;
      }
    return std::nullopt;
  }

  void maybe_compact() {
    for (int guard = 0; guard < 10000; ++guard) {
      std::vector<uint64_t> bytes;
      for (size_t l = 0; l < levels_.size(); ++l) bytes.push_back(level_bytes(static_cast<int>(l)));
      int lvl = pick_compaction_level(bytes, levels_[0].size(), opt_.levels);
      if (lvl < 0) return;
      compact_level(static_cast<size_t>(lvl));
    }
  }

  void compact_level(size_t lvl) {
    std::vector<FilePtr> upper = lvl == 0 ? levels_[0] : std::vector<FilePtr>{levels_[lvl].front()};
    std::string lo = upper.front()->min_key(), hi = upper.front()->max_key();
    for (auto& f : upper) { lo = std::min(lo, f->min_key()); hi = std::max(hi, f->max_key()); }
    std::vector<FilePtr> lower;
    for (auto& f : levels_[lvl + 1])
      if (overlaps(f->min_key(), f->max_key(), lo, hi)) lower.push_back(f);
    for (auto& f : lower) { lo = std::min(lo, f->min_key()); hi = std::max(hi, f->max_key()); }
    bool bottommost = true;
    for (size_t d = lvl + 2; d < levels_.size() && bottommost; ++d)
      for (auto& f : levels_[d])
        if (overlaps(f->min_key(), f->max_key(), lo, hi)) { bottommost = false; break; }
    std::vector<SstIterator> cs;
    for (auto& f : upper) cs.push_back(f->reader.seek(""));
    for (auto& f : lower) cs.push_back(f->reader.seek(""));
    CompactionResult r = compact(std::move(cs), compaction_options(bottommost));
    auto drop = [](std::vector<FilePtr>& v, const std::vector<FilePtr>& gone) {
      v.erase(std::remove_if(v.begin(), v.end(), [&](const FilePtr& f) { return std::find(gone.begin(), gone.end(), f) != gone.end(); }), v.end());
    };
    drop(levels_[lvl], upper);
    drop(levels_[lvl + 1], lower);
    for (auto& d : r.files) levels_[lvl + 1].push_back(std::make_shared<File>(next_id_++, std::move(d)));
    std::sort(levels_[lvl + 1].begin(), levels_[lvl + 1].end(), [](const FilePtr& a, const FilePtr& b) { return a->min_key() < b->min_key(); });
  }

  DbOptions opt_;
  std::unique_ptr<MemTable> mem_;
  std::vector<std::vector<FilePtr>> levels_;
  uint64_t seq_ = 0, next_id_ = 1;
  std::multiset<uint64_t> snaps_;
};

inline void Snapshot::release() {
  if (db_) { db_->release_snapshot(seq_); db_ = nullptr; }
}
}  // namespace lsm
