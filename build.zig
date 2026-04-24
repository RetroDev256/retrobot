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
    b.getInstallStep().dependOn(&install.step);

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
    b.getInstallStep().dependOn(&bun_build.step);

    // The bun build step depends on some external JS
    const dep_update = b.step("update", "update JS dependencies with bun");
    dep_update.dependOn(&install.step);
    for (@as([]const []const u8, &.{
        "discord.js",
        "fast-xml-parser",
        "ollama",
    })) |dependency| {
        dep_update.dependOn(&b.addSystemCommand(
            &.{ "bun", "add", dependency, "--silent" },
        ).step);
    }

    // The optimization of the wasm file depends on the program wasm-opt
    const wasm_path = b.pathJoin(&.{ b.exe_dir, "retrobot.wasm" });
    const optimize_wasm = b.addSystemCommand(&.{
        "wasm-opt", b.fmt("-o={s}", .{wasm_path}),
        "-O4",      "--enable-nontrapping-float-to-int",
        wasm_path,  "--enable-bulk-memory-opt",
    });

    optimize_wasm.step.dependOn(&install.step);
    b.getInstallStep().dependOn(&optimize_wasm.step);

    // Copy .env and "words.txt" to output directory on install step
    const deps = b.step("deps", "copy .env and words.json to output dir");
    for (@as([]const []const u8, &.{ ".env", "words.json" })) |dependency| {
        const path = try b.build_root.join(b.allocator, &.{dependency});
        const copy_command = b.addSystemCommand(&.{ "cp", path, b.exe_dir });
        copy_command.step.dependOn(&install.step);
        deps.dependOn(&copy_command.step);
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

    // The run subcommand will compile the wasm and run the typescript with bun
    const run = b.step("run", "compile everything and run with bun");
    const js_out_path = b.pathJoin(&.{ b.exe_dir, "main.js" });
    const bun_run_command = b.addSystemCommand(
        &.{ "env", "-C", b.exe_dir, "bun", "run", js_out_path },
    );
    bun_run_command.step.dependOn(b.getInstallStep());
    run.dependOn(&bun_run_command.step);
}
