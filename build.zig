const std = @import("std");

pub fn build(b: *std.Build) void {
    errdefer @panic("Error");

    const wasm = b.addExecutable(.{
        .name = "retrobot",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/root.zig"),
            .target = b.resolveTargetQuery(.{
                .cpu_arch = .wasm32,
                .cpu_model = .baseline,
                .os_tag = .freestanding,
            }),
            .optimize = .ReleaseFast,
        }),
    });

    wasm.stack_size = 1 << 16;
    wasm.import_memory = true;
    wasm.initial_memory = 64 << 16;
    wasm.dead_strip_dylibs = true;
    wasm.root_module.strip = true;
    wasm.rdynamic = true;
    wasm.entry = .disabled;

    // Build and install WASM artifact
    const install_wasm = b.addInstallArtifact(wasm, .{});

    // Add or update discord.js
    const discord_add = b.addSystemCommand(&.{ "bun", "add", "discord.js" });

    // Build typescript source
    const ts_source = try b.build_root.join(b.allocator, &.{"src/main.ts"});
    const bun_build = b.addSystemCommand(&.{
        "bun",     "build",    ts_source, "--outdir",
        b.exe_dir, "--target", "bun",     "--sourcemap",
    });
    bun_build.step.dependOn(&discord_add.step);
    b.default_step.dependOn(&bun_build.step);

    // Copy .env to output directory
    const dotenv_path = try b.build_root.join(b.allocator, &.{".env"});
    const dotenv_copy = b.addSystemCommand(&.{ "cp", dotenv_path, b.exe_dir });
    dotenv_copy.step.dependOn(&install_wasm.step);
    b.default_step.dependOn(&dotenv_copy.step);

    // Copy "words.txt" to output directory
    const words_path = try b.build_root.join(b.allocator, &.{"words.txt"});
    const words_copy = b.addSystemCommand(&.{ "cp", words_path, b.exe_dir });
    words_copy.step.dependOn(&install_wasm.step);
    b.default_step.dependOn(&words_copy.step);

    // Optimize WASM binary using wasm-opt
    const wasm_path = try std.fmt.allocPrint(b.allocator, "{s}/retrobot.wasm", .{b.exe_dir});
    defer b.allocator.free(wasm_path);
    const wasm_opt = b.addSystemCommand(&.{
        "wasm-opt", "--enable-bulk-memory-opt", "-O4", wasm_path, "-o", wasm_path,
    });
    wasm_opt.step.dependOn(&install_wasm.step);
    b.default_step.dependOn(&wasm_opt.step);
}
