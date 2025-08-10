const std = @import("std");
const api = @import("api.zig");
const Writer = std.Io.Writer;

extern fn writeStdoutApi(ptr: [*]const u8, len: usize) void;

var stdout_buffer: [4096]u8 = undefined;
pub var stdout: Writer = .{
    .buffer = &stdout_buffer,
    .vtable = &.{
        .drain = &struct {
            fn drain(
                w: *Writer,
                data: []const []const u8,
                splat: usize,
            ) Writer.Error!usize {
                var written: usize = w.end;
                writeStdoutApi(w.buffer.ptr, w.end);
                w.end = 0;

                for (data[0 .. data.len - 1]) |bytes| {
                    writeStdoutApi(bytes.ptr, bytes.len);
                    written += bytes.len;
                }

                const pattern = data[data.len - 1];
                for (0..splat) |_| {
                    writeStdoutApi(pattern.ptr, pattern.len);
                }
                written += pattern.len * splat;

                return written;
            }
        }.drain,
    },
};

extern fn readFileApi(ptr: [*]const u8, len: usize) void;
pub fn readFile(path: []const u8) []const u8 {
    readFileApi(path.ptr, path.len);
    return api.popString();
}
