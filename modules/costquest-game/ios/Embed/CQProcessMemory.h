// What this process uses, for the shell's prewarm measurement
// (CostQuestGameModule memoryReport). In C because Swift 6 refuses the
// mutable global `mach_task_self_`; the mach_task_self() macro is fine here.
#pragma once

#include <mach/mach.h>
#include <stdint.h>

/// phys_footprint: the number Xcode's memory gauge and jetsam go by.
static inline uint64_t cq_phys_footprint(void) {
  task_vm_info_data_t info;
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  kern_return_t result = task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count);
  return result == KERN_SUCCESS ? info.phys_footprint : 0;
}
