const std = @import("std");
const acr = @import("acr.zig");
const api = @import("api.zig");
const io = @import("io.zig");
const tools = @import("tools.zig");
const zig_block = @import("zig_block.zig");

pub const bot_id: []const u8 = "814437814111830027";
pub const prefix: []const u8 = ".";
pub const gpa = std.heap.wasm_allocator;
pub const csprng: std.Random = .{ .ptr = undefined, .fillFn = fillFn };

fn fillFn(_: *anyopaque, buf: []u8) void {
    api.fillRandom(buf) catch |err| {
        handle(err, @src());
        @trap();
    };
}

fn handle(err: anytype, src: std.builtin.SourceLocation) void {
    switch (err) {
        inline else => |known| {
            io.stdout.print(
                "Zig Error: {t} in {s} at {}:{}\n",
                .{ known, src.file, src.line, src.column },
            ) catch {};
            io.stdout.flush() catch {};
        },
    }
}

// TODO: .emojis (not sure if I want to do this one)
// TODO: .randimg (random 256x256 grayscale image)
// TODO: .maze (generate random maze)
// TODO: .calc EXPR (evaluate EXPR)
// TODO: .say MSG (parrot MSG)
// TODO: .info ID/Mention (get user info)
// TODO: .msg ID/Mention MSG (DM MSG to user)
// TODO: .bf PROG (evaluate BF program (limited))
// TODO: .hex TEXT/FILE (encode base-16 UTF-8)
// TODO: .b64 TEXT/FILE (encode base-64 UTF-8)
// TODO: .hex-d TEXT/FILE (decode base-16 UTF-8)
// TODO: .b64-d TEXT/FILE (decode base-64 UTF-8)
// TODO: .qr TEXT/FILE (generate QR code (binary?))

// Must be called before any handling code
export fn init() bool {
    if (acr.init()) {
        return true;
    } else |_| {
        return false;
    }
}

export fn messageCreate() void {
    const data_pull = api.MessageCreate.pull();
    var data = data_pull catch |err| return handle(err, @src());
    defer data.deinit();

    inline for (&.{
        handlePing,
        handleNoU,
        handleRand,
        handleShoulds,
        acr.handleAcr,
        zig_block.createZigBlock,
        zig_block.callbackReactZigBlock,
    }) |handler| {
        handler(&data) catch |err| handle(err, @src());
    }
}

// respond to case-insensitive "ping" with "pong"
fn handlePing(data: *const api.MessageCreate) !void {
    if (data.author_is_bot) return;
    if (std.mem.eql(u8, "ping", data.content)) {
        api.replyMessage(data.channel_id, data.message_id, "pong");
    }
}

// respond to case-insensitive "no u" with "no u"
fn handleNoU(data: *const api.MessageCreate) !void {
    if (data.author_is_bot) return;
    if (tools.insensitiveEql("no u", data.content)) {
        api.replyMessage(data.channel_id, data.message_id, "no u");
    }
}

// respond to case-insensitive "rand" command with random u64
fn handleRand(data: *const api.MessageCreate) !void {
    if (data.author_is_bot) return;
    if (std.mem.startsWith(u8, data.content, prefix ++ "rand")) {
        var buffer: [64]u8 = undefined;
        var writer = std.Io.Writer.fixed(&buffer);
        try writer.writeAll("Here's your random u64: `0x");
        try writer.printInt(csprng.int(u64), 16, .upper, .{
            .width = 16,
            .fill = '0',
        });
        try writer.writeByte('`');
        const reply = writer.buffered();
        api.replyMessage(data.channel_id, data.message_id, reply);
    }
}

// respond to "should i..." and "should we..." with random decision
fn handleShoulds(data: *const api.MessageCreate) !void {
    if (data.author_is_bot) return;
    const should_i = tools.startsWithInsensitive("should i", data.content);
    const should_we = tools.startsWithInsensitive("should we", data.content);
    if (should_i or should_we) {
        const reply = if (csprng.boolean()) "yes" else "no";
        api.replyMessage(data.channel_id, data.message_id, reply);
    }
}

export fn reactionAdd() void {
    const data_pull = api.ReactionAdd.pull();
    var data = data_pull catch |err| return handle(err, @src());
    defer data.deinit();

    inline for (&.{
        zig_block.recycleEmojiZigBlock,
        zig_block.litterEmojiZigBlock,
    }) |handler| {
        handler(&data) catch |err| handle(err, @src());
    }
}

comptime {
    _ = acr;
    _ = api;
    _ = io;
    _ = tools;
    _ = zig_block;
}
