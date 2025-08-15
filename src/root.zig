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
    t: ?[]const u8 = null,
    d: std.json.Value,
    // Some fields omitted
};

const Author = struct {
    id: []const u8,
    username: []const u8,
    bot: ?bool = null,
    // Some fields omitted
};

const ReferencedMessage = struct {
    id: []const u8,
    channel_id: []const u8,
    content: []const u8,
    author: Author,
    // Some fields omitted
};

const MessageReference = struct {
    message_id: ?[]const u8 = null,
    channel_id: ?[]const u8 = null,
    guild_id: ?[]const u8 = null,
    // Some fields omitted
};

pub const MessageCreateData = struct {
    id: []const u8,
    channel_id: []const u8,
    guild_id: ?[]const u8 = null,
    author: Author,
    content: []const u8,
    mention_everyone: bool,
    mentions: []Author,
    referenced_message: ?ReferencedMessage = null,
    message_reference: ?MessageReference = null,
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

    // io.stdout.print("EVENT: {s}\n\n", .{event}) catch {};
    // io.stdout.flush() catch {};
}

fn handleMessageCreate(data: *const MessageCreateData) !void {
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
        api.replyMessage(data.channel_id, data.id, "no");
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

comptime {
    _ = acr;
    _ = api;
    _ = io;
    _ = tools;
}
