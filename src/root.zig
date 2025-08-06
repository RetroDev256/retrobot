const std = @import("std");
const Csprng = std.Random.DefaultCsprng;

extern fn getRandom(ptr: [*]u8, len: usize) void;
var csprng_state: Csprng = undefined;

const csprng = csprng_state.random();
const gpa = std.heap.wasm_allocator;

export fn init() void {
    const key_len = Csprng.secret_seed_length;
    var buffer: [key_len]u8 = undefined;
    getRandom((&buffer).ptr, buffer.len);
    csprng_state = .init(buffer);
}

export fn rand64() u64 {
    return csprng.int(u64);
}

export fn randBool() bool {
    return csprng.boolean();
}

export fn randFloat() f64 {
    return csprng.float(f64);
}
