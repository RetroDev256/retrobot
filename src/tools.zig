const std = @import("std");

pub fn eql(comptime a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    for (a, b) |byte_a, byte_b| {
        if (byte_a != byte_b) {
            return false;
        }
    }
    return true;
}

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

pub fn isUpper(byte: u8) bool {
    return byte -% 'A' < 26;
}

pub fn isDigit(byte: u8) bool {
    return byte -% '0' < 10;
}

pub fn startsWith(comptime a: []const u8, b: []const u8) bool {
    if (b.len < a.len) return false;
    return eql(a, b[0..a.len]);
}

pub fn startsWithInsensitive(comptime a: []const u8, b: []const u8) bool {
    if (b.len < a.len) return false;
    return insensitiveEql(a, b[0..a.len]);
}

pub fn indexOf(
    haystack: []const u8,
    start: usize,
    comptime needle: []const u8,
) ?usize {
    if (needle.len > haystack.len) return null;
    var idx: usize = start;
    while (idx <= haystack.len - needle.len) : (idx += 1) {
        if (eql(needle, haystack[idx..][0..needle.len])) {
            return idx;
        }
    }
    return null;
}
