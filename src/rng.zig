const std = @import("std");
const io = @import("io.zig");
const Csprng = std.Random.DefaultCsprng;

extern fn fillRandom(ptr: [*]u8, len: usize) void;
var state: Csprng = undefined;
pub const csprng = state.random();

export fn initCsprng() void {
    var buffer: [Csprng.secret_seed_length]u8 = undefined;
    fillRandom((&buffer).ptr, Csprng.secret_seed_length);
    state = .init(buffer);
}
