const std = @import("std");
const assert = std.debug.assert;

const gpa: std.mem.Allocator = @import("root").gpa;

extern fn readFileApi(path_ptr: [*]const u8, path_len: usize) bool;
pub fn readFile(path: []const u8) ![]const u8 {
    if (!readFileApi(path.ptr, path.len)) return error.TypeScriptError;
    return try popString();
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

var stack: std.ArrayList([]const u8) = .empty;

/// For setting string parameters from TypeScript
export fn allocateMem(len: usize) ?[*]u8 {
    stack.ensureUnusedCapacity(gpa, 1) catch return null;
    const str = gpa.alloc(u8, len) catch return null;
    stack.appendAssumeCapacity(str);
    return str.ptr;
}

/// For injecting callback parameters in Zig
pub fn pushString(str: []const u8) !void {
    try stack.append(gpa, str);
}

/// For accessing string parameters in Zig
pub fn popString() ![]const u8 {
    if (stack.pop()) |str| return str;
    return error.UnexpectedEmptyStack;
}

pub const MessageCreate = struct {
    arena: std.heap.ArenaAllocator,

    channel_id: []const u8,
    message_id: []const u8,
    author_id: []const u8,
    content: []const u8,
    author_is_bot: bool,

    // Get the expected data TypeScript passed us
    pub fn pull() !@This() {
        var arena_state: std.heap.ArenaAllocator = .init(gpa);
        const arena = arena_state.allocator();

        const json = try popString();
        defer gpa.free(json);
        const data = try std.json.parseFromSliceLeaky(struct {
            channel_id: []const u8,
            message_id: []const u8,
            author_id: []const u8,
            content: []const u8,
            author_is_bot: bool,
        }, arena, json, .{ .allocate = .alloc_always });

        return .{
            .arena = arena_state,
            .channel_id = data.channel_id,
            .message_id = data.message_id,
            .author_id = data.author_id,
            .content = data.content,
            .author_is_bot = data.author_is_bot,
        };
    }

    pub fn deinit(self: *@This()) void {
        defer self.* = undefined;
        self.arena.deinit();
    }
};

pub const ReactionAdd = struct {
    arena: std.heap.ArenaAllocator,

    op_channel_id: []const u8,
    op_message_id: []const u8,
    op_author_id: []const u8,
    op_content: []const u8,
    user_id: []const u8,
    emoji_name: ?[]const u8,

    // Get the expected data TypeScript passed us
    pub fn pull() !@This() {
        var arena_state: std.heap.ArenaAllocator = .init(gpa);
        const arena = arena_state.allocator();

        const json = try popString();
        defer gpa.free(json);
        const data = try std.json.parseFromSliceLeaky(struct {
            op_channel_id: []const u8,
            op_message_id: []const u8,
            op_author_id: []const u8,
            op_content: []const u8,
            user_id: []const u8,
            emoji_name: ?[]const u8,
        }, arena, json, .{ .allocate = .alloc_always });

        return .{
            .arena = arena_state,
            .op_channel_id = data.op_channel_id,
            .op_message_id = data.op_message_id,
            .op_author_id = data.op_author_id,
            .op_content = data.op_content,
            .user_id = data.user_id,
            .emoji_name = data.emoji_name,
        };
    }

    pub fn deinit(self: *@This()) void {
        defer self.* = undefined;
        self.arena.deinit();
    }
};
