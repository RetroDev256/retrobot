const std = @import("std");

pub fn build(b: *std.Build) !void {
    const wasm = b.addExecutable(.{
        .name = "retrobot",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/root.zig"),
            .optimize = .ReleaseFast,
            .target = b.resolveTargetQuery(.{
                .cpu_arch = .wasm32,
                .cpu_model = .baseline,
                .os_tag = .freestanding,
            }),
        }),
    });

    // Install the wasm binary
    wasm.stack_size = 1 << 16;
    wasm.import_memory = true;
    wasm.initial_memory = 64 << 16;
    wasm.dead_strip_dylibs = true;
    wasm.root_module.strip = true;
    wasm.rdynamic = true;
    wasm.entry = .disabled;

    const install = b.addInstallArtifact(wasm, .{});

    // Build typescript source (including adding required libraries)
    const ts_source = try b.build_root.join(b.allocator, &.{"src/main.ts"});
    const bun_build = b.addSystemCommand(&.{
        "bun",
        "build",
        ts_source,
        "--sourcemap",
        "--minify-syntax",
        "--minify-whitespace",
        "--target" ++ "=" ++ "bun",
        b.fmt("--outdir={s}", .{b.exe_dir}),
    });

    // The bun build step depends on some external JS
    b.getInstallStep().dependOn(&bun_build.step);
    for (@as([]const []const u8, &.{
        "@google/generative-ai",
        "discord.js",
        "ollama",
    })) |dependency| {
        bun_build.step.dependOn(&b.addSystemCommand(
            &.{ "bun", "add", dependency, "--silent" },
        ).step);
    }

    // The optimization of the wasm file depends on the program wasm-opt
    const wasm_path = b.pathJoin(&.{ b.install_path, "retrobot.wasm" });
    install.step.dependOn(&b.addSystemCommand(&.{
        "wasm-opt",
        "-O4",
        "--enable-bulk-memory-opt",
        "--enable-nontrapping-float-to-int",
        wasm_path,
        "-o",
        wasm_path,
    }).step);

    // Copy .env and "words.txt" to output directory on install step
    for (@as([]const []const u8, &.{ ".env", "words.txt" })) |dependency| {
        const path = try b.build_root.join(b.allocator, &.{dependency});
        const copy_step = b.addSystemCommand(&.{ "cp", path, b.exe_dir });
        install.step.dependOn(&copy_step.step);
    }

    // The clean subcommand command will delete a bunch of stuff
    const clean = b.step("clean", "remove unnecessary files");
    for (@as([]const []const u8, &.{
        "package.json",
        "node_modules",
        ".zig-cache",
        "bun.lock",
        "zig-out",
    })) |to_go| {
        const path = try b.build_root.join(b.allocator, &.{to_go});
        clean.dependOn(&b.addSystemCommand(&.{ "rm", "-rf", path }).step);
    }
}
