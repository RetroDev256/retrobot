const std = @import("std");
const api = @import("api.zig");
const io = @import("io.zig");
const rng = @import("rng.zig");

const cmd_prefix: []const u8 = ".";
pub const gpa = std.heap.wasm_allocator;

/// Compares two strings
inline fn eqlString(a: []const u8, b: []const u8) bool {
    return std.mem.eql(u8, a, b);
}

/// Compares two strings case-insensitively.
fn eqlInsensitive(a: []const u8, comptime b: []const u8) bool {
    if (a.len != b.len) return false;
    inline for (a, b) |byte_a, byte_b| {
        const lower_a = std.ascii.toLower(byte_a);
        const lower_b = comptime std.ascii.toLower(byte_b);
        if (lower_a != lower_b) return false;
    }
    return true;
}

/// std.mem.startsWith but case-insensitive comparison.
fn startsWithInsensitive(a: []const u8, comptime b: []const u8) bool {
    if (a.len < b.len) return false;
    return eqlInsensitive(a[0..b.len], b);
}

/// Parameters: one string on the string stack is the user message contents
/// Return: the number of strings on the stack the OP is to be replied with
export fn handleMessage() usize {
    errdefer |err| io.handle(err);
    const message = api.popString();
    defer gpa.free(message);

    // respond to case-insensitive "ping" with "pong"
    if (eqlInsensitive(message, "ping")) {
        try api.pushString("pong");
        return 1;
    }

    // respond to case insensitive "no u" with "no u"
    if (eqlInsensitive(message, "no u")) {
        try api.pushString("no u");
        return 1;
    }

    // respond to "should i..." and "should we..." with random decision
    const should_i = startsWithInsensitive(message, "should i");
    const should_we = startsWithInsensitive(message, "should we");
    if (should_i or should_we) {
        const choice = rng.csprng.boolean();
        try api.pushString(if (choice) "yes" else "no");
        return 1;
    }

    // respond to "rand" command with random u64
    if (eqlString(message, cmd_prefix ++ "rand")) {
        var buffer: [64]u8 = undefined;
        var writer = std.Io.Writer.fixed(&buffer);
        try writer.writeAll("Here's your random u64: 0x");
        try writer.printInt(rng.csprng.int(u64), 16, .upper, .{});
        try api.pushString(writer.buffered());
        return 1;
    }

    return 0;
}

comptime {
    _ = api;
    _ = io;
    _ = rng;
}
