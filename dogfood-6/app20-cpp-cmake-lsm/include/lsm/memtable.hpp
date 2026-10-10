#pragma once
#include <memory>
#include <vector>
#include "lsm/types.hpp"

namespace lsm {

/** @id CODE-MEM-002 @implements REQ-MEM-001 REQ-MEM-002 REQ-MEM-003 REQ-MEM-004 REQ-MEM-005 REQ-MEM-007 REQ-MEM-008 REQ-MEM-009 REQ-MEM-011 REQ-MEM-012 */
class MemTable {
  struct Node {
    Entry e;
    std::vector<Node*> next;
  };

 public:
  static constexpr int kMaxHeight = 12;

  class Iterator {
   public:
    bool valid() const { return n_ != nullptr; }
    const Entry& entry() const { return n_->e; }
    void next() { n_ = n_->next[0]; }
   private:
    friend class MemTable;
    explicit Iterator(const Node* n) : n_(n) {}
    const Node* n_;
  };

  explicit MemTable(uint64_t seed = 1) : rng_(seed ? seed : 1) { head_.next.assign(kMaxHeight, nullptr); }

  void put(const std::string& key, const std::string& value, uint64_t seq) { insert(key, value, seq, ValueType::Put); }
  void del(const std::string& key, uint64_t seq) { insert(key, std::string(), seq, ValueType::Delete); }

  LookupResult get(const std::string& key, uint64_t snapshot = UINT64_MAX) const {
    const Node* n = lower_bound(key, snapshot);
    if (n == nullptr || n->e.key != key) return {};
    if (n->e.type == ValueType::Delete) return {LookupState::Deleted, std::string()};
    return {LookupState::Found, n->e.value};
  }

  size_t entry_count() const { return count_; }
  size_t approximate_bytes() const { return bytes_; }
  uint64_t max_seq() const { return max_seq_; }
  void freeze() { frozen_ = true; }
  bool frozen() const { return frozen_; }

  /** @id CODE-MEM-003 @implements REQ-MEM-006 */
  std::vector<Entry> entries() const {
    std::vector<Entry> out;
    for (const Node* n = head_.next[0]; n; n = n->next[0]) out.push_back(n->e);
    return out;
  }
  Iterator seek(const std::string& key) const { return Iterator(lower_bound(key, UINT64_MAX)); }

  /** @id CODE-MEM-004 @implements REQ-MEM-010 */
  int height() const { return height_; }
  std::vector<size_t> level_sizes() const {
    std::vector<size_t> sizes(static_cast<size_t>(height_), 0);
    for (int l = 0; l < height_; ++l)
      for (const Node* n = head_.next[l]; n; n = n->next[l]) ++sizes[l];
    return sizes;
  }
  bool check_invariants() const {
    if (height_ < 1 || height_ > kMaxHeight) return false;
    for (int l = 0; l < height_; ++l) {
      const Node* below = head_.next[0];
      for (const Node* n = head_.next[l]; n; n = n->next[l]) {
        if (static_cast<int>(n->next.size()) <= l) return false;
        if (n->next[l] && !entry_less(n->e, n->next[l]->e)) return false;
        while (below && below != n) below = below->next[0];
        if (!below) return false;
      }
    }
    return true;
  }

 private:
  int random_height() {
    int h = 1;
    for (;;) {
      rng_ ^= rng_ << 13; rng_ ^= rng_ >> 7; rng_ ^= rng_ << 17;
      if ((rng_ & 3) != 0 || h >= kMaxHeight) return h;
      ++h;
    }
  }
  const Node* lower_bound(const std::string& key, uint64_t seq) const {
    const Node* x = &head_;
    for (int l = height_ - 1; l >= 0; --l)
      while (x->next[l] && internal_less(x->next[l]->e.key, x->next[l]->e.seq, key, seq)) x = x->next[l];
    return x->next[0];
  }
  void insert(const std::string& key, const std::string& value, uint64_t seq, ValueType type) {
    if (frozen_) throw std::logic_error("memtable is frozen");
    if (seq <= max_seq_) throw std::invalid_argument("memtable: seq must increase");
    Node* update[kMaxHeight];
    Node* x = &head_;
    for (int l = kMaxHeight - 1; l >= 0; --l) {
      while (x->next[l] && internal_less(x->next[l]->e.key, x->next[l]->e.seq, key, seq)) x = x->next[l];
      update[l] = x;
    }
    int h = random_height();
    auto node = std::make_unique<Node>();
    node->e = Entry{key, seq, type, value};
    node->next.assign(static_cast<size_t>(h), nullptr);
    for (int l = 0; l < h; ++l) { node->next[l] = update[l]->next[l]; update[l]->next[l] = node.get(); }
    if (h > height_) height_ = h;
    nodes_.push_back(std::move(node));
    ++count_;
    bytes_ += key.size() + value.size() + 32;
    max_seq_ = seq;
  }

  Node head_;
  std::vector<std::unique_ptr<Node>> nodes_;
  uint64_t rng_;
  int height_ = 1;
  size_t count_ = 0, bytes_ = 0;
  uint64_t max_seq_ = 0;
  bool frozen_ = false;
};
}  // namespace lsm
