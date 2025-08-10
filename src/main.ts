import { Client, GatewayIntentBits, Partials } from "discord.js";
import * as fs from "fs";

const wasm_memory = new WebAssembly.Memory({ initial: 64 });

const wasm_env = {
    readFileApi: (ptr: number, len: number) => {
        const bytes = new Uint8Array(wasm_memory.buffer, ptr, len);
        pushString(fs.readFileSync(new TextDecoder().decode(bytes), "utf8"));
    },
    writeStdoutApi: (ptr: number, len: number) => {
        const bytes = new Uint8Array(wasm_memory.buffer, ptr, len);
        process.stdout.write(new TextDecoder().decode(bytes));
    },
    fillRandomApi: (ptr: number, len: number) => {
        const bytes = new Uint8Array(wasm_memory.buffer, ptr, len);
        crypto.getRandomValues(bytes);
    },
    memory: wasm_memory,
};

const wasm_buffer = fs.readFileSync("retrobot.wasm");
const wasm_module = new WebAssembly.Module(wasm_buffer);
const wasm_instance = new WebAssembly.Instance(wasm_module, { env: wasm_env });
const wasm_exports = wasm_instance.exports;
wasm_exports.initApi();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildModeration,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.User,
        Partials.GuildMember,
        Partials.ThreadMember,
    ],
});

client.once("ready", (client) => {
    console.log("Logged in as", client.user?.tag);
    for (const guild of client.guilds.cache.values()) {
        console.log(`- ${guild.name}: ${guild.memberCount} members`);
    }
});

client.on("guildMemberAdd", async (member) => {
    const channel = member.guild.systemChannel;
    if (channel === null) return;
    await channel.send(`Welcome ${member}! o/`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    pushString(message.content);
    const response_count = wasm_exports.handleMessage();
    for (let i = 0; i < response_count; i += 1) {
        await message.reply(popString());
    }
});

function pushString(str: string): void {
    const utf_8 = new TextEncoder().encode(str);
    const ptr = wasm_exports.pushStringApi(utf_8.length);
    const str_mem = new Uint8Array(wasm_memory.buffer, ptr, utf_8.length);
    str_mem.set(utf_8);
}

function popString(): string {
    const ptr = wasm_exports.topPointer();
    const len = wasm_exports.topLength();
    const str_mem = new Uint8Array(wasm_memory.buffer, ptr, len);
    const str = new TextDecoder().decode(str_mem);
    wasm_exports.popStringApi();
    return str;
}

client.login(process.env.DISCORD_TOKEN);

// const load_words = loadWordLists();

// // Colorize zig code blocks
// for (const block of zigCodeBlocks(message.content)) {
//     const annotated = zigAnnotate(block);
//     if (annotated.length < 1990) {
//         const formatted = "```ansi\n" + annotated + "```";
//         await message.reply(formatted);
//     }
// }

// // Handle more complex command queries
// function complex(command: string, _: Message): string[] | undefined {
//     if (command.startsWith("acr ")) {
//         const trimmed = command.substring(4).toLowerCase();
//         const cleaned = trimmed.replace(/[^a-zA-Z]/g, "");
//         if (cleaned.length === 0) return undefined;
//         const acronym = acrCommand(cleaned);
//         return acronym.flatMap((item, idx) =>
//             idx < acronym.length - 1 ? [item, " "] : [item]
//         );
//     }
//
//     return undefined;
// }


// function randU64(): bigint {
//     return rand64() & 0xffff_ffff_ffff_ffffn;
// }

// function zigCodeBlocks(text: string): string[] {
//     const regex = /```zig\s*([\s\S]*?)```/g;
//     const matches = text.matchAll(regex);
//     const results: string[] = [];
//
//     for (const match of matches) {
//         results.push(match[1]!);
//     }
//
//     return results;
// }
//
// function zigAnnotate(input: string): string {
//     const zig_string = /"(?:\\.|[^\n"])*"|\\\\.*/g;
//     const zig_comment = /\/\/.*/g;
//     const zig_builtin = /@\w+/g;
//     const zig_keyword =
//         /\b(?:addrspace|align|allowzero|and|anyframe|anytype|asm|break|callconv|catch|comptime|const|continue|defer|else|enum|errdefer|error|export|extern|fn|for|if|inline|noalias|noinline|nosuspend|opaque|or|orelse|packed|pub|resume|return|linksection|struct|suspend|switch|test|threadlocal|try|union|unreachable|usingnamespace|var|volatile|while)\b/g;
//     const zig_primitive =
//         /\b(?:[uif]\d+|isize|usize|bool|anyopaque|void|noreturn|type|anyerror|comptime_int|comptime_float)\b/g;
//     const zig_number =
//         /(?:-|\b)[0-9][xo+\-\wpP]*|\b(?:true|false|null|undefined)\b|'(?:\\.|[^\n'])*'/g;
//     const zig_type = /\b[A-Z]\w*/g;
//     const zig_function = /\b[a-z_]\w*(?=\()/g;
//     const zig_variable = /\b\w+/g;
//
//     const white = (a: string): string => "\x1b[37m" + a; // White
//     const red = (a: string): string => "\x1b[31m" + a; // Red
//     const yellow = (a: string): string => "\x1b[33m" + a; // Yellow
//     const green = (a: string): string => "\x1b[32m" + a; // Green
//     const cyan = (a: string): string => "\x1b[36m" + a; // Cyan
//     const blue = (a: string): string => "\x1b[34m" + a; // Blue
//     const magenta = (a: string): string => "\x1b[35m" + a; // Magenta
//
//     const zig_8 = stringMatcher(zig_variable, blue, white);
//     const zig_7 = stringMatcher(zig_function, cyan, zig_8);
//     const zig_6 = stringMatcher(zig_type, magenta, zig_7);
//     const zig_5 = stringMatcher(zig_number, green, zig_6);
//     const zig_4 = stringMatcher(zig_primitive, magenta, zig_5);
//     const zig_3 = stringMatcher(zig_keyword, yellow, zig_4);
//     const zig_2 = stringMatcher(zig_builtin, red, zig_3);
//     const zig_1 = stringMatcher(zig_string, green, zig_2);
//     const zig_0 = stringMatcher(zig_comment, white, zig_1);
//
//     return zig_0(input);
// }
//
// function stringMatcher(
//     regex: RegExp,
//     tag_fn: (match: string) => string,
//     nomatch_fn: (span: string) => string
// ): (source: string) => string {
//     return (source: string): string => {
//         let last_index: number = 0;
//         let annotated: string = "";
//
//         for (const match of source.matchAll(regex)) {
//             if (match.index! > last_index) {
//                 const span: string = source.slice(last_index, match.index!);
//                 annotated += nomatch_fn(span);
//             }
//             annotated += tag_fn(match[0]);
//             last_index = match.index! + match[0].length;
//         }
//
//         if (last_index < source.length) {
//             const span: string = source.slice(last_index);
//             annotated += nomatch_fn(span);
//         }
//
//         return annotated;
//     };
// }
