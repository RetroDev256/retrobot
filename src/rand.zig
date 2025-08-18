const std = @import("std");
const Writer = std.Io.Writer;
const api = @import("api.zig");
const assert = std.debug.assert;
const cmd_prefix = @import("root.zig").cmd_prefix;
const unwrap = @import("tools.zig").unwrap;

pub const csprng: std.Random = .{ .ptr = undefined, .fillFn = &fillFn };
fn fillFn(_: *anyopaque, buf: []u8) void {
    api.fillRandom(buf);
}

const Base = enum {
    bin,
    oct,
    dec,
    hex,
    b64,

    /// The leading prefix for a number of this base
    fn prefix(comptime self: @This()) []const u8 {
        return switch (self) {
            .bin => "0b",
            .oct => "0o",
            .hex => "0x",
            else => "",
        };
    }

    /// The number of symbols representable with one digit
    fn states(comptime self: @This()) comptime_int {
        return switch (self) {
            .bin => 2,
            .oct => 8,
            .dec => 10,
            .hex => 16,
            .b64 => 64,
        };
    }

    /// Max number of bytes to store a number that could
    /// be represented in 2000 characters of the base.
    fn bufferBytes(comptime self: @This()) comptime_int {
        return switch (self) {
            .bin => 250,
            .oct => 750,
            .dec => 831,
            .hex => 1000,
            .b64 => 1500,
        };
    }

    /// Number of characters required to display some number of bits
    /// The approximation for base-10 is accurate for all 2^16 inputs
    /// Note that .b64 does not include `=` padding (pads to 4 bytes)
    fn displayBytes(comptime self: @This(), bits: u16) u16 {
        return switch (self) {
            .bin => bits,
            .oct => unwrap(std.math.divCeil(u16, bits, 3)),
            .hex => unwrap(std.math.divCeil(u16, bits, 4)),
            .b64 => unwrap(std.math.divCeil(u16, bits, 6)),
            .dec => blk: {
                const numerator = @as(u32, bits) * 12_655;
                const result = std.math.divCeil(u32, numerator, 42_039);
                break :blk @intCast(unwrap(result));
            },
        };
    }

    /// Convert a digit to it's printable character
    fn char(comptime self: @This(), digit: u8) u8 {
        assert(digit < self.states());
        return switch (self) {
            .bin, .oct, .dec => '0' + digit,
            .hex => "0123456789ABCDEF"[digit],
            .b64 => ("ABCDEFGHIJKLMNOPQRSTUVWXYZ" ++
                "abcdefghijklmnopqrstuvwxyz" ++
                "0123456789+/")[digit],
        };
    }

    /// big integer limb division for base conversion
    fn reduce(comptime self: @This(), limbs: []u8) u8 {
        var remainder: usize = 0;
        for (limbs) |*limb| {
            const current_val = (remainder << 8) | limb.*;
            limb.* = @intCast(current_val / self.states());
            remainder = current_val % self.states();
        }
        return @intCast(remainder);
    }
};

const excess_bits = "You have requested too many bits to display.";
const repeat_base = "Format base option may not be repeated.";
const repeat_bits = "Bit count option may not be repeated.";

// respond to case-insensitive "rand" command with random u64
pub fn handle(data: *const api.Message) !void {
    const command: []const u8 = cmd_prefix ++ "rand";
    if (!std.mem.startsWith(u8, data.content, command)) return;

    const c_id = data.channel_id;
    const m_id = data.message_id;

    const toker_options = data.content[command.len..];
    var toker = std.mem.tokenizeScalar(u8, toker_options, ' ');
    var base_arg: ?Base = null;
    var bits_arg: ?u14 = null;

    while (toker.next()) |arg| {
        if (std.fmt.parseInt(u14, arg, 0)) |bits_option| {
            if (bits_arg != null) {
                api.replyMessage(c_id, m_id, repeat_bits);
                return;
            } else {
                bits_arg = bits_option;
            }
        } else |err| switch (err) {
            error.Overflow => {
                api.replyMessage(c_id, m_id, excess_bits);
                return;
            },
            error.InvalidCharacter => {
                if (std.meta.stringToEnum(Base, arg)) |base_parse| {
                    if (base_arg != null) {
                        api.replyMessage(c_id, m_id, repeat_base);
                        return;
                    } else {
                        base_arg = base_parse;
                    }
                } else {
                    const reply = "Unknown option for " ++ command;
                    api.replyMessage(c_id, m_id, reply);
                    return;
                }
            },
        }
    }

    var buffer: [2000]u8 = undefined;
    var writer: Writer = .fixed(&buffer);

    const base: Base = base_arg orelse .hex;
    const bits: u16 = bits_arg orelse 64;

    unwrap(writer.print("Here's your random u{}: ```", .{bits}));
    const write_a = randDispatch(&writer, base, bits) catch null;
    const write_b = writer.writeAll("```") catch null;

    if (write_a == null or write_b == null) {
        api.replyMessage(c_id, m_id, excess_bits);
    } else {
        api.replyMessage(c_id, m_id, writer.buffered());
    }
}

fn randDispatch(writer: *Writer, rt_base: Base, bits: u16) !void {
    switch (rt_base) {
        inline else => |base| {
            // Write the leading prefix for certain bases
            unwrap(writer.writeAll(base.prefix()));

            // Handle the edge case where 0 bits are requested
            if (bits == 0) return switch (base) {
                .b64 => unwrap(writer.writeByte('\n')),
                else => unwrap(writer.writeByte(base.char(0))),
            };

            // Determine how many bytes we are going to use
            const display_bytes = base.displayBytes(bits);
            const used_bytes = unwrap(std.math.divCeil(usize, bits, 8));
            if (used_bytes > base.bufferBytes()) return error.ExcessBits;

            // Fill that number of bytes with random bits
            var buffer: [base.bufferBytes()]u8 = undefined;
            csprng.bytes(buffer[0..used_bytes]);

            // Mask off the top byte so we have the right number of bits
            if (bits % 8 != 0) {
                buffer[0] &= (@as(u8, 1) << @intCast(bits % 8)) - 1;
            }

            // Convert the random bytes to digits of the correct base
            var char_stack: [2000]u8 = undefined;
            for (0..display_bytes) |idx| {
                const rev_idx = char_stack.len - idx - 1;
                const digit = base.reduce(buffer[0..used_bytes]);
                char_stack[rev_idx] = base.char(digit);
            }

            // Write out the converted digits, and pad b64 output with '='s
            const stack_start = char_stack.len - display_bytes;
            try writer.writeAll(char_stack[stack_start..]);
            if (base == .b64) {
                const segments = std.math.divCeil(usize, display_bytes, 4);
                const padding = (4 * unwrap(segments)) - display_bytes;
                try writer.writeAll("==="[0..padding]);
            }
        },
    }
}
