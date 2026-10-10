#pragma once
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

namespace th {
struct Case { const char* name; std::function<void()> fn; };
inline std::vector<Case>& registry() { static std::vector<Case> r; return r; }
inline int& failures() { static int f = 0; return f; }
struct Reg { Reg(const char* n, std::function<void()> f) { registry().push_back({n, std::move(f)}); } };
struct Abort {};
}  // namespace th

#define TEST(name) \
  static void name(); \
  static th::Reg reg_##name(#name, name); \
  static void name()

#define CHECK(cond) do { if (!(cond)) { std::printf("CHECK failed: %s (%s:%d)\n", #cond, __FILE__, __LINE__); throw th::Abort{}; } } while (0)
#define CHECK_EQ(a, b) do { auto va_ = (a); auto vb_ = (b); if (!(va_ == vb_)) { std::printf("CHECK failed: %s == %s (%s:%d)\n", #a, #b, __FILE__, __LINE__); throw th::Abort{}; } } while (0)
#define CHECK_THROWS(expr) do { bool t_ = false; try { (void)(expr); } catch (...) { t_ = true; } if (!t_) { std::printf("CHECK failed: %s should throw (%s:%d)\n", #expr, __FILE__, __LINE__); throw th::Abort{}; } } while (0)
