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
    api.fillRandom(buf.ptr, buf.len);
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

export fn handleEventApi() void {
    const string = api.getString();
    io.stdout.print("string: {s}\n", .{string}) catch {};
    io.stdout.flush() catch {};
}

// /// Parameters: one string on the string stack is the user message contents
// /// Return: the number of strings on the stack the OP is to be replied with
// export fn handleMessage() usize {
//     errdefer unreachable;
//
//     const message = api.popString();
//     defer gpa.free(message);
//
//     inline for (&.{
//         handlePing,
//         handleNoU,
//         handleRand,
//         handleShoulds,
//         acr.handleAcr,
//         zig_block.handleZigBlock,
//     }) |handler| {
//         const response = try handler(message);
//         if (response != 0) return response;
//     }
//
//     return 0;
// }
//
// // respond to case-insensitive "ping" with "pong"
// fn handlePing(message: []const u8) !usize {
//     if (tools.insensitiveEql("ping", message)) {
//         try api.pushString("pong");
//         return 1;
//     } else {
//         return 0;
//     }
// }
//
// // respond to case-insensitive "no u" with "no u"
// fn handleNoU(message: []const u8) !usize {
//     if (tools.insensitiveEql("no u", message)) {
//         try api.pushString("no u");
//         return 1;
//     } else {
//         return 0;
//     }
// }
//
// // respond to case-insensitive "rand" command with random u64
// fn handleRand(message: []const u8) !usize {
//     if (tools.startsWith(prefix ++ "rand", message)) {
//         var buffer: [64]u8 = undefined;
//         var writer = std.Io.Writer.fixed(&buffer);
//         try writer.writeAll("Here's your random u64: `0x");
//         try writer.printInt(csprng.int(u64), 16, .upper, .{
//             .width = 16,
//             .fill = '0',
//         });
//         try writer.writeByte('`');
//         try api.pushString(writer.buffered());
//         return 1;
//     } else {
//         return 0;
//     }
// }
//
// // respond to "should i..." and "should we..." with random decision
// fn handleShoulds(message: []const u8) !usize {
//     const should_i = tools.startsWithInsensitive("should i", message);
//     const should_we = tools.startsWithInsensitive("should we", message);
//     if (should_i or should_we) {
//         const choice = csprng.boolean();
//         try api.pushString(if (choice) "yes" else "no");
//         return 1;
//     } else {
//         return 0;
//     }
// }

comptime {
    _ = acr;
    _ = api;
    _ = io;
    _ = tools;
}
