const std = @import("std");
const io = @import("io.zig");
const api = @import("api.zig");
const tools = @import("tools.zig");
const root = @import("root");

const block_zig = "```zig\n";
const block_ansi = "```ansi\n";
const block_ts = "```ts\n";
const block_end = "```";

const max_blocks = 3;

/// Creates up to max_blocks highlighted zig code blocks
pub fn createZigBlock(data: *const api.Message) !void {
    if (data.author_is_bot) return;
    var index: usize = 0;
    for (0..max_blocks) |_| {
        // Locate the next zig block and advance our index
        const tag = std.mem.indexOfPos(u8, data.content, index, block_zig);
        const block = (tag orelse break) + block_zig.len;
        const end = std.mem.indexOfPos(u8, data.content, block, block_end);
        index = (end orelse break) + block_end.len;

        // Highlight & reply the block using ANSI
        const zig_code = data.content[block..end.?];
        var buffer: [2000]u8 = undefined;
        const ansi = try zigToAnsi(zig_code, &buffer);
        api.replyMessage(data.channel_id, data.message_id, ansi);
    }
}

/// Adds reactions onto newly created highlighted zig code blocks
pub fn callbackReactZigBlock(data: *const api.Message) !void {
    if (std.mem.startsWith(u8, data.content, block_ansi)) {
        if (std.mem.eql(u8, data.author_id, root.bot_id)) {
            api.reactMessage(data.channel_id, data.message_id, "♻️");
            api.reactMessage(data.channel_id, data.message_id, "🚯");
        }
    }
}

/// Recycling emoji effect on highlighted blocks (swaps between zig and ts)
pub fn recycleEmojiZigBlock(data: *const api.Reaction) !void {
    if (std.mem.eql(u8, data.user_id, root.bot_id)) return;
    const emoji_name = data.emoji_name orelse return;
    if (!std.mem.eql(u8, emoji_name, "♻️")) return;

    if (std.mem.eql(u8, data.op_author_id, root.bot_id)) {
        if (std.mem.startsWith(u8, data.op_content, block_ansi)) {
            // Convert the ansi block to typescript
            const clip_front = data.op_content[block_ansi.len..];
            const block_length = clip_front.len - block_end.len;
            var buffer: [2000]u8 = undefined;
            const ts = try ansiToTs(clip_front[0..block_length], &buffer);
            api.editMessage(data.op_channel_id, data.op_message_id, ts);
        } else if (std.mem.startsWith(u8, data.op_content, block_ts)) {
            // Convert the typescript block to ansi
            const clip_front = data.op_content[block_ts.len..];
            const block_length = clip_front.len - block_end.len;
            var buffer: [2000]u8 = undefined;
            const ansi = try zigToAnsi(clip_front[0..block_length], &buffer);
            api.editMessage(data.op_channel_id, data.op_message_id, ansi);
        }
    }
}

/// Litter emoji effect on highlighted blocks (conditional deletion of block)
pub fn litterEmojiZigBlock(data: *const api.Reaction) !void {
    if (std.mem.eql(u8, data.user_id, root.bot_id)) return;
    const emoji_name = data.emoji_name orelse return;
    if (!std.mem.eql(u8, emoji_name, "🚯")) return;

    if (std.mem.eql(u8, data.op_author_id, root.bot_id)) {
        // if (data.user_manages_messages) {
        //     // Delete the message if the user has the required permissions
        //     api.deleteMessage(data.op_channel_id, data.op_message_id);
        // } else {
        //     // Delete the message if the original poster requests deletion
        //     const original_author_id = data.op_reply_author_id orelse return;
        //     if (std.mem.eql(u8, data.user_id, original_author_id)) {
        //         api.deleteMessage(data.op_channel_id, data.op_message_id);
        //     }
        // }
    }
}

const Color = enum {
    gray,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,

    const comments: Color = .gray;
    const builtins: Color = .red;
    const dot_literals: Color = .green;
    const functions: Color = .yellow;
    const literals: Color = .blue;
    const keywords: Color = .magenta;
    const types: Color = .cyan;
    const identifiers: Color = .white;
    const otherwise: Color = .white;

    fn code(self: Color) []const u8 {
        return switch (self) {
            .gray => "\x1b[30m",
            .red => "\x1b[31m",
            .green => "\x1b[32m",
            .yellow => "\x1b[33m",
            .blue => "\x1b[34m",
            .magenta => "\x1b[35m",
            .cyan => "\x1b[36m",
            .white => "\x1b[37m",
        };
    }
};

/// Filters out ansi escape sequences "\x1b[31m" to "\x1b[37m",
/// returning the result as a typescript code block ("```ts\n")
fn ansiToTs(code: []const u8, buffer: *[2000]u8) ![]const u8 {
    var writer: std.Io.Writer = .fixed(buffer);
    try writer.writeAll(block_ts);

    var index: usize = 0;
    scan: while (std.mem.indexOfScalarPos(u8, code, index, '\x1b')) |next| {
        try writer.writeAll(code[index..next]);
        index += next - index;

        inline for (@typeInfo(Color).@"enum".fields) |field| {
            const value: Color = @enumFromInt(field.value);
            if (std.mem.startsWith(u8, code[next..], value.code())) {
                index += value.code().len;
                continue :scan;
            }
        }

        try writer.writeByte(code[next]);
        index += 1;
    }

    try writer.writeAll(code[index..]);
    try writer.writeAll(block_end);
    return writer.buffered();
}

// Tokenizer state for parsing zig
const State = enum {
    start,
    string,
    char,
    comment,
    type,
    identifier,
    builtin,
    string_literal,
    number,
    dot_literal,
    other,
};

/// Parses zig code and colors the result with ansi escape sequences
fn zigToAnsi(zig_code: []const u8, buffer: *[2000]u8) ![]const u8 {
    // This null delimiter simplifies our parser.
    var delimited_code: [2000]u8 = undefined;
    @memcpy(&delimited_code, zig_code);
    delimited_code[zig_code.len] = 0;

    var color: Color = .white;
    var reader: std.Io.Reader = .fixed(&delimited_code);
    var writer: std.Io.Writer = .fixed(buffer);
    try writer.writeAll(block_ansi);

    fsa: switch (@as(State, .start)) {
        // initial state - no tokens seen yet.
        .start => switch (try reader.peekByte()) {
            0 => break :fsa, // we reached eof
            ' ', '\n', '\t', '\r' => {
                try writer.writeByte(try reader.takeByte());
                switch (try reader.peekByte()) {
                    '.' => continue :fsa .dot_literal,
                    else => continue :fsa .start,
                }
            },
            '"' => continue :fsa .string,
            '\'' => continue :fsa .char,
            '/' => continue :fsa .comment,
            'A'...'Z' => continue :fsa .type,
            'a'...'z', '_' => continue :fsa .identifier,
            '@' => continue :fsa .builtin,
            '\\' => continue :fsa .string_literal,
            '0'...'9' => continue :fsa .number,
            '=', '!', '|', '(', ')', '[', ']', ';' => continue :fsa .other,
            ',', '?', ':', '%', '*', '+', '<', '>' => continue :fsa .other,
            '^', '{', '}', '~', '.', '-', '&' => continue :fsa .other,
            else => {
                // we don't know what the token is right now
                _ = try reader.streamDelimiterEnding(&writer, '\n');
                continue :fsa .start;
            },
        },
        // we've seen the '"' byte, starting a string
        .string => {
            // Update the color if it needs to be changed
            if (color != Color.literals) {
                color = Color.literals;
                try writer.writeAll(color.code());
            }

            try writer.writeByte(try reader.takeByte());
            while (true) {
                switch (try reader.peekByte()) {
                    0 => break :fsa, // we reached eof
                    '\\' => {
                        try writer.writeAll(try reader.take(2));
                    },
                    '"' => {
                        try writer.writeByte(try reader.takeByte());
                        continue :fsa .start;
                    },
                    else => {
                        try writer.writeByte(try reader.takeByte());
                    },
                }
            }
        },
        // we've seen the '\'' byte, starting a character
        .char => {
            // Update the color if it needs to be changed
            if (color != Color.literals) {
                color = Color.literals;
                try writer.writeAll(color.code());
            }

            try writer.writeByte(try reader.takeByte());
            while (true) {
                switch (try reader.peekByte()) {
                    0 => break :fsa, // we reached eof
                    '\\' => {
                        try writer.writeAll(try reader.take(2));
                    },
                    '\'' => {
                        try writer.writeByte(try reader.takeByte());
                        continue :fsa .start;
                    },
                    else => {
                        try writer.writeByte(try reader.takeByte());
                    },
                }
            }
        },
        // we've seen '/', potentially starting a comment
        .comment => {
            // Handling the two cases in which '/' is not a comment:
            if ((try reader.peek(2))[1] != '/') {
                try writer.writeByte(try reader.takeByte());
                continue :fsa .start;
            }

            // Update the color if it needs to be changed
            if (color != Color.comments) {
                color = Color.comments;
                try writer.writeAll(color.code());
            }
            _ = try reader.streamDelimiterEnding(&writer, '\n');
            continue :fsa .start;
        },
        // we've seen an uppercase letter, starting a type
        .type => {
            // Update the color if it needs to be changed
            if (color != Color.types) {
                color = Color.types;
                try writer.writeAll(color.code());
            }

            while (true) {
                switch (try reader.peekByte()) {
                    0 => break :fsa, // we reached eof
                    'a'...'z', 'A'...'Z', '_', '0'...'9' => {
                        try writer.writeByte(try reader.takeByte());
                    },
                    else => continue :fsa .start,
                }
            }
        },
        // we've seen 'a'...'z' or '_', starting an identifier
        .identifier => {
            // Find the length of the identifier, and if it is a function
            var is_function: bool = false;
            const length: usize = scan: {
                for (reader.buffered(), 0..) |byte, index| {
                    switch (byte) {
                        'a'...'z', '_', '0'...'9' => {},
                        'A'...'Z' => is_function = true,
                        '(' => {
                            is_function = true;
                            break :scan index;
                        },
                        else => break :scan index,
                    }
                }
                break :scan reader.bufferedLen();
            };

            const identifier = try reader.take(length);

            const new_color: Color = determine: {
                if (isKeyword(identifier)) break :determine Color.keywords;
                if (isPrimitive(identifier)) break :determine Color.types;
                if (isLiteral(identifier)) break :determine Color.literals;
                if (is_function) break :determine Color.functions;
                break :determine Color.identifiers;
            };

            // Update the color if it needs to be changed
            if (color != new_color) {
                color = new_color;
                try writer.writeAll(color.code());
            }

            // Flush the identifier & continue
            try writer.writeAll(identifier);
            continue :fsa .start;
        },
        // we've seen @, starting a builtin - we don't care about identifiers
        .builtin => {
            // Update the color if it needs to be changed
            if (color != Color.builtins) {
                color = Color.builtins;
                try writer.writeAll(color.code());
            }

            try writer.writeByte(try reader.takeByte());
            while (true) {
                switch (try reader.peekByte()) {
                    'a'...'z', 'A'...'Z', '_', '0'...'9' => {
                        try writer.writeByte(try reader.takeByte());
                    },
                    else => continue :fsa .start,
                }
            }
        },
        // we've seen '\\', potentially starting a string literal
        .string_literal => {
            // Handling the two cases in which '\' is not a comment:
            if ((try reader.peek(2))[1] != '\\') {
                try writer.writeByte(try reader.takeByte());
                continue :fsa .start;
            }

            // Update the color if it needs to be changed
            if (color != Color.literals) {
                color = Color.literals;
                try writer.writeAll(color.code());
            }
            _ = try reader.streamDelimiterEnding(&writer, '\n');
            continue :fsa .start;
        },
        // we've seen '0'...'9', starting a number
        .number => {
            // Update the color if it needs to be changed
            if (color != Color.literals) {
                color = Color.literals;
                try writer.writeAll(color.code());
            }

            while (true) {
                switch (try reader.peekByte()) {
                    '0'...'9', 'A'...'F', 'a'...'f', '.', 'x', 'o', '_' => {
                        try writer.writeByte(try reader.takeByte());
                    },
                    else => continue :fsa .start,
                }
            }
        },
        // we've seen " .", possibly starting a dot literal
        .dot_literal => {
            // Handle the case in which we don't have a literal
            switch ((try reader.peek(2))[1]) {
                'a'...'z', 'A'...'Z', '_' => {},
                else => continue :fsa .start,
            }

            // Update the color if it needs to be changed
            if (color != Color.dot_literals) {
                color = Color.dot_literals;
                try writer.writeAll(color.code());
            }

            try writer.writeAll(try reader.take(2));
            while (true) {
                switch (try reader.peekByte()) {
                    'a'...'z', 'A'...'Z', '_', '0'...'9' => {
                        try writer.writeByte(try reader.takeByte());
                    },
                    else => continue :fsa .start,
                }
            }
        },
        // we just need to chew through these other symbols
        .other => {
            // Update the color if it needs to be changed
            if (color != Color.otherwise) {
                color = Color.otherwise;
                try writer.writeAll(color.code());
            }

            try writer.writeByte(try reader.takeByte());
            continue :fsa .start;
        },
    }

    try writer.writeAll(block_end);
    return writer.buffered();
}

const primitives: []const []const u8 = &.{
    "anyerror",    "anyframe", "anyopaque",      "bool",
    "c_int",       "c_long",   "c_longdouble",   "c_longlong",
    "c_char",      "c_short",  "c_uint",         "c_ulong",
    "c_ulonglong", "c_ushort", "comptime_float", "comptime_int",
    "f128",        "f16",      "f32",            "f64",
    "f80",         "isize",    "noreturn",       "type",
    "usize",       "void",
};

fn isPrimitive(name: []const u8) bool {
    for (primitives) |primitive| {
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
