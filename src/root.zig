const std = @import("std");
const acr = @import("acr.zig");
const api = @import("api.zig");
const rand = @import("rand.zig");
const tools = @import("tools.zig");
const block = @import("block.zig");

pub const cmd_prefix: []const u8 = ".";
pub const gpa = std.heap.wasm_allocator;
pub const bot_id: []const u8 = "814437814111830027";

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
    try handleAsk(&data);
    try rand.handle(&data);
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

// respond to ".ask ..." with a random "yes" or "no"
fn handleAsk(data: *const api.Message) !void {
    const command: []const u8 = cmd_prefix ++ "ask";
    if (!tools.startsWithInsensitive(command, data.content)) return;
    const reply = if (rand.csprng.boolean()) "yes" else "no";
    api.replyMessage(data.channel_id, data.message_id, reply);
}

comptime {
    _ = acr;
    _ = api;
    _ = rand;
    _ = tools;
    _ = block;
}
