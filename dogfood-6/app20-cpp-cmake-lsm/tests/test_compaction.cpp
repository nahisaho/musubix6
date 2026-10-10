#include "harness.hpp"
#include "lsm/compaction.hpp"
#include <algorithm>
#include <map>
#include <string>
#include <vector>

using namespace lsm;

static Entry P(const std::string& k, uint64_t s, const std::string& v = "v") { return Entry{k, s, ValueType::Put, v}; }
static Entry D(const std::string& k, uint64_t s) { return Entry{k, s, ValueType::Delete, ""}; }
using Vec = std::vector<Entry>;
static std::vector<VectorCursor> cursors(const std::vector<Vec>& srcs) {
  std::vector<VectorCursor> cs;
  for (auto& s : srcs) cs.emplace_back(s);
  return cs;
}
static Vec drain(MergeIterator<VectorCursor>& it) {
  Vec out;
  for (; it.valid(); it.next()) out.push_back(it.entry());
  return out;
}
static Vec read_all(const CompactionResult& r) {
  Vec out;
  for (auto& f : r.files) { SstReader rd(f); auto es = rd.all_entries(); out.insert(out.end(), es.begin(), es.end()); }
  return out;
}
static Vec run(const std::vector<Vec>& srcs, uint64_t snap, bool bottom, CompactionResult* res = nullptr) {
  CompactionOptions o;
  o.oldest_snapshot = snap;
  o.bottommost = bottom;
  o.block_size = 64;
  CompactionResult r = compact(cursors(srcs), o);
  if (res) *res = r;
  return read_all(r);
}

/** @id TEST-CMP-001 @verifies REQ-CMP-001 */
TEST(test_cmp_001_merge_order) {
  std::vector<Vec> src = {{P("b", 9), P("d", 8)}, {P("a", 5), P("b", 4), P("c", 3)}, {P("a", 1), P("e", 2)}};
  MergeIterator<VectorCursor> it(cursors(src));
  Vec got = drain(it);
  CHECK_EQ(got.size(), 7u);
  for (size_t i = 1; i < got.size(); ++i) CHECK(entry_less(got[i - 1], got[i]));
  CHECK_EQ(got[0].key, std::string("a"));
  CHECK_EQ(got[0].seq, 5u);
  CHECK_EQ(got[1].seq, 1u);
}

/** @id TEST-CMP-002 @verifies REQ-CMP-002 */
TEST(test_cmp_002_empty_sources) {
  std::vector<Vec> none_src, empty_src = {Vec{}, Vec{}}, mixed_src = {Vec{}, Vec{P("a", 1)}, Vec{}, Vec{P("b", 2)}};
  MergeIterator<VectorCursor> none(cursors(none_src));
  CHECK(!none.valid());
  MergeIterator<VectorCursor> empties(cursors(empty_src));
  CHECK(!empties.valid());
  MergeIterator<VectorCursor> mixed(cursors(mixed_src));
  Vec got = drain(mixed);
  CHECK_EQ(got.size(), 2u);
  CHECK_EQ(got[1].key, std::string("b"));
}

/** @id TEST-CMP-003 @verifies REQ-CMP-003 */
TEST(test_cmp_003_duplicates) {
  std::vector<Vec> src = {{P("a", 5, "newest"), P("b", 7, "x")}, {P("a", 5, "stale-copy")}, {P("a", 5, "older-copy"), P("a", 2)}};
  MergeIterator<VectorCursor> it(cursors(src));
  Vec got = drain(it);
  CHECK_EQ(got.size(), 3u);
  CHECK_EQ(got[0].value, std::string("newest"));
  CHECK_EQ(got[1].seq, 2u);
  CHECK_EQ(got[2].key, std::string("b"));
}

/** @id TEST-CMP-004 @verifies REQ-CMP-004 */
TEST(test_cmp_004_version_gc) {
  Vec in = {P("a", 30, "a30"), P("a", 20, "a20"), P("a", 10, "a10"), P("a", 5, "a5"), P("b", 3, "b3"), P("b", 2, "b2")};
  Vec out = run({in}, 15, false);
  // a: 30, 20 (> 15) and 10 (newest <= 15); a5 dropped. b: b3 only.
  CHECK_EQ(out.size(), 4u);
  CHECK_EQ(out[0].seq, 30u);
  CHECK_EQ(out[2].seq, 10u);
  CHECK_EQ(out[3].key, std::string("b"));
  CHECK_EQ(out[3].seq, 3u);
  // snapshot below every version keeps everything
  CHECK_EQ(run({in}, 1, false).size(), 6u);
  // snapshot above every version keeps only the newest per key
  CHECK_EQ(run({in}, 1000, false).size(), 2u);
}

/** @id TEST-CMP-005 @verifies REQ-CMP-005 */
TEST(test_cmp_005_tombstone_elision) {
  Vec in = {D("a", 9), P("a", 4, "old"), P("b", 8, "b8"), D("b", 6), P("b", 2), D("c", 20), P("c", 1)};
  Vec out = run({in}, 10, true);
  // a: tombstone@9 is newest <=10 -> dropped with everything beneath; b: b8 (>10? no, 8<=10 newest) kept, rest dropped;
  // c: tombstone@20 > 10 is kept, and the base put@1 is kept for snapshots in [10,20)
  CHECK_EQ(out.size(), 3u);
  CHECK_EQ(out[0].key, std::string("b"));
  CHECK_EQ(out[0].seq, 8u);
  CHECK_EQ(out[1].key, std::string("c"));
  CHECK(out[1].type == ValueType::Delete);
  CHECK_EQ(out[2].seq, 1u);
}

/** @id TEST-CMP-006 @verifies REQ-CMP-006 */
TEST(test_cmp_006_tombstones_kept_above_bottom) {
  Vec in = {D("a", 9), P("a", 4, "old"), P("b", 3)};
  Vec out = run({in}, 10, false);
  CHECK_EQ(out.size(), 2u);
  CHECK(out[0].type == ValueType::Delete);
  CHECK_EQ(out[1].key, std::string("b"));
}

/** @id TEST-CMP-007 @verifies REQ-CMP-007 */
TEST(test_cmp_007_output_valid) {
  Vec a, b;
  for (int i = 0; i < 100; ++i) {
    std::string k = "k" + std::to_string(1000 + i);
    a.push_back(P(k, 200 + i, "new" + std::to_string(i)));
    b.push_back(P(k, 100 + i, "old" + std::to_string(i)));
  }
  CompactionResult r;
  Vec out = run({a, b}, 0, false, &r);
  CHECK(!r.files.empty());
  for (size_t i = 1; i < out.size(); ++i) CHECK(entry_less(out[i - 1], out[i]));
  Vec expect;
  for (int i = 0; i < 100; ++i) { expect.push_back(a[i]); expect.push_back(b[i]); }
  CHECK_EQ(out.size(), expect.size());
  for (size_t i = 0; i < out.size(); ++i) { CHECK_EQ(out[i].key, expect[i].key); CHECK_EQ(out[i].seq, expect[i].seq); }
}

/** @id TEST-CMP-008 @verifies REQ-CMP-008 */
TEST(test_cmp_008_snapshot_equivalence) {
  uint64_t x = 99;
  auto rnd = [&]() { x = x * 6364136223846793005ull + 1442695040888963407ull; return x >> 33; };
  for (int round = 0; round < 25; ++round) {
    std::vector<Vec> srcs(3);
    uint64_t seq = 0;
    for (int i = 0; i < 90; ++i) {
      std::string k = "k" + std::to_string(rnd() % 12);
      ++seq;
      Entry e = rnd() % 3 == 0 ? D(k, seq) : P(k, seq, "v" + std::to_string(seq));
      srcs[2 - (i * 3) / 90].push_back(e);  // newest seqs live in source 0
    }
    for (auto& s : srcs) std::sort(s.begin(), s.end(), entry_less);
    auto view = [&](const std::string& key, uint64_t snap) {
      const Entry* best = nullptr;
      for (auto& s : srcs) for (auto& e : s) if (e.key == key && e.seq <= snap && (!best || e.seq > best->seq)) best = &e;
      if (!best) return LookupResult{};
      return best->type == ValueType::Delete ? LookupResult{LookupState::Deleted, ""} : LookupResult{LookupState::Found, best->value};
    };
    uint64_t oldest = rnd() % 95;
    for (bool bottom : {false, true}) {
      CompactionOptions o;
      o.oldest_snapshot = oldest; o.bottommost = bottom; o.block_size = 48; o.target_file_size = 150;
      CompactionResult r = compact(cursors(srcs), o);
      std::vector<SstReader> readers;
      for (auto& f : r.files) readers.emplace_back(f);
      for (int ki = 0; ki < 14; ++ki) {
        std::string key = "k" + std::to_string(ki);
        for (uint64_t snap = oldest; snap <= seq + 1; ++snap) {
          LookupResult want = view(key, snap), got;
          for (auto& rd : readers) { got = rd.get(key, snap); if (got.state != LookupState::NotFound) break; }
          bool both_absent = bottom && want.state != LookupState::Found && got.state != LookupState::Found;
          if (!both_absent) { CHECK(want.state == got.state); CHECK_EQ(want.value, got.value); }
        }
      }
    }
  }
}

/** @id TEST-CMP-009 @verifies REQ-CMP-009 */
TEST(test_cmp_009_stats) {
  Vec in = {D("a", 9), P("a", 4), P("a", 3), P("b", 8), P("b", 2), P("c", 12)};
  Vec dup = {P("c", 12)};
  CompactionResult r;
  run({in, dup}, 10, true, &r);
  CHECK_EQ(r.stats.input_entries, 6u);
  CHECK_EQ(r.stats.output_entries, 2u);  // b@8, c@12
  CHECK_EQ(r.stats.dropped_tombstones, 1u);
  CHECK_EQ(r.stats.dropped_versions, 3u);
  CHECK_EQ(r.stats.input_entries, r.stats.output_entries + r.stats.dropped_versions + r.stats.dropped_tombstones);
}

/** @id TEST-CMP-010 @verifies REQ-CMP-010 */
TEST(test_cmp_010_overlap) {
  CHECK(overlaps("a", "c", "c", "d"));
  CHECK(overlaps("c", "d", "a", "c"));
  CHECK(!overlaps("a", "b", "c", "d"));
  CHECK(overlaps("a", "z", "m", "n"));
  CHECK(overlaps("m", "n", "a", "z"));
  CHECK(!overlaps("c", "d", "a", "b"));
  std::vector<FileMeta> files = {{1, "a", "c", 10}, {2, "d", "f", 10}, {3, "g", "k", 10}, {4, "k", "z", 10}};
  auto got = pick_overlapping(files, "f", "g");
  CHECK_EQ(got.size(), 2u);
  CHECK_EQ(got[0].id, 2u);
  CHECK_EQ(got[1].id, 3u);
  CHECK(pick_overlapping(files, "0", "9").empty());
  CHECK_EQ(pick_overlapping(files, "k", "k").size(), 2u);
}

/** @id TEST-CMP-011 @verifies REQ-CMP-011 */
TEST(test_cmp_011_level_picker) {
  LevelConfig cfg;
  cfg.l0_trigger = 4; cfg.base_bytes = 1000; cfg.multiplier = 10;
  CHECK_EQ(pick_compaction_level({0, 0, 0, 0}, 3, cfg), -1);
  CHECK_EQ(pick_compaction_level({0, 0, 0, 0}, 4, cfg), 0);
  CHECK_EQ(pick_compaction_level({0, 999, 0, 0}, 0, cfg), -1);
  CHECK_EQ(pick_compaction_level({0, 1000, 0, 0}, 0, cfg), 1);
  CHECK_EQ(pick_compaction_level({0, 500, 25000, 0}, 0, cfg), 2);
  CHECK_EQ(pick_compaction_level({0, 5000, 10000, 0}, 4, cfg), 1);  // score 5.0 beats L0 1.0 and L2 1.0
  CHECK_EQ(pick_compaction_level({0, 1000, 10000, 0}, 4, cfg), 0);  // tie -> lowest level
  CHECK_EQ(pick_compaction_level({0, 0, 0, 999999999}, 0, cfg), -1);  // last level never picked
}

/** @id TEST-CMP-012 @verifies REQ-CMP-012 */
TEST(test_cmp_012_split_at_key_boundary) {
  Vec in;
  for (int k = 0; k < 20; ++k)
    for (int v = 5; v >= 1; --v) in.push_back(P("key" + std::string(k < 10 ? "0" : "") + std::to_string(k), 100 + v + 10 * k, std::string(30, 'x')));
  CompactionOptions o;
  o.oldest_snapshot = 0; o.bottommost = false; o.block_size = 64; o.target_file_size = 300;
  CompactionResult r = compact(cursors({in}), o);
  CHECK(r.files.size() > 3u);
  std::string prev_max;
  size_t total = 0;
  for (auto& f : r.files) {
    SstReader rd(f);
    total += rd.entry_count();
    CHECK(prev_max.empty() || prev_max < rd.min_key());
    prev_max = rd.max_key();
  }
  CHECK_EQ(total, in.size());
}
