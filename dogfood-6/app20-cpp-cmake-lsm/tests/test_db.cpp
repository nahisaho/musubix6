#include "harness.hpp"
#include "lsm/db.hpp"
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

using namespace lsm;
namespace fs = std::filesystem;

static DbOptions small_opts() {
  DbOptions o;
  o.memtable_bytes = 200;
  o.l0_trigger = 3;
  o.block_size = 64;
  o.target_file_size = 300;
  o.levels.base_bytes = 1500;
  o.levels.l0_trigger = 3;
  o.max_levels = 4;
  return o;
}
static DbOptions no_flush_opts() {
  DbOptions o = small_opts();
  o.memtable_bytes = 1 << 30;
  return o;
}
static std::string kk(int i) { std::string s = std::to_string(i); return "key" + std::string(4 - s.size(), '0') + s; }
static std::string fresh_dir(const char* name) {
  fs::remove_all(name);
  return name;
}

/** @id TEST-DB-001 @verifies REQ-DB-001 */
TEST(test_db_001_basic_crud) {
  Db db(no_flush_opts());
  CHECK(!db.get("a").has_value());
  db.put("a", "1");
  db.put("b", "2");
  CHECK_EQ(*db.get("a"), std::string("1"));
  db.put("a", "3");
  CHECK_EQ(*db.get("a"), std::string("3"));
  db.del("a");
  CHECK(!db.get("a").has_value());
  CHECK_EQ(*db.get("b"), std::string("2"));
  db.del("never");
  CHECK(!db.get("never").has_value());
  db.put("a", "4");
  CHECK_EQ(*db.get("a"), std::string("4"));
}

/** @id TEST-DB-002 @verifies REQ-DB-002 */
TEST(test_db_002_sequence_numbers) {
  Db db(no_flush_opts());
  CHECK_EQ(db.last_seq(), 0u);
  db.put("a", "1");
  CHECK_EQ(db.last_seq(), 1u);
  db.del("a");
  CHECK_EQ(db.last_seq(), 2u);
  WriteBatch b;
  b.put("x", "1");
  b.put("y", "2");
  b.del("x");
  db.write(b);
  CHECK_EQ(db.last_seq(), 5u);
  CHECK(!db.get("x").has_value());
  CHECK_EQ(*db.get("y"), std::string("2"));
  WriteBatch empty;
  db.write(empty);
  CHECK_EQ(db.last_seq(), 5u);
}

/** @id TEST-DB-003 @verifies REQ-DB-003 */
TEST(test_db_003_snapshot_raii) {
  Db db(no_flush_opts());
  db.put("a", "1");
  CHECK_EQ(db.live_snapshots(), 0u);
  CHECK_EQ(db.oldest_snapshot(), 1u);
  {
    Snapshot s1 = db.snapshot();
    db.put("b", "2");
    db.put("c", "3");
    CHECK_EQ(db.live_snapshots(), 1u);
    CHECK_EQ(s1.seq(), 1u);
    CHECK_EQ(db.oldest_snapshot(), 1u);
    {
      Snapshot s2 = db.snapshot();
      CHECK_EQ(s2.seq(), 3u);
      Snapshot s3 = std::move(s2);
      CHECK_EQ(db.live_snapshots(), 2u);
      CHECK_EQ(s3.seq(), 3u);
      Snapshot s4(std::move(s3));
      CHECK_EQ(db.live_snapshots(), 2u);
      s4 = std::move(s1);
      CHECK_EQ(db.live_snapshots(), 1u);
      CHECK_EQ(db.oldest_snapshot(), 1u);
    }
    CHECK_EQ(db.live_snapshots(), 0u);
    CHECK_EQ(db.oldest_snapshot(), 3u);
  }
  CHECK_EQ(db.live_snapshots(), 0u);
  CHECK_EQ(db.oldest_snapshot(), db.last_seq());
}

/** @id TEST-DB-004 @verifies REQ-DB-004 */
TEST(test_db_004_flush_to_l0) {
  DbOptions o = small_opts();
  o.memtable_bytes = 100;
  o.l0_trigger = 100;
  o.levels.l0_trigger = 100;
  Db db(o);
  db.put("a", "x");
  CHECK_EQ(db.level_file_count(0), 0u);
  CHECK_EQ(db.memtable_entries(), 1u);
  db.put("b", std::string(80, 'y'));
  CHECK_EQ(db.level_file_count(0), 1u);
  CHECK_EQ(db.memtable_entries(), 0u);
  db.put("c", std::string(100, 'z'));
  CHECK_EQ(db.level_file_count(0), 2u);
  auto ids = db.level_file_ids(0);
  CHECK(ids[0] > ids[1]);
  db.flush();
  CHECK_EQ(db.level_file_count(0), 2u);
  CHECK_EQ(*db.get("a"), std::string("x"));
  CHECK_EQ(db.get("c")->size(), 100u);
}

/** @id TEST-DB-005 @verifies REQ-DB-005 */
TEST(test_db_005_read_precedence) {
  DbOptions o = small_opts();
  o.memtable_bytes = 1 << 30;
  o.l0_trigger = 2;
  o.levels.l0_trigger = 2;
  Db db(o);
  db.put("x", "old");
  db.flush();
  db.put("y", "other");
  db.flush();  // second L0 file -> compaction into L1
  CHECK_EQ(db.level_file_count(0), 0u);
  CHECK(db.level_file_count(1) > 0u);
  db.del("x");
  db.flush();
  CHECK_EQ(db.level_file_count(0), 1u);
  CHECK(!db.get("x").has_value());
  CHECK_EQ(*db.get("y"), std::string("other"));
  db.put("x", "newest");
  CHECK_EQ(*db.get("x"), std::string("newest"));
  db.del("x");
  db.put("z", "1");
  db.flush();
  CHECK(!db.get("x").has_value());
  CHECK_EQ(*db.get("z"), std::string("1"));
}

/** @id TEST-DB-006 @verifies REQ-DB-006 */
TEST(test_db_006_leveled_compaction) {
  Db db(small_opts());
  for (int round = 0; round < 3; ++round)
    for (int i = 0; i < 60; ++i) db.put(kk((i * 7 + round * 13) % 60), "round" + std::to_string(round) + "-" + std::to_string(i));
  CHECK(db.check_invariants());
  CHECK(db.level_file_count(0) < 3u);
  CHECK(db.level_file_count(1) + db.level_file_count(2) > 0u);
  for (int i = 0; i < 60; ++i) CHECK(db.get(kk(i)).has_value());
  db.flush();
  CHECK(db.check_invariants());
  size_t deep = 0;
  for (int l = 2; l < 4; ++l) deep += db.level_file_count(l);
  CHECK(deep > 0u);  // capacity pressure pushed data below L1
}

/** @id TEST-DB-007 @verifies REQ-DB-007 */
TEST(test_db_007_snapshot_isolation) {
  Db db(small_opts());
  db.put("k", "v1");
  db.put("gone", "still-here");
  Snapshot snap = db.snapshot();
  db.put("k", "v2");
  db.del("gone");
  for (int i = 0; i < 120; ++i) db.put(kk(i % 40), "churn" + std::to_string(i));
  db.flush();
  CHECK(db.level_file_count(1) + db.level_file_count(2) > 0u);
  CHECK_EQ(*db.get("k", snap), std::string("v1"));
  CHECK_EQ(*db.get("gone", snap), std::string("still-here"));
  CHECK_EQ(*db.get("k"), std::string("v2"));
  CHECK(!db.get("gone").has_value());
  CHECK(!db.get(kk(3), snap).has_value());
}

/** @id TEST-DB-008 @verifies REQ-DB-008 */
TEST(test_db_008_gc_after_snapshot_release) {
  Db db(small_opts());
  for (int i = 0; i < 10; ++i) db.put(kk(i), "val" + std::to_string(i));
  {
    Snapshot snap = db.snapshot();
    for (int i = 0; i < 10; ++i) db.del(kk(i));
    db.compact_all();
    CHECK(db.total_entries() >= 20u);
    CHECK_EQ(*db.get(kk(4), snap), std::string("val4"));
    CHECK(!db.get(kk(4)).has_value());
  }
  db.compact_all();
  CHECK_EQ(db.total_entries(), 0u);
  CHECK(!db.get(kk(4)).has_value());
  db.put("live", "1");
  db.put("live", "2");
  db.compact_all();
  CHECK_EQ(db.total_entries(), 1u);
  CHECK_EQ(*db.get("live"), std::string("2"));
}

/** @id TEST-DB-009 @verifies REQ-DB-009 */
TEST(test_db_009_scan) {
  Db db(small_opts());
  for (int i = 0; i < 50; ++i) db.put(kk(i), "v" + std::to_string(i));
  for (int i = 0; i < 50; i += 5) db.del(kk(i));
  db.put(kk(7), "seven-new");
  Snapshot snap = db.snapshot();
  db.put(kk(8), "after-snap");
  auto r = db.scan(kk(5), kk(12));
  // 5 deleted, 6, 7(new), 8(after-snap), 9, 10 deleted, 11
  CHECK_EQ(r.size(), 5u);
  CHECK_EQ(r[0].first, kk(6));
  CHECK_EQ(r[1].second, std::string("seven-new"));
  CHECK_EQ(r[2].second, std::string("after-snap"));
  CHECK_EQ(r.back().first, kk(11));
  auto rs = db.scan(kk(5), kk(12), &snap);
  CHECK_EQ(rs[2].second, std::string("v8"));
  CHECK(db.scan(kk(40), kk(40)).empty());
  CHECK(db.scan("zzz", "zzzz").empty());
  CHECK_EQ(db.scan("", "~").size(), 40u);
}

/** @id TEST-DB-010 @verifies REQ-DB-010 */
TEST(test_db_010_atomic_batch) {
  Db db(no_flush_opts());
  db.put("keep", "1");
  uint64_t before = db.last_seq();
  WriteBatch b;
  b.put("first", "x");
  b.del("keep");
  b.put(std::string(2000, 'k'), "too long");
  bool inv = false;
  try { db.write(b); } catch (const std::invalid_argument&) { inv = true; }
  CHECK(inv);
  CHECK_EQ(db.last_seq(), before);
  CHECK(!db.get("first").has_value());
  CHECK_EQ(*db.get("keep"), std::string("1"));
  WriteBatch ok;
  ok.put(std::string(1024, 'k'), "max-length");
  db.write(ok);
  CHECK_EQ(db.last_seq(), before + 1);
}

/** @id TEST-DB-011 @verifies REQ-DB-011 */
TEST(test_db_011_scoped_file) {
  std::string dir = fresh_dir("lsm_t011");
  fs::create_directories(dir);
  std::string path = dir + "/out.bin";
  {
    ScopedFile f(path);
    f.write("hello");
    CHECK(fs::exists(path + ".tmp"));
    CHECK(!fs::exists(path));
    f.commit();
    CHECK(fs::exists(path));
    CHECK(!fs::exists(path + ".tmp"));
  }
  CHECK(fs::exists(path));
  std::string p2 = dir + "/dropped.bin";
  {
    ScopedFile f(p2);
    f.write("partial");
    CHECK(fs::exists(p2 + ".tmp"));
  }
  CHECK(!fs::exists(p2 + ".tmp"));
  CHECK(!fs::exists(p2));
  std::string p3 = dir + "/moved.bin";
  {
    ScopedFile a(p3);
    a.write("abc");
    ScopedFile b(std::move(a));
    b.write("def");
    b.commit();
  }
  std::ifstream in(p3, std::ios::binary);
  std::string content((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  CHECK_EQ(content, std::string("abcdef"));
  CHECK(!fs::exists(p3 + ".tmp"));
  fs::remove_all(dir);
}

/** @id TEST-DB-012 @verifies REQ-DB-012 */
TEST(test_db_012_save) {
  std::string dir = fresh_dir("lsm_t012");
  Db db(small_opts());
  for (int i = 0; i < 80; ++i) db.put(kk(i % 50), "v" + std::to_string(i));
  size_t files = db.level_file_count(0) + db.level_file_count(1) + db.level_file_count(2) + db.level_file_count(3);
  CHECK(files > 0u);
  CHECK_EQ(db.save(dir), files);
  size_t sst = 0, tmp = 0;
  for (auto& e : fs::directory_iterator(dir)) {
    std::string n = e.path().filename().string();
    if (n.size() > 4 && n.substr(n.size() - 4) == ".tmp") ++tmp;
    if (n.size() > 4 && n.substr(n.size() - 4) == ".sst") {
      ++sst;
      SstReader r = load_sstable_file(e.path().string());
      CHECK(r.entry_count() > 0u);
      CHECK(n[0] == 'L');
    }
  }
  CHECK_EQ(sst, files);
  CHECK_EQ(tmp, 0u);
  fs::remove_all(dir);
}

/** @id TEST-DB-013 @verifies REQ-DB-013 */
TEST(test_db_013_stats) {
  Db db(small_opts());
  for (int i = 0; i < 100; ++i) db.put(kk(i % 45), std::string(10 + i % 7, 'v'));
  db.flush();
  uint64_t entries = 0;
  for (int l = 0; l < 4; ++l) {
    auto sizes = db.level_file_sizes(l);
    CHECK_EQ(sizes.size(), db.level_file_count(l));
    uint64_t sum = 0;
    for (auto s : sizes) sum += s;
    CHECK_EQ(sum, db.level_bytes(l));
    entries += db.level_entries(l);
  }
  CHECK_EQ(entries, db.total_entries());
  CHECK(db.total_entries() >= 45u);
  CHECK_EQ(db.level_file_count(9), 0u);
  CHECK_EQ(db.level_bytes(9), 0u);
}

/** @id TEST-DB-014 @verifies REQ-DB-014 */
TEST(test_db_014_l0_trigger_option) {
  DbOptions o;
  o.memtable_bytes = 1 << 30;
  o.l0_trigger = 2;
  Db db(o);
  db.put("a", "1");
  db.flush();
  CHECK_EQ(db.level_file_count(0), 1u);
  db.put("b", "2");
  db.flush();
  CHECK_EQ(db.level_file_count(0), 0u);
  CHECK(db.level_file_count(1) > 0u);
}

/** @id TEST-DB-015 @verifies REQ-DB-015 */
TEST(test_db_015_foreign_snapshot) {
  Db a(no_flush_opts()), b(no_flush_opts());
  a.put("k", "va");
  b.put("k", "vb");
  Snapshot sa = a.snapshot();
  CHECK_EQ(*a.get("k", sa), std::string("va"));
  CHECK_THROWS(b.get("k", sa));
  CHECK_THROWS(b.scan("a", "z", &sa));
  Snapshot moved = std::move(sa);
  CHECK_THROWS(a.get("k", sa));
  CHECK_EQ(*a.get("k", moved), std::string("va"));
  CHECK_EQ(a.scan("a", "z", &moved).size(), 1u);
}
