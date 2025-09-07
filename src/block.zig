const std = @import("std");
const api = @import("api.zig");
const tools = @import("tools.zig");
const Writer = std.Io.Writer;
const unwrap = tools.unwrap;

const block_zig = "```zig\n";
const block_ansi = "```ansi\n";
const block_end = "```";

/// Creates up to max_blocks highlighted zig code blocks
pub fn handle(data: *const api.Message) !void {
    var index: usize = 0;
    while (true) {
        // Locate the next zig block and advance our index
        const tag = std.mem.indexOfPos(u8, data.content, index, block_zig);
        const block = (tag orelse break) + block_zig.len;
        const end = std.mem.indexOfPos(u8, data.content, block, block_end);
        index = (end orelse break) + block_end.len;

        // Highlight & reply the block using ANSI
        const zig_code = data.content[block..end.?];
        var buffer: [4096]u8 = undefined;
        const ansi = try zigToAnsi(zig_code, &buffer);
        api.replyMessage(data.channel_id, data.message_id, ansi);
    }
}

const Color = enum {
    comments, // gray
    literals, // red
    types, // green
    builtins, // yellow
    functions, // blue
    keywords, // magenta
    identifiers, // cyan
    otherwise, // white

    fn update(old: *Color, new: Color, writer: *Writer) !void {
        if (old.* != new) old.* = new else return;
        try writer.writeAll(switch (new) {
            .comments => "\x1b[30m",
            .literals => "\x1b[31m",
            .types => "\x1b[32m",
            .builtins => "\x1b[33m",
            .functions => "\x1b[34m",
            .keywords => "\x1b[35m",
            .identifiers => "\x1b[36m",
            .otherwise => "\x1b[37m",
        });
    }
};

/// Parses zig code and colors the result with ansi escape sequences
fn zigToAnsi(zig_code: []const u8, buffer: *[4096]u8) ![]const u8 {
    // This null delimiter simplifies our parser.
    std.debug.assert(zig_code.len < 4096);
    var delimited: [4096]u8 = undefined;
    @memcpy(&delimited, zig_code);
    delimited[zig_code.len] = 0;
    const source_len = zig_code.len + 1;
    const source = delimited[0..source_len];

    var color: Color = .otherwise;
    var reader: std.Io.Reader = .fixed(source);
    var writer: std.Io.Writer = .fixed(buffer);
    unwrap(writer.writeAll(block_ansi));

    fsa: switch (@as(u32, 0)) {
        0 => { // START
            switch (unwrap(reader.peekByte())) {
                0 => break :fsa, // we reached eof
                '"' => continue :fsa 1,
                '@' => continue :fsa 6,
                '/' => continue :fsa 3,
                '\'' => continue :fsa 2,
                '\\' => continue :fsa 7,
                'A'...'Z' => continue :fsa 4,
                '0'...'9' => continue :fsa 8,
                'a'...'z', '_' => continue :fsa 5,
                ' ', '\n', '\t', '\r' => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                    continue :fsa 0;
                },
                '=', '!', '|', '(', ')', '[', ']' => continue :fsa 9,
                ';', ',', '?', ':', '%', '*', '+', '<' => continue :fsa 9,
                '>', '^', '{', '}', '~', '.', '-', '&' => continue :fsa 9,
                else => {
                    while (true) switch (unwrap(reader.peekByte())) {
                        0, '\n' => continue :fsa 0,
                        else => {
                            const byte = unwrap(reader.takeByte());
                            try writer.writeByte(byte);
                        },
                    };
                },
            }
        },

        1 => { // STRING LITERAL
            try color.update(.literals, &writer);
            const quote = unwrap(reader.takeByte());
            try writer.writeByte(quote);
            while (true) switch (unwrap(reader.peekByte())) {
                0 => break :fsa, // we reached eof
                '\\' => {
                    const escape = unwrap(reader.takeByte());
                    try writer.writeByte(escape);
                    switch (unwrap(reader.peekByte())) {
                        0 => break :fsa, // we reached eof
                        else => {
                            const byte = unwrap(reader.takeByte());
                            try writer.writeByte(byte);
                        },
                    }
                },
                '\"' => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                    continue :fsa 0;
                },
                else => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                },
            };
        },

        2 => { // CHAR LITERAL
            try color.update(.literals, &writer);
            const quote = unwrap(reader.takeByte());
            try writer.writeByte(quote);
            while (true) switch (unwrap(reader.peekByte())) {
                0 => break :fsa, // we reached eof
                '\\' => {
                    const escape = unwrap(reader.takeByte());
                    try writer.writeByte(escape);
                    switch (unwrap(reader.peekByte())) {
                        0 => break :fsa, // we reached eof
                        else => {
                            const byte = unwrap(reader.takeByte());
                            try writer.writeByte(byte);
                        },
                    }
                },
                '\'' => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                    continue :fsa 0;
                },
                else => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                },
            };
        },

        3 => { // COMMENT
            if (unwrap(reader.peek(2))[1] != '/') {
                const byte = unwrap(reader.takeByte());
                try writer.writeByte(byte);
            } else {
                try color.update(.comments, &writer);
                // TODO: how does this interact with the delimiting 0?
                _ = try reader.streamDelimiterEnding(&writer, '\n');
            }

            continue :fsa 0;
        },

        4 => { // TYPE
            try color.update(.types, &writer);
            while (true) switch (unwrap(reader.peekByte())) {
                'a'...'z', 'A'...'Z', '_', '0'...'9' => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                },
                else => continue :fsa 0,
            };
        },

        5 => { // IDENTIFIER
            var is_function: bool = false;
            var length: usize = reader.bufferedLen();

            for (0..reader.bufferedLen()) |index| {
                switch (reader.buffered()[index]) {
                    'a'...'z', '_', '0'...'9' => {},
                    'A'...'Z' => is_function = true,
                    '(' => {
                        is_function = true;
                        length = index;
                        break;
                    },
                    else => {
                        length = index;
                        break;
                    },
                }
            }

            const identifier = unwrap(reader.take(length));

            const new_color: Color = determine: {
                if (isKeyword(identifier)) break :determine Color.keywords;
                if (isPrimitive(identifier)) break :determine Color.types;
                if (isLiteral(identifier)) break :determine Color.literals;
                if (is_function) break :determine Color.functions;
                break :determine Color.identifiers;
            };

            try color.update(new_color, &writer);
            try writer.writeAll(identifier);
            continue :fsa 0;
        },

        6 => { // BUILTIN
            try color.update(.builtins, &writer);
            const at_sign = unwrap(reader.takeByte());
            try writer.writeByte(at_sign);
            while (true) switch (unwrap(reader.peekByte())) {
                'a'...'z', 'A'...'Z', '_', '0'...'9' => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                },
                else => continue :fsa 0,
            };
        },

        7 => { // MULTILINE STRING LITERAL
            if (unwrap(reader.peek(2))[1] != '\\') {
                const byte = unwrap(reader.takeByte());
                try writer.writeByte(byte);
                continue :fsa 0;
            }

            try color.update(.literals, &writer);
            while (true) switch (unwrap(reader.peekByte())) {
                0, '\n' => continue :fsa 0,
                else => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                },
            };
        },

        8 => { // NUMBER
            try color.update(.literals, &writer);
            while (true) switch (unwrap(reader.peekByte())) {
                '0'...'9', 'A'...'F', 'a'...'f', '.', 'x', 'o', '_' => {
                    const byte = unwrap(reader.takeByte());
                    try writer.writeByte(byte);
                },
                else => continue :fsa 0,
            };
        },

        9 => { // OTHERWISE
            try color.update(.otherwise, &writer);
            const byte = unwrap(reader.takeByte());
            try writer.writeByte(byte);
            continue :fsa 0;
        },

        else => unreachable,
    }

    try writer.writeAll(block_end);
    return writer.buffered();
}

const primitives: []const []const u8 = &.{
    "anyerror",       "anyframe",     "anyopaque", "bool",
    "comptime_float", "comptime_int", "f128",      "f16",
    "f32",            "f64",          "f80",       "isize",
    "noreturn",       "type",         "usize",     "void",
};

fn isPrimitive(name: []const u8) bool {
    for (primitives) |primitive| {
        if (std.mem.eql(u8, primitive, name)) {
            return true;
        }
    }

    if (name.len < 2) {
        return false;
    } else if (name[0] != 'i' and name[0] != 'u') {
        return false;
    } else for (name[1..]) |c| {
        if (!tools.isDigit(c)) {
            return false;
        }
    }

    return true;
}

const literals: []const []const u8 = &.{
    "true", "false", "null", "undefined",
};

fn isLiteral(name: []const u8) bool {
    for (literals) |literal| {
        if (std.mem.eql(u8, literal, name)) {
            return true;
        }
    }
    return false;
}

const keywords: []const []const u8 = &.{
    "addrspace",      "align",    "allowzero", "and",
    "anytype",        "asm",      "break",     "callconv",
    "catch",          "comptime", "const",     "continue",
    "defer",          "else",     "enum",      "errdefer",
    "error",          "export",   "extern",    "fn",
    "for",            "if",       "inline",    "noalias",
    "noinline",       "opaque",   "or",        "orelse",
    "packed",         "pub",      "resume",    "return",
    "linksection",    "struct",   "switch",    "test",
    "threadlocal",    "try",      "union",     "unreachable",
    "usingnamespace", "var",      "volatile",  "while",
};

fn isKeyword(name: []const u8) bool {
    for (keywords) |keyword| {
        if (std.mem.eql(u8, keyword, name)) {
            return true;
        }
    }
    return false;
}
