#include "harness.hpp"
#include "lsm/memtable.hpp"
#include <algorithm>
#include <string>
#include <vector>

using lsm::MemTable;
using lsm::LookupState;

/** @id TEST-MEM-001 @verifies REQ-MEM-001 */
TEST(test_mem_001_put_get) {
  MemTable m;
  m.put("a", "1", 1);
  auto r = m.get("a");
  CHECK(r.state == LookupState::Found);
  CHECK_EQ(r.value, std::string("1"));
}

/** @id TEST-MEM-002 @verifies REQ-MEM-002 */
TEST(test_mem_002_versions) {
  MemTable m;
  m.put("k", "old", 1);
  m.put("k", "new", 2);
  CHECK_EQ(m.get("k").value, std::string("new"));
  CHECK_EQ(m.entry_count(), 2u);
}

/** @id TEST-MEM-003 @verifies REQ-MEM-003 */
TEST(test_mem_003_tombstone) {
  MemTable m;
  m.put("k", "v", 1);
  m.del("k", 2);
  CHECK(m.get("k").state == LookupState::Deleted);
  CHECK(m.get("zzz").state == LookupState::NotFound);
  m.put("k", "again", 3);
  CHECK(m.get("k").state == LookupState::Found);
  CHECK_EQ(m.get("k").value, std::string("again"));
}

/** @id TEST-MEM-004 @verifies REQ-MEM-004 */
TEST(test_mem_004_not_found) {
  MemTable m;
  CHECK(m.get("x").state == LookupState::NotFound);
  m.put("a", "1", 1);
  m.put("c", "3", 2);
  CHECK(m.get("b").state == LookupState::NotFound);
  CHECK(m.get("").state == LookupState::NotFound);
}

/** @id TEST-MEM-005 @verifies REQ-MEM-005 */
TEST(test_mem_005_snapshot) {
  MemTable m;
  m.put("k", "v1", 5);
  m.del("k", 9);
  m.put("k", "v3", 12);
  CHECK(m.get("k", 4).state == LookupState::NotFound);
  CHECK_EQ(m.get("k", 5).value, std::string("v1"));
  CHECK_EQ(m.get("k", 8).value, std::string("v1"));
  CHECK(m.get("k", 9).state == LookupState::Deleted);
  CHECK(m.get("k", 11).state == LookupState::Deleted);
  CHECK_EQ(m.get("k", 12).value, std::string("v3"));
}

/** @id TEST-MEM-006 @verifies REQ-MEM-006 */
TEST(test_mem_006_order) {
  MemTable m;
  m.put("b", "1", 1);
  m.put("a", "2", 2);
  m.put("c", "3", 3);
  m.put("a", "4", 4);
  m.del("b", 5);
  auto es = m.entries();
  CHECK_EQ(es.size(), 5u);
  CHECK_EQ(es[0].key, std::string("a")); CHECK_EQ(es[0].seq, 4u);
  CHECK_EQ(es[1].key, std::string("a")); CHECK_EQ(es[1].seq, 2u);
  CHECK_EQ(es[2].key, std::string("b")); CHECK_EQ(es[2].seq, 5u);
  CHECK_EQ(es[3].key, std::string("b")); CHECK_EQ(es[3].seq, 1u);
  CHECK_EQ(es[4].key, std::string("c"));
}

/** @id TEST-MEM-007 @verifies REQ-MEM-007 */
TEST(test_mem_007_seek) {
  MemTable m;
  m.put("b", "1", 1);
  m.put("d", "2", 2);
  m.put("d", "3", 3);
  auto it = m.seek("c");
  CHECK(it.valid());
  CHECK_EQ(it.entry().key, std::string("d"));
  CHECK_EQ(it.entry().seq, 3u);
  it.next();
  CHECK_EQ(it.entry().seq, 2u);
  it.next();
  CHECK(!it.valid());
  CHECK(!m.seek("e").valid());
  CHECK_EQ(m.seek("").entry().key, std::string("b"));
  CHECK_EQ(m.seek("b").entry().key, std::string("b"));
}

/** @id TEST-MEM-008 @verifies REQ-MEM-008 */
TEST(test_mem_008_bytes) {
  MemTable m;
  CHECK_EQ(m.approximate_bytes(), 0u);
  m.put("abc", "12345", 1);
  CHECK_EQ(m.approximate_bytes(), 3u + 5u + 32u);
  m.del("abc", 2);
  CHECK_EQ(m.approximate_bytes(), (3u + 5u + 32u) + (3u + 0u + 32u));
}

/** @id TEST-MEM-009 @verifies REQ-MEM-009 */
TEST(test_mem_009_seq_monotonic) {
  MemTable m;
  m.put("a", "1", 10);
  CHECK_THROWS(m.put("b", "2", 10));
  CHECK_THROWS(m.del("b", 3));
  CHECK_EQ(m.entry_count(), 1u);
  CHECK_EQ(m.max_seq(), 10u);
  CHECK(m.get("b").state == LookupState::NotFound);
  m.put("b", "2", 11);
  CHECK_EQ(m.max_seq(), 11u);
}

/** @id TEST-MEM-010 @verifies REQ-MEM-010 */
TEST(test_mem_010_skiplist_invariants) {
  MemTable m(42);
  uint64_t x = 12345, seq = 0;
  for (int i = 0; i < 2000; ++i) {
    x = x * 6364136223846793005ull + 1442695040888963407ull;
    m.put("k" + std::to_string((x >> 33) % 500), "v", ++seq);
  }
  CHECK(m.check_invariants());
  CHECK(m.height() >= 3);
  CHECK(m.height() <= 12);
  MemTable m2(42);
  x = 12345; seq = 0;
  for (int i = 0; i < 2000; ++i) {
    x = x * 6364136223846793005ull + 1442695040888963407ull;
    m2.put("k" + std::to_string((x >> 33) % 500), "v", ++seq);
  }
  CHECK_EQ(m2.height(), m.height());
  CHECK_EQ(m2.level_sizes().size(), m.level_sizes().size());
  CHECK(m.level_sizes()[0] == 2000u);
  for (size_t i = 1; i < m.level_sizes().size(); ++i) CHECK(m.level_sizes()[i] <= m.level_sizes()[i - 1]);
}

/** @id TEST-MEM-011 @verifies REQ-MEM-011 */
TEST(test_mem_011_freeze) {
  MemTable m;
  m.put("a", "1", 1);
  CHECK(!m.frozen());
  m.freeze();
  m.freeze();
  CHECK(m.frozen());
  bool logic = false;
  try { m.put("b", "2", 2); } catch (const std::logic_error&) { logic = true; }
  CHECK(logic);
  CHECK_THROWS(m.del("a", 3));
  CHECK_EQ(m.get("a").value, std::string("1"));
  CHECK_EQ(m.entries().size(), 1u);
}

/** @id TEST-MEM-012 @verifies REQ-MEM-012 */
TEST(test_mem_012_binary_keys) {
  MemTable m;
  std::string nul1("a\0b", 3), nul2("a\0c", 3), shorter("a", 1);
  m.put(nul2, "", 1);
  m.put("", "empty-key", 2);
  m.put(nul1, "x", 3);
  m.put(shorter, "y", 4);
  auto es = m.entries();
  CHECK_EQ(es.size(), 4u);
  CHECK_EQ(es[0].key, std::string());
  CHECK_EQ(es[1].key, shorter);
  CHECK_EQ(es[2].key, nul1);
  CHECK_EQ(es[3].key, nul2);
  CHECK_EQ(m.get(nul2).value, std::string());
  CHECK(m.get(nul2).state == LookupState::Found);
  CHECK_EQ(m.get("").value, std::string("empty-key"));
}
