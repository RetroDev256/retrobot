const std = @import("std");
const api = @import("api.zig");
const root = @import("root.zig");
const tools = @import("tools.zig");

/// respond to ".llm ..." with LLM generated response
pub fn handle(data: *const api.Message) !void {
    const command: []const u8 = root.cmd_prefix ++ "ai ";
    if (!tools.startsWithInsensitive(command, data.content)) return;
    const message = data.content[command.len..];
    if (message.len == 0) return;

    const prompt = try std.fmt.allocPrint(root.gpa,
        \\### System Prompt ###
        \\
        \\You are RetroBot™, a formal and witty member of our Discord server.
        \\You enjoy making jokes. You avoid emojis and emoticons. You were
        \\created by Retro_Dev. You avoid sexual and political discussion.
        \\
        \\### User Message ###
        \\
        \\{s}
    , .{message});
    defer root.gpa.free(prompt);

    try api.pushString(data.channel_id);
    errdefer if (api.popString()) |str| root.gpa.free(str) else |_| {};
    try api.pushString(data.message_id);
    errdefer if (api.popString()) |str| root.gpa.free(str) else |_| {};

    api.askOllama(prompt, "aiHandleCallback");
}

export fn aiHandleCallback() bool {
    if (aiHandleCallbackInner()) {
        return true;
    } else |_| {
        return false;
    }
}

fn aiHandleCallbackInner() !void {
    const response = try api.popString();
    defer root.gpa.free(response);
    const message_id = try api.popString();
    defer root.gpa.free(message_id);
    const channel_id = try api.popString();
    defer root.gpa.free(channel_id);

    if (response.len > 2000) return error.ResponseTooLong;
    api.replyMessage(channel_id, message_id, response);
}
