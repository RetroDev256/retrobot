const std = @import("std");
const api = @import("api.zig");
const Writer = std.Io.Writer;

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
                api.writeStdout(w.buffer[0..w.end]);
                w.end = 0;

                for (data[0 .. data.len - 1]) |bytes| {
                    api.writeStdout(bytes);
                    written += bytes.len;
                }

                const pattern = data[data.len - 1];
                for (0..splat) |_| {
                    api.writeStdout(pattern);
                }
                written += pattern.len * splat;

                return written;
            }
        }.drain,
    },
};

pub const readFile = api.readFile;
