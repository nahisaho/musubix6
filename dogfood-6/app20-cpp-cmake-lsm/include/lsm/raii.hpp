#pragma once
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>

namespace lsm {

/** @id CODE-DB-001 @implements REQ-DB-011 */
// Writes to <path>.tmp; commit() renames it to <path>; an uncommitted destructor removes the tmp file.
class ScopedFile {
 public:
  explicit ScopedFile(std::string path) : path_(std::move(path)), tmp_(path_ + ".tmp") {
    out_.open(tmp_, std::ios::binary | std::ios::trunc);
    if (!out_) throw std::runtime_error("cannot open " + tmp_);
    active_ = true;
  }
  ScopedFile(const ScopedFile&) = delete;
  ScopedFile& operator=(const ScopedFile&) = delete;
  ScopedFile(ScopedFile&& o) noexcept : path_(std::move(o.path_)), tmp_(std::move(o.tmp_)), out_(std::move(o.out_)), active_(o.active_) {
    o.active_ = false;
  }
  ScopedFile& operator=(ScopedFile&& o) noexcept {
    if (this != &o) {
      discard();
      path_ = std::move(o.path_);
      tmp_ = std::move(o.tmp_);
      out_ = std::move(o.out_);
      active_ = o.active_;
      o.active_ = false;
    }
    return *this;
  }
  ~ScopedFile() { discard(); }

  void write(const std::string& data) {
    if (!active_) throw std::logic_error("ScopedFile: not active");
    out_.write(data.data(), static_cast<std::streamsize>(data.size()));
    if (!out_) throw std::runtime_error("write failed: " + tmp_);
  }
  void commit() {
    if (!active_) throw std::logic_error("ScopedFile: not active");
    out_.close();
    if (out_.fail()) throw std::runtime_error("close failed: " + tmp_);
    std::filesystem::rename(tmp_, path_);
    active_ = false;
  }

 private:
  void discard() {
    if (!active_) return;
    out_.close();
    std::error_code ec;
    std::filesystem::remove(tmp_, ec);
    active_ = false;
  }
  std::string path_, tmp_;
  std::ofstream out_;
  bool active_ = false;
};
}  // namespace lsm
