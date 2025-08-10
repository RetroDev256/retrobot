const std = @import("std");

pub fn eql(a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    for (a, b) |byte_a, byte_b| {
        if (byte_a != byte_b) {
            return false;
        }
    }
    return true;
}

pub fn insensitiveEql(a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    for (a, b) |byte_a, byte_b| {
        const upper_a = toUpper(byte_a);
        const upper_b = toUpper(byte_b);
        if (upper_a != upper_b) {
            return false;
        }
    }
    return true;
}

pub fn toUpper(byte: u8) u8 {
    if (byte -% 'a' < 26) {
        return byte - 0x20;
    } else {
        return byte;
    }
}

pub fn startsWith(a: []const u8, b: []const u8) bool {
    if (b.len < a.len) return false;
    return eql(a, b[0..a.len]);
}

pub fn startsWithInsensitive(a: []const u8, b: []const u8) bool {
    if (b.len < a.len) return false;
    return insensitiveEql(a, b[0..a.len]);
}
