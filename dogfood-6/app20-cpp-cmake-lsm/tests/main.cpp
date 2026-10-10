#include "harness.hpp"
#include <cstring>

int main(int argc, char** argv) {
  const char* filter = argc > 1 ? argv[1] : "";
  int ran = 0, failed = 0;
  for (auto& c : th::registry()) {
    if (std::strstr(c.name, filter) == nullptr) continue;
    ++ran;
    try { c.fn(); std::printf("PASS %s\n", c.name); }
    catch (const th::Abort&) { ++failed; std::printf("FAIL %s\n", c.name); }
    catch (const std::exception& e) { ++failed; std::printf("CHECK failed: unexpected exception %s in %s\n", e.what(), c.name); }
  }
  if (ran == 0) { std::printf("no test matched '%s'\n", filter); return 2; }
  return failed ? 1 : 0;
}
