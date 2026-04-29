#pragma once

#include <stddef.h>
#include <string.h>

namespace bench {

// Bounded ring buffer of recent cmd_ids so duplicate commands can be detected
// and acked as `duplicate` instead of being executed twice.
template <size_t Capacity>
class CmdDedupe {
 public:
  CmdDedupe() : count_(0), head_(0) {}

  bool seen(const char* id) const {
    for (size_t i = 0; i < count_; ++i) {
      if (strncmp(slots_[i], id, kIdMax) == 0) return true;
    }
    return false;
  }

  void record(const char* id) {
    if (seen(id)) return;
    if (count_ < Capacity) {
      copyTo(slots_[count_++], id);
    } else {
      copyTo(slots_[head_], id);
      head_ = (head_ + 1) % Capacity;
    }
  }

  size_t size() const { return count_; }

 private:
  static constexpr size_t kIdMax = 64;
  void copyTo(char* dst, const char* src) {
    strncpy(dst, src, kIdMax - 1);
    dst[kIdMax - 1] = '\0';
  }
  char slots_[Capacity][kIdMax];
  size_t count_;
  size_t head_;
};

}  // namespace bench
