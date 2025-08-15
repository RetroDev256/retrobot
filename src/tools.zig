const std = @import("std");

pub fn insensitiveEql(comptime a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    for (a, b) |byte_a, byte_b| {
        const lower_a = toLower(byte_a);
        const lower_b = toLower(byte_b);
        if (lower_a != lower_b) return false;
    }
    return true;
}

pub fn toLower(byte: u8) u8 {
    if (byte -% 'A' < 26) {
        return byte + 0x20;
    } else {
        return byte;
    }
}

pub fn startsWithInsensitive(comptime a: []const u8, b: []const u8) bool {
    if (b.len < a.len) return false;
    return insensitiveEql(a, b[0..a.len]);
}

pub fn isUpper(byte: u8) bool {
    return byte -% 'A' < 26;
}

pub fn isDigit(byte: u8) bool {
    return byte -% '0' < 10;
}
