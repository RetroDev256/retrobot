const std = @import("std");
const assert = std.debug.assert;

const gpa: std.mem.Allocator = @import("root").gpa;

extern fn readFileApi(path_ptr: [*]const u8, path_len: usize) bool;
pub fn readFile(path: []const u8) ![]const u8 {
    if (!readFileApi(path.ptr, path.len)) return error.TypeScriptError;
    return try getString();
}

extern fn writeStdoutApi(out_ptr: [*]const u8, out_len: usize) bool;
pub fn writeStdout(out: []const u8) !void {
    if (!writeStdoutApi(out.ptr, out.len)) return error.TypeScriptError;
}

extern fn fillRandomApi(dest_ptr: [*]u8, dest_len: usize) bool;
pub fn fillRandom(dest: []u8) !void {
    if (!fillRandomApi(dest.ptr, dest.len)) return error.TypeScriptError;
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

extern fn reactMessageApi(
    channel_id_ptr: [*]const u8,
    channel_id_len: usize,
    message_id_ptr: [*]const u8,
    message_id_len: usize,
    reaction_ptr: [*]const u8,
    reaction_len: usize,
) void;

pub fn reactMessage(
    channel_id: []const u8,
    message_id: []const u8,
    reaction: []const u8,
) void {
    reactMessageApi(
        channel_id.ptr,
        channel_id.len,
        message_id.ptr,
        message_id.len,
        reaction.ptr,
        reaction.len,
    );
}

var bytes: std.ArrayList(u8) = .empty;

/// For setting string parameters from TypeScript
export fn allocateMem(len: usize) ?[*]u8 {
    if (bytes.ensureTotalCapacity(gpa, len)) {
        bytes.items.len = len;
        return bytes.items.ptr;
    } else |_| return null;
}

/// For accessing string parameters in Zig
pub fn getString() ![]const u8 {
    return try bytes.toOwnedSlice(gpa);
}
