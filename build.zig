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

    // Run the discord bot
    const run_step = b.step("run", "Run the discord bot");
    const run_cmd = b.addSystemCommand(&.{
        "sh", "-c", try std.fmt.allocPrint(
            b.allocator,
            "cd {s} && bun run main.js",
            .{b.exe_dir},
        ),
    });
    run_step.dependOn(&run_cmd.step);
    run_step.dependOn(b.default_step);
}
