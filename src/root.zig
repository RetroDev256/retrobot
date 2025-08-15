const std = @import("std");
const acr = @import("acr.zig");
const api = @import("api.zig");
const io = @import("io.zig");
const tools = @import("tools.zig");
const zig_block = @import("zig_block.zig");

pub const prefix: []const u8 = ".";
pub const gpa = std.heap.wasm_allocator;
pub const csprng: std.Random = .{ .ptr = undefined, .fillFn = fillFn };

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
export fn init() void {
    acr.init() catch unreachable;
}

const GatewayPayload = struct {
    d: std.json.Value,
    t: ?[]const u8,
    // Some fields omitted
};

const Author = struct {
    username: []const u8,
    id: []const u8,
    bot: ?bool,
    // Some fields omitted
};

const ReferencedMessage = struct {
    channel_id: []const u8,
    content: []const u8,
    id: []const u8,
    author: Author,
    // Some fields omitted
};

const MessageReference = struct {
    message_id: ?[]const u8,
    channel_id: ?[]const u8,
    guild_id: ?[]const u8,
    // Some fields omitted
};

pub const MessageCreateData = struct {
    referenced_message: ?ReferencedMessage,
    message_reference: ?MessageReference,
    mention_everyone: bool,
    channel_id: []const u8,
    guild_id: ?[]const u8,
    content: []const u8,
    mentions: []Author,
    id: []const u8,
    author: Author,
    // Some fields omitted
};

const Emoji = struct {
    name: []const u8,
    id: ?[]const u8,
    // Some fields omitted
};

pub const MessageReactionAddData = struct {
    message_author_id: ?[]const u8,
    channel_id: []const u8,
    message_id: []const u8,
    guild_id: ?[]const u8,
    user_id: []const u8,
    emoji: Emoji,
    // Some fields omitted
};

fn handleError(err: anytype) void {
    switch (err) {
        inline else => |known| {
            io.stdout.print("Zig Error: {t}\n", .{known}) catch {};
            io.stdout.flush() catch {};
        },
    }
}

export fn handleEvent() void {
    var arena_state: std.heap.ArenaAllocator = .init(gpa);
    defer arena_state.deinit();

    const arena = arena_state.allocator();
    const event = api.getString();

    // Parse the raw event so we know what type of event we have
    const gateway_payload = std.json.parseFromSliceLeaky(
        GatewayPayload,
        arena,
        event,
        .{
            .ignore_unknown_fields = true,
            .allocate = .alloc_always,
        },
    ) catch |err| return handleError(err);

    // Some events do not have a message type
    const event_type = gateway_payload.t orelse return;

    // Handle message creation events with handleMessageCreate
    if (std.mem.eql(u8, "MESSAGE_CREATE", event_type)) {
        handleMessageCreate(
            &(std.json.parseFromValueLeaky(
                MessageCreateData,
                arena,
                gateway_payload.d,
                .{ .ignore_unknown_fields = true },
            ) catch |err| return handleError(err)),
        ) catch |err| return handleError(err);
    }

    // Handle emoji reaction add events with handleEmojiReactionAdd
    if (std.mem.eql(u8, "MESSAGE_REACTION_ADD", event_type)) {
        handleEmojiReactionAdd(
            &(std.json.parseFromValueLeaky(
                MessageReactionAddData,
                arena,
                gateway_payload.d,
                .{ .ignore_unknown_fields = true },
            ) catch |err| return handleError(err)),
        ) catch |err| return handleError(err);
    }

    io.stdout.print("EVENT: {s}\n\n", .{event}) catch {};
    io.stdout.flush() catch {};
}

fn handleMessageCreate(data: *const MessageCreateData) !void {
    if (data.author.bot == true) return;

    inline for (&.{
        handlePing,
        handleNoU,
        handleRand,
        handleShoulds,
        acr.handleAcr,
        zig_block.handleZigBlock,
    }) |handler| {
        handler(data) catch |err| handleError(err);
    }
}

// respond to case-insensitive "ping" with "pong"
fn handlePing(data: *const MessageCreateData) !void {
    if (std.mem.eql(u8, "ping", data.content)) {
        api.replyMessage(data.channel_id, data.id, "pong");
    }
}

// respond to case-insensitive "no u" with "no u"
fn handleNoU(data: *const MessageCreateData) !void {
    if (tools.insensitiveEql("no u", data.content)) {
        api.replyMessage(data.channel_id, data.id, "no u");
    }
}

// respond to case-insensitive "rand" command with random u64
fn handleRand(data: *const MessageCreateData) !void {
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
        api.replyMessage(data.channel_id, data.id, reply);
    }
}

// respond to "should i..." and "should we..." with random decision
fn handleShoulds(data: *const MessageCreateData) !void {
    const should_i = tools.startsWithInsensitive("should i", data.content);
    const should_we = tools.startsWithInsensitive("should we", data.content);
    if (should_i or should_we) {
        const reply = if (csprng.boolean()) "yes" else "no";
        api.replyMessage(data.channel_id, data.id, reply);
    }
}

fn handleEmojiReactionAdd(data: *const MessageReactionAddData) !void {
    _ = data;
}

comptime {
    _ = acr;
    _ = api;
    _ = io;
    _ = tools;
}
