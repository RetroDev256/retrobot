const std = @import("std");

/// Equality check for a compile-time known string and a runtime-known string.
/// An optimizer can generate similar code, but this code is explicit to ensure
/// we get optimal codegen - specific to each static string's length and value.
pub fn staticEql(comptime len: usize, comptime a: [len]u8, b: [len]u8) bool {
    const block_len = std.simd.suggestVectorLength(u8) orelse @sizeOf(usize);
    const Chunk = std.meta.Int(.unsigned, block_len * 8);

    // Compare `block_count` chunks of `block_len` bytes at a time
    const block_count = a.len / block_len;
    for (0..block_count) |idx| {
        const chunk_a: Chunk = @bitCast(a[idx * block_len ..][0..block_len].*);
        const chunk_b: Chunk = @bitCast(b[idx * block_len ..][0..block_len].*);
        if (chunk_a != chunk_b) return false;
    }

    // Compare the remainder `rem_count` bytes of both strings
    const rem_count = a.len % block_len;
    const Rem = std.meta.Int(.unsigned, rem_count * 8);

    const rem_a: Rem = @bitCast(a[block_count * block_len ..][0..rem_count].*);
    const rem_b: Rem = @bitCast(b[block_count * block_len ..][0..rem_count].*);
    return rem_a == rem_b;
}

/// Case-insensitive equality check for equal length comptime & runtime string.
/// We do not call staticEql because it's harder for the compiler to vectorize.
pub fn insensitiveEql(comptime a: []const u8, b: []const u8) bool {
    if (b.len != a.len) return false;
    const upper_a = comptime toUpper(a.len, a[0..a.len].*);
    const upper_b = toUpper(a.len, b[0..a.len].*);
    for (upper_a, upper_b) |x, y| {
        if (x != y) return false;
    }
    return true;
}

/// Uppercase transform for a string with a comptime-known length
pub fn toUpper(comptime len: usize, input: [len]u8) [len]u8 {
    var result: [len]u8 = input;
    for (&result) |*byte| {
        if (byte.* -% 'a' < 26) {
            byte.* -= 0x20;
        }
    }
    return result;
}

// startsWith where one argument is comptime-known, but case-insensitive
pub fn startsWithInsensitive(comptime a: []const u8, b: []const u8) bool {
    if (b.len < a.len) return false;
    return insensitiveEql(a, b[0..a.len]);
}

// startsWith where one argument is comptime-known
pub fn startsWithStatic(comptime a: []const u8, b: []const u8) bool {
    if (b.len < a.len) return false;
    return staticEql(a.len, a[0..a.len].*, b[0..a.len].*);
}

test staticEql {
    const corpus: []const *const [5]u8 = &.{
        "aback", "abase", "abate", "abbey", "abbot", "abhor", "abide", "abled",
        "abode", "abort", "about", "above", "abuse", "abyss", "acorn", "acrid",
    };

    // strings are equal to themselves
    inline for (corpus) |str| {
        try std.testing.expect(staticEql(str.len, str.*, str.*));
    }

    // unequal strings are just that - not equal
    inline for (corpus, 0..) |str_a, idx| {
        for (corpus[0..idx]) |str_b| {
            try std.testing.expect(!staticEql(str_a.len, str_a.*, str_b.*));
        }
    }
}

test insensitiveEql {
    const corpus_a: []const *const [5]u8 = &.{
        "wRING", "WRIst", "WRiTe", "wronG", "WROte", "WruNg", "wryly", "yacht",
        "yeaRN", "yeAST", "YIEld", "young", "youth", "zeBRa", "zESTy", "zONal",
    };
    const corpus_b: []const *const [5]u8 = &.{
        "wrIng", "wRISt", "WritE", "WRONG", "wROTE", "wRUnG", "wrYlY", "yAcHt",
        "yEARn", "yeAst", "yiEld", "yoUng", "youTh", "zeBra", "zEsTY", "zonaL",
    };

    // strings are equal to themselves
    inline for (corpus_a, corpus_b) |str_a, str_b| {
        try std.testing.expect(insensitiveEql(str_a, str_a));
        try std.testing.expect(insensitiveEql(str_b, str_b));
    }

    // strings are equal regardless of alphabetic case
    inline for (corpus_a, corpus_b) |str_a, str_b| {
        try std.testing.expect(insensitiveEql(str_a, str_b));
    }

    // unequal strings are just that - not equal
    inline for (corpus_a, corpus_b, 0..) |str_a0, str_b0, idx| {
        for (corpus_a[0..idx], corpus_b[0..idx]) |str_a1, str_b1| {
            try std.testing.expect(!insensitiveEql(str_a0, str_a1));
            try std.testing.expect(!insensitiveEql(str_a0, str_b1));
            try std.testing.expect(!insensitiveEql(str_b0, str_a1));
            try std.testing.expect(!insensitiveEql(str_b0, str_b1));
        }
    }
}

test toUpper {
    const input_list: []const []const u8 = &.{
        "0",
        "abc",
        "123abc!!!",
        "0xdEaDBeeF",
        "this is a test string, I don't know.",
        "this is the\xFFspiciest test\x00string to ever exist in zig",
    };
    const expected_list: []const []const u8 = &.{
        "0",
        "ABC",
        "123ABC!!!",
        "0XDEADBEEF",
        "THIS IS A TEST STRING, I DON'T KNOW.",
        "THIS IS THE\xFFSPICIEST TEST\x00STRING TO EVER EXIST IN ZIG",
    };

    inline for (input_list, expected_list) |input, expected| {
        const actual = toUpper(input.len, input[0..input.len].*);
        try std.testing.expectEqualSlices(u8, expected, &actual);
    }
}

test startsWithInsensitive {
    const a = startsWithInsensitive("rand", "Rand al' thor");
    const b = startsWithInsensitive("", "some message");
    const c = startsWithInsensitive("hello, world", "Hello, world");
    const d = !startsWithInsensitive("test message", "test");
    const e = !startsWithInsensitive("hello", "");
    try std.testing.expect(a and b and c and d and e);
}

test startsWithStatic {
    const a = startsWithInsensitive("rand", "random numbers");
    const b = startsWithInsensitive("", "some message");
    const c = startsWithInsensitive("hello, world", "hello, world");
    const d = !startsWithInsensitive("test message", "test");
    const e = !startsWithInsensitive("hello", "");
    try std.testing.expect(a and b and c and d and e);
}
