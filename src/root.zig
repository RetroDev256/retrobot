const std = @import("std");
const acr = @import("acr.zig");
const api = @import("api.zig");
const tools = @import("tools.zig");
const block = @import("block.zig");

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
    } else |_| return false;
}

fn messageCreateInner() !void {
    var arena: std.heap.ArenaAllocator = .init(gpa);
    defer arena.deinit();

    const json = try api.popString();
    defer gpa.free(json);

    const data: api.Message = try .parse(arena.allocator(), json);

    // Handle both both and user messages here
    try callbackLitterReact(&data);
    try block.callbackReactZigBlock(&data);

    // We can only handle user messages here
    if (data.is_bot) return;

    try handlePing(&data);
    try handleNoU(&data);
    try handleRand(&data);
    try handleShouldI(&data);
    try handleShouldWe(&data);
    try acr.handleAcr(&data);
    try block.createZigBlocks(&data);
}

// respond to case-insensitive "ping" with "pong"
fn handlePing(data: *const api.Message) !void {
    if (!std.mem.eql(u8, "ping", data.content)) return;
    api.replyMessage(data.channel_id, data.message_id, "pong");
}

// respond to case-insensitive "no u" with "no u"
fn handleNoU(data: *const api.Message) !void {
    if (!tools.insensitiveEql("no u", data.content)) return;
    api.replyMessage(data.channel_id, data.message_id, "no u");
}

// respond to case-insensitive "rand" command with random u64
fn handleRand(data: *const api.Message) !void {
    if (!std.mem.startsWith(u8, data.content, prefix ++ "rand")) return;

    var buffer: [64]u8 = undefined;
    var writer = std.Io.Writer.fixed(&buffer);

    try writer.writeAll("Here's your random u64: `0x");
    const opts: std.fmt.Options = .{ .width = 16, .fill = '0' };
    try writer.printInt(csprng.int(u64), 16, .upper, opts);
    try writer.writeByte('`');

    api.replyMessage(data.channel_id, data.message_id, writer.buffered());
}

// respond to "should i..." with a random "yes" or "no"
fn handleShouldI(data: *const api.Message) !void {
    if (!tools.startsWithInsensitive("should i", data.content)) return;
    const reply = if (csprng.boolean()) "yes" else "no";
    api.replyMessage(data.channel_id, data.message_id, reply);
}

// respond to "should we..." with a random "yes" or "no"
fn handleShouldWe(data: *const api.Message) !void {
    if (!tools.startsWithInsensitive("should we", data.content)) return;
    const reply = if (csprng.boolean()) "yes" else "no";
    api.replyMessage(data.channel_id, data.message_id, reply);
}

/// Adds litter reaction onto newly created messages (so users can delete them)
fn callbackLitterReact(data: *const api.Message) !void {
    // The message should only be "littered" if sent by the bot
    if (!std.mem.eql(u8, data.author_id, bot_id)) return;
    api.reactMessage(data.channel_id, data.message_id, "🚯");
}

export fn reactionAdd() bool {
    if (reactionAddInner()) {
        return true;
    } else |_| return false;
}

fn reactionAddInner() !void {
    var arena: std.heap.ArenaAllocator = .init(gpa);
    defer arena.deinit();

    const json = try api.popString();
    defer gpa.free(json);

    const data: api.Reaction = try .parse(arena.allocator(), json);

    try litterEmojiDelete(&data);
    try block.recycleEmojiZigBlock(&data);
}

/// Litter emoji effect on highlighted blocks (conditional deletion of block)
fn litterEmojiDelete(data: *const api.Reaction) !void {
    // The message should not be deleted if the bot added the reaction
    if (std.mem.eql(u8, data.user_id, bot_id)) return;
    // The message should only be deleted if the reaction is 🚯
    if (!std.mem.eql(u8, data.emoji orelse return, "🚯")) return;
    // The message should only be deleted if the message was sent by the bot
    if (!std.mem.eql(u8, data.author_id, bot_id)) return;

    api.deleteMessage(data.channel_id, data.message_id);
}

comptime {
    _ = acr;
    _ = api;
    _ = tools;
    _ = block;
}
