#include "harness.hpp"
#include "lsm/bloom.hpp"
#include <set>
#include <string>

using lsm::BloomFilter;

/** @id TEST-BLOOM-001 @verifies REQ-BLOOM-001 */
TEST(test_bloom_001_sizing) {
  BloomFilter f(1000, 0.01);
  CHECK_EQ(f.bit_count(), 9592u + 0u);  // ceil(9585.06) rounded up to a multiple of 8
  CHECK_EQ(f.hash_count(), 7u);
  BloomFilter g(1, 0.5);
  CHECK(g.bit_count() % 8 == 0);
  CHECK(g.hash_count() >= 1u);
}

/** @id TEST-BLOOM-002 @verifies REQ-BLOOM-002 */
TEST(test_bloom_002_invalid_params) {
  CHECK_THROWS(BloomFilter(0, 0.01));
  CHECK_THROWS(BloomFilter(10, 0.0));
  CHECK_THROWS(BloomFilter(10, 1.0));
  CHECK_THROWS(BloomFilter(10, -0.5));
}

/** @id TEST-BLOOM-003 @verifies REQ-BLOOM-003 */
TEST(test_bloom_003_no_false_negatives) {
  BloomFilter f(500, 0.01);
  for (int i = 0; i < 500; ++i) f.add("key" + std::to_string(i));
  for (int i = 0; i < 500; ++i) CHECK(f.may_contain("key" + std::to_string(i)));
}

/** @id TEST-BLOOM-004 @verifies REQ-BLOOM-004 */
TEST(test_bloom_004_empty_filter) {
  BloomFilter f(100, 0.01);
  for (int i = 0; i < 200; ++i) CHECK(!f.may_contain("k" + std::to_string(i)));
}

/** @id TEST-BLOOM-005 @verifies REQ-BLOOM-005 */
TEST(test_bloom_005_fp_rate) {
  BloomFilter f(1000, 0.01);
  for (int i = 0; i < 1000; ++i) f.add("in-" + std::to_string(i));
  int fp = 0;
  for (int i = 0; i < 10000; ++i) fp += f.may_contain("out-" + std::to_string(i)) ? 1 : 0;
  CHECK(fp < 300);
}

/** @id TEST-BLOOM-006 @verifies REQ-BLOOM-006 */
TEST(test_bloom_006_roundtrip) {
  BloomFilter f(100, 0.05);
  for (int i = 0; i < 100; ++i) f.add("r" + std::to_string(i));
  std::string bytes = f.serialize();
  BloomFilter g = BloomFilter::deserialize(bytes);
  CHECK_EQ(g.bit_count(), f.bit_count());
  CHECK_EQ(g.hash_count(), f.hash_count());
  CHECK_EQ(g.serialize(), bytes);
  for (int i = 0; i < 300; ++i) CHECK_EQ(g.may_contain("r" + std::to_string(i)), f.may_contain("r" + std::to_string(i)));
}

/** @id TEST-BLOOM-007 @verifies REQ-BLOOM-007 */
TEST(test_bloom_007_bad_data) {
  BloomFilter f(10, 0.1);
  f.add("a");
  std::string bytes = f.serialize();
  std::string bad = bytes;
  bad[0] ^= 0x55;
  CHECK_THROWS(BloomFilter::deserialize(bad));
  CHECK_THROWS(BloomFilter::deserialize(bytes.substr(0, bytes.size() - 1)));
  CHECK_THROWS(BloomFilter::deserialize(bytes.substr(0, 5)));
  CHECK_THROWS(BloomFilter::deserialize(std::string()));
  bool is_format_error = false;
  try { BloomFilter::deserialize(bytes + "x"); } catch (const lsm::FormatError&) { is_format_error = true; }
  CHECK(is_format_error);
}

/** @id TEST-BLOOM-008 @verifies REQ-BLOOM-008 */
TEST(test_bloom_008_merge) {
  BloomFilter a(100, 0.01), b(100, 0.01), c(200, 0.01);
  a.add("x"); b.add("y");
  a.merge(b);
  CHECK(a.may_contain("x"));
  CHECK(a.may_contain("y"));
  CHECK_THROWS(a.merge(c));
}

/** @id TEST-BLOOM-009 @verifies REQ-BLOOM-009 */
TEST(test_bloom_009_hash) {
  CHECK_EQ(lsm::fnv1a64(""), 0xcbf29ce484222325ull);
  CHECK_EQ(lsm::fnv1a64("a"), 0xaf63dc4c8601ec8cull);
  CHECK_EQ(lsm::fnv1a64("foobar"), 0x85944171f73967e8ull);
  BloomFilter f(10, 0.01);
  f.add("");
  CHECK(f.may_contain(""));
}
