const std = @import("std");
const acr = @import("acr.zig");
const api = @import("api.zig");
const tools = @import("tools.zig");
const block = @import("block.zig");
const unwrap = tools.unwrap;

pub const prefix: []const u8 = ".";
pub const gpa = std.heap.wasm_allocator;
pub const bot_id: []const u8 = "814437814111830027";
pub const csprng: std.Random = .{ .ptr = undefined, .fillFn = fillFn };

// this is a test comment
fn fillFn(_: *anyopaque, buf: []u8) void {
    api.fillRandom(buf);
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

export fn messageCreate() bool {
    if (messageCreateInner()) {
        return true;
    } else |_| {
        return false;
    }
}

fn messageCreateInner() !void {
    var arena: std.heap.ArenaAllocator = .init(gpa);
    defer arena.deinit();

    const json = try api.popString();
    defer gpa.free(json);

    const data: api.Message = try .parse(arena.allocator(), json);

    if (data.is_bot) return;
    try handleNoU(&data);
    try handlePing(&data);
    try handleRand(&data);
    try handle4096(&data);
    try handleShoulds(&data);
    try acr.handleAcr(&data);
    try block.handleZigBlock(&data);
}

// respond to case-insensitive "no u" with "no u"
fn handleNoU(data: *const api.Message) !void {
    if (!tools.insensitiveEql("no u", data.content)) return;
    api.replyMessage(data.channel_id, data.message_id, "no u");
}

// respond to case-insensitive "ping" with "pong"
fn handlePing(data: *const api.Message) !void {
    if (!std.mem.eql(u8, "ping", data.content)) return;
    api.replyMessage(data.channel_id, data.message_id, "pong");
}

// respond to case-insensitive "rand" command with random u64
fn handleRand(data: *const api.Message) !void {
    if (!std.mem.eql(u8, data.content, prefix ++ "rand")) return;

    var buffer: [44]u8 = undefined;
    var writer = std.Io.Writer.fixed(&buffer);

    unwrap(writer.writeAll("Here's your random u64: `0x"));
    const opts: std.fmt.Options = .{ .width = 16, .fill = '0' };
    unwrap(writer.printInt(csprng.int(u64), 16, .upper, opts));
    unwrap(writer.writeByte('`'));

    api.replyMessage(data.channel_id, data.message_id, writer.buffered());
}

// respond to "4096" command with random u4096
fn handle4096(data: *const api.Message) !void {
    if (!std.mem.eql(u8, data.content, prefix ++ "4096")) return;

    var buffer: [1118]u8 = undefined;
    var writer = std.Io.Writer.fixed(&buffer);

    unwrap(writer.writeAll("Here's your random u4096:```"));
    for (0..64) |index| {
        if (index != 0) unwrap(writer.writeByte(' '));
        const opts: std.fmt.Options = .{ .width = 16, .fill = '0' };
        unwrap(writer.printInt(csprng.int(u64), 16, .upper, opts));
    }
    unwrap(writer.writeAll("```"));

    api.replyMessage(data.channel_id, data.message_id, writer.buffered());
}

// respond to "should i/we..." with a random "yes" or "no"
fn handleShoulds(data: *const api.Message) !void {
    const should_i = tools.startsWithInsensitive("should i", data.content);
    const should_we = tools.startsWithInsensitive("should we", data.content);
    if (!(should_i or should_we)) return;
    const reply = if (csprng.boolean()) "yes" else "no";
    api.replyMessage(data.channel_id, data.message_id, reply);
}

comptime {
    _ = acr;
    _ = api;
    _ = tools;
    _ = block;
}
