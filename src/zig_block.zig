const std = @import("std");
const api = @import("api.zig");
const tools = @import("tools.zig");
const root = @import("root");

const block_zig = "```zig\n";
const block_ansi = "```ansi\n";
const block_end = "```";

const max_blocks = 3;

pub fn handleZigBlock(data: *const root.MessageCreateData) !void {
    var index: usize = 0;
    for (0..max_blocks) |_| {
        // Locate the next zig block and advance our index
        const tag = std.mem.indexOfPos(u8, data.content, index, block_zig);
        const block = (tag orelse break) + block_zig.len;
        const end = std.mem.indexOfPos(u8, data.content, block, block_end);
        index = (end orelse break) + block_end.len;

        // Highlight & reply the block using ANSI
        const zig_code = data.content[block..end];
        var buffer: [2000]u8 = undefined;
        const ansi = try highlightZig(zig_code, &buffer);
        api.replyMessage(data.channel_id, data.id, ansi);
    }
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

fn highlightZig(zig_code: [:0]const u8, buffer: *[2000]u8) ![]const u8 {
    var writer: std.Io.Writer = .fixed(buffer);
    try writer.writeAll("```ansi\n");

    var last_index: usize = 0;
    var current_color: Color = .white;

    var toker: std.zig.Tokenizer = .init(zig_code);
    while (true) {
        const token = toker.next();
        if (token.tag == .eof) break;
        const token_str = zig_code[token.loc.start..token.loc.end];

        const token_color: Color = switch (token.tag) {
            .identifier,
            => blk: {
                if (tools.isUpper(token_str[0]) or isPrimitive(token_str)) {
                    break :blk .magenta;
                }

                if (zig_code[token.loc.end] == '(') {
                    break :blk .cyan;
                }

                for (token_str) |byte| {
                    if (tools.isUpper(byte)) {
                        break :blk .cyan;
                    }
                }

                break :blk .white;
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
            else => .blue,
        };

        const leading = zig_code[last_index..token.loc.start];
        try writer.writeAll(leading);

        if (token_color != current_color) {
            try writer.writeAll(token_color.code());
            current_color = token_color;
        }

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

fn isPrimitive(name: []const u8) bool {
    inline for (primitives) |primitive| {
        if (std.mem.eql(u8, primitive, name)) {
            return true;
        }
    }

    if (name.len < 2) {
        return false;
    }

    if (name[0] != 'i' and name[0] != 'u') {
        return false;
    }

    for (name[1..]) |c| {
        if (!tools.isDigit(c)) {
            return false;
        }
    }

    return true;
}
