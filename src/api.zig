const std = @import("std");
const io = @import("io.zig");

/// Global string storage for API from TS <-> Zig
var string_stack: std.ArrayListUnmanaged([]const u8) = .empty;
const gpa: std.mem.Allocator = @import("root").gpa;

comptime {
    @export(&pushStringApi, .{ .name = "pushString" });
    @export(&popStringApi, .{ .name = "popString" });
}

/// Allocates a string on the top of the string stack
fn pushStringApi(len: usize) callconv(.c) [*]u8 {
    errdefer |err| io.handle(err);
    const new_str = try gpa.alloc(u8, len);
    errdefer gpa.free(new_str);
    try string_stack.append(gpa, new_str);
    return new_str.ptr;
}

/// Gets the length of the string on the top of the stack
export fn topLength() usize {
    const top = string_stack.items.len - 1;
    return string_stack.items[top].len;
}

/// Gets the pointer of the string on the top of the stack
export fn topPointer() [*]const u8 {
    const top = string_stack.items.len - 1;
    return string_stack.items[top].ptr;
}

/// Frees and pops the string off of the top of the stack
fn popStringApi() callconv(.c) void {
    const top = string_stack.items.len - 1;
    gpa.free(string_stack.items[top]);
    string_stack.items.len -= 1;
}

/// pushStringApi tweaked for ease-of-use with Zig code
pub fn pushString(str: []const u8) !void {
    const new_str = try gpa.dupe(u8, str);
    errdefer gpa.free(new_str);
    try string_stack.append(gpa, new_str);
}

/// topLength & topPointer & popStringApi combined Zig code
pub fn popString() []const u8 {
    const top = string_stack.items.len - 1;
    string_stack.items.len -= 1;
    return string_stack.items[top];
}
