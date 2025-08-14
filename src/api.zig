const std = @import("std");
const assert = std.debug.assert;

const gpa: std.mem.Allocator = @import("root").gpa;
var bytes: std.ArrayList(u8) = .empty;

/// For setting string parameters from TypeScript
/// Every call invalidates return value of getString
export fn allocateApi(len: usize) [*]u8 {
    if (bytes.ensureTotalCapacity(gpa, len)) {
        bytes.items.len = len;
        return bytes.items.ptr;
    } else |_| unreachable;
}

/// For accessing string parameters in Zig
/// Output valid while allocateApi is not called
pub fn getString() []const u8 {
    return bytes.items;
}
