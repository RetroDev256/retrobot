const std = @import("std");
const api = @import("api.zig");
const tools = @import("tools.zig");
const gpa = @import("root").gpa;

pub fn handleZigBlock(message: []const u8) !usize {
    var response: usize = 0;
    errdefer for (0..response) |_| {
        gpa.free(api.popString());
    };

    var last_idx: usize = 0;
    while (tools.indexOf(message, last_idx, "```zig\n")) |start_idx| {
        if (tools.indexOf(message, start_idx + 7, "```")) |end_idx| {
            const zig_code = message[start_idx + 7 .. end_idx];
            if (zig_code.len > 0 and zig_code.len < 2000) {
                // The Zig tokenizer expects 0-delimited memory
                var delimit_buffer: [2000]u8 = undefined;
                @memcpy(delimit_buffer[0..zig_code.len], zig_code);
                delimit_buffer[zig_code.len] = 0;
                const delimited = delimit_buffer[0..zig_code.len :0];

                var block_buffer: [2000]u8 = undefined;
                if (colorAnsiZig(delimited, &block_buffer)) |ansi_block| {
                    try api.pushString(ansi_block);
                    response += 1;
                } else |_| {}
            }
            last_idx = end_idx + 3;
        } else break;
    }

    return response;
}

const Color = enum {
    white,
    red,
    yellow,
    green,
    cyan,
    blue,
    magenta,

    fn code(self: Color) []const u8 {
        return switch (self) {
            .white => "\x1b[37m",
            .red => "\x1b[31m",
            .yellow => "\x1b[33m",
            .green => "\x1b[32m",
            .cyan => "\x1b[36m",
            .blue => "\x1b[34m",
            .magenta => "\x1b[35m",
        };
    }
};

fn colorAnsiZig(zig_code: [:0]const u8, buffer: *[2000]u8) ![]const u8 {
    var writer: std.Io.Writer = .fixed(buffer);
    try writer.writeAll("```ansi\n");

    var last_index: usize = 0;
    var current_color: Color = .white;

    var toker: std.zig.Tokenizer = .init(zig_code);
    while (true) {
        const token = toker.next();
        if (token.tag == .eof) break;

        const token_color: Color = switch (token.tag) {
            .identifier,
            => blk: {
                const slice = zig_code[token.loc.start..token.loc.end];

                if (tools.isUpper(slice[0]) or isPrimitive(slice)) {
                    break :blk .magenta;
                }

                if (zig_code[token.loc.end] == '(') {
                    break :blk .cyan;
                }

                for (slice) |byte| {
                    if (tools.isUpper(byte)) {
                        break :blk .cyan;
                    }
                }

                break :blk .blue;
            },
            .string_literal,
            .multiline_string_literal_line,
            .char_literal,
            .number_literal,
            => .green,
            .builtin,
            => .red,
            .keyword_addrspace,
            .keyword_align,
            .keyword_allowzero,
            .keyword_and,
            .keyword_anyframe,
            .keyword_anytype,
            .keyword_asm,
            .keyword_break,
            .keyword_callconv,
            .keyword_catch,
            .keyword_comptime,
            .keyword_const,
            .keyword_continue,
            .keyword_defer,
            .keyword_else,
            .keyword_enum,
            .keyword_errdefer,
            .keyword_error,
            .keyword_export,
            .keyword_extern,
            .keyword_fn,
            .keyword_for,
            .keyword_if,
            .keyword_inline,
            .keyword_noalias,
            .keyword_noinline,
            .keyword_nosuspend,
            .keyword_opaque,
            .keyword_or,
            .keyword_orelse,
            .keyword_packed,
            .keyword_pub,
            .keyword_resume,
            .keyword_return,
            .keyword_linksection,
            .keyword_struct,
            .keyword_suspend,
            .keyword_switch,
            .keyword_test,
            .keyword_threadlocal,
            .keyword_try,
            .keyword_union,
            .keyword_unreachable,
            .keyword_var,
            .keyword_volatile,
            .keyword_while,
            => .yellow,
            else => .white,
        };

        if (token_color != current_color) {
            try writer.writeAll(token_color.code());
            current_color = token_color;
        }

        const token_str = zig_code[last_index..token.loc.end];
        try writer.writeAll(token_str);
        last_index = token.loc.end;
    }

    try writer.writeAll("```");
    return writer.buffered();
}

const primitives = &.{
    "anyerror",    "anyframe", "anyopaque",      "bool",
    "c_int",       "c_long",   "c_longdouble",   "c_longlong",
    "c_char",      "c_short",  "c_uint",         "c_ulong",
    "c_ulonglong", "c_ushort", "comptime_float", "comptime_int",
    "f128",        "f16",      "f32",            "f64",
    "f80",         "false",    "isize",          "noreturn",
    "null",        "true",     "type",           "undefined",
    "usize",       "void",
};

pub fn isPrimitive(name: []const u8) bool {
    inline for (primitives) |primitive| {
        if (tools.eql(primitive, name)) {
            return true;
        }
    }
    if (name.len < 2) return false;
    const first_c = name[0];
    if (first_c != 'i' and first_c != 'u') return false;
    for (name[1..]) |c| switch (c) {
        '0'...'9' => {},
        else => return false,
    };
    return true;
}
