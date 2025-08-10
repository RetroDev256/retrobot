const std = @import("std");

pub const CommandError = std.Io.Writer.Error || std.mem.Allocator.Error;
const CommandFunction = *const fn () CommandError!usize;

const KvPair = struct {
    key: []const u8,
    value: CommandFunction,

    pub fn init(key: []const u8, value: CommandFunction) @This() {
        return .{ .key = key, .value = value };
    }
};

kv_list: []const KvPair,

pub fn init(comptime kv_list: []const KvPair) @This() {
    return .{ .kv_list = kv_list };
}

pub fn get(
    comptime self: @This(),
    comptime eql: anytype,
    key: []const u8,
) ?CommandFunction {
    const kvs_by_length = comptime self.separateLength();

    inline for (kvs_by_length) |kvs| {
        const len = kvs[0].key.len;
        if (key.len == len) {
            inline for (kvs) |kv| {
                if (eql(len, kv.key[0..len].*, key[0..len].*)) {
                    return kv.value;
                }
            }
            // None of the keys of that length matched
            return null;
        }
    }
    // We don't have any keys of that length
    return null;
}

fn separateLength(comptime self: @This()) []const []const KvPair {
    // list of kvs grouped by the length of their keys
    var kvs_by_length: []const []const KvPair = &.{};

    add_length: for (self.kv_list, 0..) |find_kv, idx| {
        const len = find_kv.key.len;

        // Skip the kv pair if it has already been added
        for (kvs_by_length) |set| {
            if (set[0].key.len == len) {
                continue :add_length;
            }
        }

        // Add all keys with the same length to the set
        var added_kvs: []const KvPair = &.{};
        for (self.kv_list[idx..]) |add_kv| {
            if (add_kv.key.len == len) {
                added_kvs = added_kvs ++ .{add_kv};
            }
        }

        kvs_by_length = kvs_by_length ++ .{added_kvs};
    }

    return kvs_by_length;
}
