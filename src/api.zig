const std = @import("std");
const root = @import("root.zig");
const Allocator = std.mem.Allocator;
const assert = std.debug.assert;

extern fn readFileApi(path_ptr: [*]const u8, path_len: usize) bool;
pub fn readFile(path: []const u8) ![]const u8 {
    if (!readFileApi(path.ptr, path.len)) return error.TypeScriptError;
    return try popString();
}

extern fn writeStdoutApi(out_ptr: [*]const u8, out_len: usize) void;
pub fn writeStdout(out: []const u8) void {
    writeStdoutApi(out.ptr, out.len);
}

extern fn fillRandomApi(dest_ptr: [*]u8, dest_len: usize) void;
pub fn fillRandom(dest: []u8) void {
    fillRandomApi(dest.ptr, dest.len);
}

extern fn replyMessageApi(
    channel_id_ptr: [*]const u8,
    channel_id_len: usize,
    message_id_ptr: [*]const u8,
    message_id_len: usize,
    content_ptr: [*]const u8,
    content_len: usize,
) void;

pub fn replyMessage(
    channel_id: []const u8,
    message_id: []const u8,
    content: []const u8,
) void {
    replyMessageApi(
        channel_id.ptr,
        channel_id.len,
        message_id.ptr,
        message_id.len,
        content.ptr,
        content.len,
    );
}

extern fn editMessageApi(
    channel_id_ptr: [*]const u8,
    channel_id_len: usize,
    message_id_ptr: [*]const u8,
    message_id_len: usize,
    content_ptr: [*]const u8,
    content_len: usize,
) void;

pub fn editMessage(
    channel_id: []const u8,
    message_id: []const u8,
    content: []const u8,
) void {
    editMessageApi(
        channel_id.ptr,
        channel_id.len,
        message_id.ptr,
        message_id.len,
        content.ptr,
        content.len,
    );
}

extern fn deleteMessageApi(
    channel_id_ptr: [*]const u8,
    channel_id_len: usize,
    message_id_ptr: [*]const u8,
    message_id_len: usize,
) void;

pub fn deleteMessage(
    channel_id: []const u8,
    message_id: []const u8,
) void {
    deleteMessageApi(
        channel_id.ptr,
        channel_id.len,
        message_id.ptr,
        message_id.len,
    );
}

var string_stack: std.ArrayList([]const u8) = .empty;

/// For setting string parameters from TypeScript
export fn allocateMem(len: usize) ?[*]u8 {
    string_stack.ensureUnusedCapacity(root.gpa, 1) catch return null;
    const str = root.gpa.alloc(u8, len) catch return null;
    string_stack.appendAssumeCapacity(str);
    return str.ptr;
}

/// For accessing string parameters in Zig
pub fn popString() ![]const u8 {
    if (string_stack.pop()) |str| return str;
    return error.EmptyStringStack;
}

pub const Message = struct {
    channel_id: []const u8,
    message_id: []const u8,
    author_id: []const u8,
    content: []const u8,
    is_bot: bool,

    pub fn parse(arena: Allocator, json: []const u8) !@This() {
        const opts: std.json.ParseOptions = .{ .allocate = .alloc_always };
        return try std.json.parseFromSliceLeaky(@This(), arena, json, opts);
    }
};
