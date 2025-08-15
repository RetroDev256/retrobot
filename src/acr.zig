const std = @import("std");
const api = @import("api.zig");
const io = @import("io.zig");
const tools = @import("tools.zig");
const root = @import("root");
const prefix = root.prefix;
const gpa: std.mem.Allocator = root.gpa;

var words: [26][]const []const u8 = undefined;

pub fn init() !void {
    const content = io.readFile("words.txt");
    const content_owned = try gpa.dupe(u8, content);
    errdefer gpa.free(content_owned);
    words = try splitList(content_owned);
}

fn splitList(text: []const u8) ![26][]const []const u8 {
    var letter_lists: [26]std.ArrayListUnmanaged([]const u8) = @splat(.empty);
    defer for (&letter_lists) |*list| list.deinit(gpa);

    var toker = std.mem.tokenizeScalar(u8, text, '\n');
    while (toker.next()) |word| {
        const letter = tools.toLower(word[0]) - 'a';
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

pub fn handleAcr(data: *const root.MessageCreateData) !void {
    const command = prefix ++ "acr ";
    if (!std.mem.startsWith(u8, data.content, command)) return;

    const acronym = data.content[command.len..];
    var msg_buffer: [2000]u8 = undefined;
    var msg_length: usize = 0;

    for (acronym) |byte| {
        const letter: u8 = tools.toLower(byte) -% 'a';
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
        const reply = msg_buffer[0..msg_length];
        api.replyMessage(data.channel_id, data.id, reply);
    }
}
