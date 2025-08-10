import { Client, GatewayIntentBits, Partials } from "discord.js";
import * as fs from "fs";

const wasm_memory = new WebAssembly.Memory({ initial: 64 });

const wasm_env = {
    writeStdout: (ptr: number, len: number) => {
        const bytes = new Uint8Array(wasm_memory.buffer, ptr, len);
        process.stdout.write(new TextDecoder("utf-8").decode(bytes));
    },
    fillRandom: (ptr: number, len: number) => {
        const bytes = new Uint8Array(wasm_memory.buffer, ptr, len);
        crypto.getRandomValues(bytes);
    },
    memory: wasm_memory,
};

const wasm_buffer = fs.readFileSync("retrobot.wasm");
const wasm_module = new WebAssembly.Module(wasm_buffer);
const wasm_instance = new WebAssembly.Instance(wasm_module, { env: wasm_env });
const wasm_exports = wasm_instance.exports;
wasm_exports.initCsprng();

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
    const ptr = wasm_exports.pushString(utf_8.length);
    const str_mem = new Uint8Array(wasm_memory.buffer, ptr, utf_8.length);
    str_mem.set(utf_8);
}

function popString(): string {
    const ptr = wasm_exports.topPointer();
    const len = wasm_exports.topLength();
    const str_mem = new Uint8Array(wasm_memory.buffer, ptr, len);
    const str = new TextDecoder().decode(str_mem);
    wasm_exports.popString();
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

// // Acronymify some text
// function acrCommand(cleaned: string): string[] {
//     assert(cleaned.length >= 1);
//
//     if (Number(randU64() % 4n) === 0 || cleaned.length > 16) {
//         return Array.from(cleaned).map((letter) => getW(letter, words));
//     } else if (cleaned.length === 1) {
//         return [getW(cleaned[0]!, words)];
//     } else {
//         let selection: string[] = [];
//
//         const inc_verb = randBool();
//         const inc_adverb = inc_verb && randBool();
//         const overhead = Number(inc_verb) + Number(inc_adverb) + 1;
//         const j_count = cleaned.length - overhead;
//
//         for (let i = 0; i < j_count; i += 1) {
//             selection.push(getW(cleaned[i]!, adjectives));
//         }
//
//         selection.push(getW(cleaned[j_count]!, nouns));
//         if (inc_verb) selection.push(getW(cleaned[j_count + 1]!, verbs));
//         if (inc_adverb) selection.push(getW(cleaned[j_count + 2]!, adverbs));
//         return selection.slice(-cleaned.length);
//     }
// }

// let words: string[][];
// let nouns: string[][];
// let verbs: string[][];
// let adverbs: string[][];
// let adjectives: string[][];
//
// // Get a random word from some starting letter
// function getW(letter: string, list: string[][]): string {
//     assert(letter.length === 1);
//     assert(letter[0] === letter[0]?.toLowerCase());
//     const letter_idx = letter.charCodeAt(0) - "a".charCodeAt(0);
//     const choice_idx = randU64() % BigInt(list[letter_idx]!.length);
//     return list[letter_idx]![Number(choice_idx)]!;
// }
//
// function loadWordLists() {
//     const n_text = fs.readFile("static/nouns.txt", "utf8");
//     const v_text = fs.readFile("static/verbs.txt", "utf8");
//     const a_text = fs.readFile("static/adverbs.txt", "utf8");
//     const j_text = fs.readFile("static/adjectives.txt", "utf8");
//
//     const init_a = n_text.then(
//         (text) => (nouns = partitionLetter(text.split("\n")))
//     );
//     const init_b = v_text.then(
//         (text) => (verbs = partitionLetter(text.split("\n")))
//     );
//     const init_c = a_text.then(
//         (text) => (adverbs = partitionLetter(text.split("\n")))
//     );
//     const init_d = j_text.then(
//         (text) => (adjectives = partitionLetter(text.split("\n")))
//     );
//
//     Promise.all([init_a, init_b, init_c, init_d]).then(() => {
//         words = Array.from({ length: 26 }, () => []);
//         for (let i = 0; i < 26; i += 1) {
//             words[i] = [
//                 ...(nouns[i] || []),
//                 ...(verbs[i] || []),
//                 ...(adverbs[i] || []),
//                 ...(adjectives[i] || []),
//             ];
//         }
//     });
// }
//
// function partitionLetter(word_list: string[]): string[][] {
//     const lists: string[][] = Array.from({ length: 26 }, () => []);
//     for (const word of word_list) {
//         assert(word.length !== 0);
//         assert(word[0] === word[0]?.toLowerCase());
//         const letter_idx = word.charCodeAt(0) - "a".charCodeAt(0);
//         lists[letter_idx]!.push(word);
//     }
//     return lists;
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
