const std = @import("std");
const api = @import("api.zig");
const io = @import("io.zig");
const tools = @import("tools.zig");
const root = @import("root");
const prefix = root.prefix;
const gpa = root.gpa;

const List = std.ArrayListUnmanaged;
var words: [26][]const []const u8 = undefined;

pub fn init() !void {
    words = try splitList(io.readFile("words.txt"));
}

fn splitList(text: []const u8) ![26][]const []const u8 {
    var letter_lists: [26]List([]const u8) = @splat(.empty);
    defer for (&letter_lists) |*list| list.deinit(gpa);

    var toker = std.mem.tokenizeScalar(u8, text, '\n');
    while (toker.next()) |word| {
        const letter = word[0] - 'a';
        try letter_lists[letter].append(gpa, word);
    }

    var owned: usize = 0;
    var lists: [26][]const []const u8 = undefined;
    errdefer for (lists[0..owned]) |list| gpa.free(list);
    for (&letter_lists, &lists) |*src, *dest| {
        dest.* = try src.toOwnedSlice(gpa);
        owned += 1;
    }

    return lists;
}

pub fn handleAcr(message: []const u8) !usize {
    const command = prefix ++ "acr ";
    if (!tools.startsWith(command, message)) return 0;

    const acronym = message[command.len..];
    var msg_buffer: [2000]u8 = undefined;
    var msg_length: usize = 0;

    for (acronym) |byte| {
        const letter: u8 = byte -% 'a';
        if (letter < 26) {
            const prng: std.Random = root.csprng;
            const options = words[letter].len;
            const choice = prng.intRangeLessThan(usize, 0, options);
            const word = words[letter][choice];

            if (msg_length + word.len >= 2000) break;
            msg_buffer[msg_length] = ' ';
            @memcpy(msg_buffer[msg_length + 1 ..][0..word.len], word);
            msg_length += word.len + 1;
        }
    }

    if (msg_length != 0) {
        try api.pushString(msg_buffer[0..msg_length]);
        return 1;
    } else {
        return 0;
    }
}
