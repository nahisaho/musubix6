#include "harness.hpp"
#include "lsm/sstable.hpp"
#include <string>
#include <vector>

using namespace lsm;

static std::string pad(int i, int w = 4) {
  std::string s = std::to_string(i);
  return std::string(w - s.size(), '0') + s;
}
static Entry put_e(const std::string& k, uint64_t seq, const std::string& v) { return Entry{k, seq, ValueType::Put, v}; }
static Entry del_e(const std::string& k, uint64_t seq) { return Entry{k, seq, ValueType::Delete, ""}; }
static std::vector<Entry> make_entries(int n) {
  std::vector<Entry> es;
  for (int i = 0; i < n; ++i) es.push_back(put_e("k" + pad(i), 100 + i, "value-" + pad(i)));
  return es;
}
static std::string build(const std::vector<Entry>& es, size_t block = 64) {
  SstWriter w(block);
  for (auto& e : es) w.add(e);
  return w.finish();
}

/** @id TEST-SST-001 @verifies REQ-SST-001 */
TEST(test_sst_001_varint) {
  const uint64_t vals[] = {0, 1, 127, 128, 300, 16383, 16384, 1ull << 32, UINT64_MAX};
  for (uint64_t v : vals) {
    std::string s;
    put_varint(s, v);
    size_t pos = 0;
    CHECK_EQ(get_varint(s, pos), v);
    CHECK_EQ(pos, s.size());
  }
  std::string one;
  put_varint(one, 127);
  CHECK_EQ(one.size(), 1u);
  std::string two;
  put_varint(two, 128);
  CHECK_EQ(two.size(), 2u);
  std::string trunc("\x80\x80", 2);
  size_t p = 0;
  CHECK_THROWS(get_varint(trunc, p));
  std::string longv(11, '\x80');
  longv.push_back('\x01');
  p = 0;
  CHECK_THROWS(get_varint(longv, p));
  p = 5;
  CHECK_THROWS(get_varint(one, p));
}

/** @id TEST-SST-002 @verifies REQ-SST-002 */
TEST(test_sst_002_crc32) {
  CHECK_EQ(crc32(std::string("123456789")), 0xCBF43926u);
  CHECK_EQ(crc32(std::string()), 0u);
}

/** @id TEST-SST-003 @verifies REQ-SST-003 */
TEST(test_sst_003_writer_order) {
  SstWriter w(64);
  w.add(put_e("b", 5, "x"));
  w.add(put_e("b", 3, "older"));
  CHECK_THROWS(w.add(put_e("b", 3, "dup")));
  CHECK_THROWS(w.add(put_e("b", 4, "newer-after-older")));
  CHECK_THROWS(w.add(put_e("a", 9, "smaller-key")));
  w.add(put_e("c", 1, "ok"));
  bool inv = false;
  try { w.add(put_e("a", 1, "x")); } catch (const std::invalid_argument&) { inv = true; }
  CHECK(inv);
  SstReader r(w.finish());
  CHECK_EQ(r.entry_count(), 3u);
}

/** @id TEST-SST-004 @verifies REQ-SST-004 */
TEST(test_sst_004_block_split) {
  auto es = make_entries(100);
  SstReader r(build(es, 64));
  auto sizes = r.block_payload_sizes();
  CHECK(sizes.size() > 5u);
  for (size_t i = 0; i + 1 < sizes.size(); ++i) CHECK(sizes[i] >= 64u);
  CHECK(sizes.back() > 0u);
  size_t total = 0;
  for (auto s : r.all_entries()) { (void)s; ++total; }
  CHECK_EQ(total, 100u);
  SstReader big(build(es, 1 << 20));
  CHECK_EQ(big.block_payload_sizes().size(), 1u);
}

/** @id TEST-SST-005 @verifies REQ-SST-005 */
TEST(test_sst_005_footer) {
  auto es = make_entries(37);
  std::string data = build(es);
  CHECK(data.size() > 48u);
  const unsigned char* f = reinterpret_cast<const unsigned char*>(data.data()) + data.size() - 48;
  uint64_t count = 0, magic = 0;
  for (int i = 0; i < 8; ++i) count |= static_cast<uint64_t>(f[32 + i]) << (8 * i);
  for (int i = 0; i < 8; ++i) magic |= static_cast<uint64_t>(f[40 + i]) << (8 * i);
  CHECK_EQ(count, 37u);
  CHECK_EQ(magic, 0x4C534D5353543031ull);
}

/** @id TEST-SST-006 @verifies REQ-SST-006 */
TEST(test_sst_006_get_versions) {
  std::vector<Entry> es = {put_e("a", 9, "a9"), put_e("a", 5, "a5"), del_e("b", 8), put_e("b", 2, "b2"),
                           put_e("c", 7, "c7")};
  SstReader r(build(es, 32));
  CHECK_EQ(r.get("a").value, std::string("a9"));
  CHECK_EQ(r.get("a", 8).value, std::string("a5"));
  CHECK(r.get("a", 4).state == LookupState::NotFound);
  CHECK(r.get("b").state == LookupState::Deleted);
  CHECK_EQ(r.get("b", 7).value, std::string("b2"));
  CHECK(r.get("zz").state == LookupState::NotFound);
  CHECK(r.get("").state == LookupState::NotFound);
  CHECK(r.get("bb").state == LookupState::NotFound);
  CHECK_EQ(r.get("c").value, std::string("c7"));
}

/** @id TEST-SST-007 @verifies REQ-SST-007 */
TEST(test_sst_007_bloom_skips_reads) {
  SstReader r(build(make_entries(300), 128));
  int negatives = 0;
  for (int i = 0; i < 300; ++i) {
    std::string k = "k" + pad(i) + "x";
    uint64_t before = r.block_reads();
    auto res = r.get(k);
    CHECK(res.state == LookupState::NotFound);
    if (!r.bloom().may_contain(k)) {
      ++negatives;
      CHECK_EQ(r.block_reads(), before);
    }
  }
  CHECK(negatives > 250);
  uint64_t before = r.block_reads();
  CHECK(r.get("k0100").state == LookupState::Found);
  CHECK_EQ(r.block_reads(), before + 1);
}

/** @id TEST-SST-008 @verifies REQ-SST-008 */
TEST(test_sst_008_iteration) {
  std::vector<Entry> es;
  for (int i = 0; i < 200; ++i) {
    es.push_back(put_e("key" + pad(i), 500 - i, "v" + pad(i)));
    if (i % 7 == 0) es.push_back(del_e("key" + pad(i), 100 - i / 7));
  }
  SstReader r(build(es, 80));
  auto got = r.all_entries();
  CHECK_EQ(got.size(), es.size());
  for (size_t i = 0; i < es.size(); ++i) {
    CHECK_EQ(got[i].key, es[i].key);
    CHECK_EQ(got[i].seq, es[i].seq);
    CHECK(got[i].type == es[i].type);
    CHECK_EQ(got[i].value, es[i].value);
  }
}

/** @id TEST-SST-009 @verifies REQ-SST-009 */
TEST(test_sst_009_corruption) {
  std::string good = build(make_entries(50), 64);
  std::string bad = good;
  bad[3] ^= 0x01;
  SstReader r(bad);
  bool corrupt = false;
  try { r.get("k0000"); } catch (const CorruptionError&) { corrupt = true; }
  CHECK(corrupt);
  CHECK_THROWS(r.all_entries());
  std::string badidx = good;
  uint64_t index_off = 0;
  for (int i = 0; i < 8; ++i) index_off |= static_cast<uint64_t>(static_cast<unsigned char>(good[good.size() - 48 + 16 + i])) << (8 * i);
  badidx[index_off + 1] ^= 0x40;
  bool c2 = false;
  try { SstReader x(badidx); } catch (const CorruptionError&) { c2 = true; }
  CHECK(c2);
  uint64_t bloom_off = 0;
  for (int i = 0; i < 8; ++i) bloom_off |= static_cast<uint64_t>(static_cast<unsigned char>(good[good.size() - 48 + i])) << (8 * i);
  std::string badbloom = good;
  badbloom[bloom_off + 9] ^= 0x02;
  CHECK_THROWS(SstReader(badbloom));
  SstReader ok(good);
  CHECK(ok.get("k0007").state == LookupState::Found);
}

/** @id TEST-SST-010 @verifies REQ-SST-010 */
TEST(test_sst_010_format_errors) {
  std::string good = build(make_entries(10), 64);
  CHECK_THROWS(SstReader(std::string()));
  CHECK_THROWS(SstReader(good.substr(0, 47)));
  std::string badmagic = good;
  badmagic[good.size() - 1] ^= 0x7f;
  bool fe = false;
  try { SstReader r(badmagic); } catch (const FormatError&) { fe = true; }
  CHECK(fe);
  std::string badoff = good;
  badoff[good.size() - 48 + 17] = '\x7f';  // index_off byte 1 -> huge
  bool fe2 = false;
  try { SstReader r(badoff); } catch (const FormatError&) { fe2 = true; }
  CHECK(fe2);
  CHECK_THROWS(SstReader(good.substr(10)));
}

/** @id TEST-SST-011 @verifies REQ-SST-011 */
TEST(test_sst_011_seek) {
  std::vector<Entry> es;
  for (int i = 0; i < 60; i += 2) es.push_back(put_e("k" + pad(i), 10 + i, std::string(20, 'v')));
  es.insert(es.begin() + 6, put_e(es[5].key, 3, "older"));
  // es[5] was k0010@20, es[6] is now k0010@3
  SstReader r(build(es, 48));
  CHECK(r.block_payload_sizes().size() > 4u);
  auto it = r.seek("k0011");
  CHECK(it.valid());
  CHECK_EQ(it.entry().key, std::string("k0012"));
  auto it2 = r.seek("k0010");
  CHECK_EQ(it2.entry().seq, 20u);
  it2.next();
  CHECK_EQ(it2.entry().seq, 3u);
  it2.next();
  CHECK_EQ(it2.entry().key, std::string("k0012"));
  auto it3 = r.seek("");
  CHECK_EQ(it3.entry().key, std::string("k0000"));
  CHECK(!r.seek("k0059").valid());
  CHECK(!r.seek("zzz").valid());
  size_t n = 0;
  for (auto i = r.seek("k0030"); i.valid(); i.next()) ++n;
  CHECK_EQ(n, 15u);
}

/** @id TEST-SST-012 @verifies REQ-SST-012 */
TEST(test_sst_012_empty_and_bounds) {
  SstWriter w(64);
  SstReader empty(w.finish());
  CHECK_EQ(empty.entry_count(), 0u);
  CHECK(empty.get("a").state == LookupState::NotFound);
  CHECK(!empty.seek("").valid());
  CHECK(empty.all_entries().empty());
  SstReader r(build({put_e("m", 2, "1"), put_e("m", 1, "0"), put_e("z", 9, "9")}));
  CHECK_EQ(r.min_key(), std::string("m"));
  CHECK_EQ(r.max_key(), std::string("z"));
  CHECK_EQ(r.entry_count(), 3u);
}

/** @id TEST-SST-013 @verifies REQ-SST-013 */
TEST(test_sst_013_flush_memtable) {
  MemTable m(7);
  uint64_t seq = 0;
  for (int i = 0; i < 80; ++i) m.put("k" + pad(i % 30), "v" + std::to_string(i), ++seq);
  m.del("k0005", ++seq);
  m.del("never-written", ++seq);
  SstReader r(write_sstable(m, 96));
  auto want = m.entries();
  auto got = r.all_entries();
  CHECK_EQ(got.size(), want.size());
  for (size_t i = 0; i < want.size(); ++i) {
    CHECK_EQ(got[i].key, want[i].key);
    CHECK_EQ(got[i].seq, want[i].seq);
    CHECK(got[i].type == want[i].type);
  }
  CHECK(r.get("k0005").state == LookupState::Deleted);
  CHECK(r.get("never-written").state == LookupState::Deleted);
}
