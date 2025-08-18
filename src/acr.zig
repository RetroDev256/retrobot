const std = @import("std");
const api = @import("api.zig");
const root = @import("root");
const rand = @import("rand.zig");
const tools = @import("tools.zig");

const WordList = std.ArrayList([]const u8);
var word_lists: [26]WordList = @splat(.empty);

pub fn init() !void {
    const content = try api.readFile("words.txt");
    errdefer root.gpa.free(content);
    try splitList(content);
}

fn splitList(text: []const u8) !void {
    var start: usize = 0;
    while (std.mem.indexOfScalarPos(u8, text, start, '\n')) |index| {
        const letter = text[start] -% 'a';
        const line = text[start..index];
        try word_lists[letter].append(root.gpa, line);
        start = index + 1;
    }
}

pub fn handleAcr(data: *const api.Message) !void {
    const command = root.cmd_prefix ++ "acr ";
    if (!std.mem.startsWith(u8, data.content, command)) return;

    var buffer: [2000]u8 = undefined;
    var writer: std.Io.Writer = .fixed(&buffer);

    for (data.content[command.len..]) |byte| {
        const letter = tools.toLower(byte) -% 'a';
        if (letter >= 26) continue;

        const options = word_lists[letter].items.len;
        const choice = rand.csprng.intRangeLessThan(usize, 0, options);
        try writer.print("{s} ", .{word_lists[letter].items[choice]});
    }

    const buffered = writer.buffered();
    if (buffered.len == 0) return;
    api.replyMessage(data.channel_id, data.message_id, buffered);
}
