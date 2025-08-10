const std = @import("std");
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
                writeStdout(w.buffer.ptr, w.end);
                w.end = 0;

                for (data[0 .. data.len - 1]) |bytes| {
                    writeStdout(bytes.ptr, bytes.len);
                    written += bytes.len;
                }

                const pattern = data[data.len - 1];
                for (0..splat) |_| {
                    writeStdout(pattern.ptr, pattern.len);
                }
                written += pattern.len * splat;

                return written;
            }
        }.drain,
    },
};

pub fn handle(err: anytype) noreturn {
    switch (err) {
        inline else => |known| {
            const msg = std.fmt.comptimePrint("Zig error: {t}\n", .{known});
            writeStdout(msg.ptr, msg.len);
            @trap();
        },
    }
}

extern fn writeStdout(ptr: [*]const u8, len: usize) void;
