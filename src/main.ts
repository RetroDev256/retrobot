import assert from "assert";

import {
    Client,
    Message,
    GuildMember,
    GatewayIntentBits,
    Partials,
} from "discord.js";

import { promises as fs } from "fs";

let rand64: () => bigint;
let randBool: () => boolean;
let randFloat: () => number;

function ready(client: Client) {
    console.log("Logged in as", client.user?.tag);
    for (const guild of client.guilds.cache.values()) {
        console.log(" ".repeat(4), guild.name);
        console.log(" ".repeat(8), guild.memberCount, "members");
        console.log(" ".repeat(8), guild.channels.cache.size, "channels");
    }
}

// Greet new users with a friendly message
async function guildMemberAdd(member: GuildMember) {
    const channel = member.guild.systemChannel;
    if (channel === null) return;
    return channel.send(`Welcome ${member}! o/`);
}

// Handle message creation events in all contexts
async function messageCreate(message: Message) {
    // Ignore messages from other bots
    if (message.author.bot) return;

    // Handle simple message templates
    switch (message.content) {
        case "ping":
            return message.reply("pong");
        case "no u":
        case "darn bot":
            return message.reply("no u");
    }

    // Help people make their simple decisions
    const lower = message.content.toLowerCase();
    if (lower.startsWith("should i") || lower.startsWith("should we")) {
        return message.reply(randBool() ? "yes" : "no");
    }

    // Colorize zig code blocks
    for (const block of zigCodeBlocks(message.content)) {
        const annotated = zigAnnotate(block);
        if (annotated.length < 1990) {
            const formatted = "```ansi\n" + annotated + "```";
            await message.reply(formatted);
        }
    }

    // Anything after this point is a command
    const command_prefix: string = ".";
    if (!message.content.startsWith(command_prefix)) return;
    const command = message.content.substring(command_prefix.length);

    // Handle simple command queries
    const simple_response = simple(command, message);
    if (simple_response !== undefined) {
        const fewer = aggregate(simple_response);
        for (const response of fewer) {
            await message.reply(response);
        }
        return;
    }

    // Handle more complex command queries
    const complex_response = complex(command, message);
    if (complex_response !== undefined) {
        const fewer = aggregate(complex_response);
        for (const response of fewer) {
            await message.reply(response);
        }
        return;
    }
}

// TODO: .randimg (random 256x256 grayscale image)
// TODO: .maze (generate random maze)

// Handle simple command queries
function simple(command: string, message: Message): string[] | undefined {
    let response: string[] = [];
    switch (command) {
        case "emojis":
            if (message.guild === null) {
                response.push("This isn't a server bruh.");
            } else {
                const emoji_list = message.guild.emojis.cache;
                for (const emoji of emoji_list.values()) {
                    response.push(emoji.toString());
                }
            }
            break;
        case "randhex":
            const u_num_a = rand64() & 0xffff_ffff_ffff_ffffn;
            response.push(`Here's your random u64: 0x${u_num_a.toString(16)}`);
            break;
        case "rand":
            const u_num_b = rand64() & 0xffff_ffff_ffff_ffffn;
            response.push(`Here's your random u64: ${u_num_b}`);
            break;
        case "randbit":
            const bit = randBool() ? "0" : "1";
            response.push(`Here's your random bit: ${bit}`);
            break;
        case "randfloat":
            response.push(`Here's your random float: ${randFloat()}`);
            break;
        default:
            return undefined;
    }
    return response;
}

// TODO: .calc EXPR (evaluate EXPR)
// TODO: .say MSG (parrot MSG)
// TODO: .info ID/Mention (get user info)
// TODO: .msg ID/Mention MSG (DM MSG to user)
// TODO: .bf PROG (evaluate BF program (limited))
// TODO: .hex TEXT/FILE (encode base-16 UTF-8)
// TODO: .b64 TEXT/FILE (encode base-64 UTF-8)
// TODO: .hex-d TEXT/FILE (decode base-16 UTF-8)
// TODO: .b64-d TEXT/FILE (decode base-64 UTF-8)
// TODO: .qr TEXT/FILE (generate QR code (binary?))

// Handle more complex command queries
function complex(command: string, _: Message): string[] | undefined {
    if (command.startsWith("acr ")) {
        const trimmed = command.substring(4).toLowerCase();
        const cleaned = trimmed.replace(/[^a-zA-Z]/g, "");
        if (cleaned.length === 0) return undefined;
        const acronym = acrCommand(cleaned);
        return acronym.flatMap((item, idx) =>
            idx < acronym.length - 1 ? [item, " "] : [item]
        );
    }

    return undefined;
}

// Acronymify some text
function acrCommand(cleaned: string): string[] {
    assert(cleaned.length >= 1);

    const u_num = rand64() & 0xffff_ffff_ffff_ffffn;
    if (Number(u_num % 4n) === 0 || cleaned.length > 16) {
        return Array.from(cleaned).map((letter) => getW(letter, words));
    } else if (cleaned.length === 1) {
        return [getW(cleaned[0]!, words)];
    } else {
        let selection: string[] = [];

        const inc_verb = randBool();
        const inc_adverb = inc_verb && randBool();
        const overhead = Number(inc_verb) + Number(inc_adverb) + 1;
        const j_count = cleaned.length - overhead;

        for (let i = 0; i < j_count; i += 1) {
            selection.push(getW(cleaned[i]!, adjectives));
        }

        selection.push(getW(cleaned[j_count]!, nouns));
        if (inc_verb) selection.push(getW(cleaned[j_count + 1]!, verbs));
        if (inc_adverb) selection.push(getW(cleaned[j_count + 2]!, adverbs));
        return selection.slice(-cleaned.length);
    }
}

// For reducing some number of responses
function aggregate(many: string[]): string[] {
    let fewer: string[] = [];
    let partial: string = "";
    for (const one of many) {
        if (partial.length + one.length > 2000) {
            fewer.push(partial);
            partial = "";
        }
        partial += one;
    }
    fewer.push(partial);
    return fewer;
}

function instantiateWasm(): Promise<WebAssembly.Exports> {
    const memory = new WebAssembly.Memory({ initial: 64 });
    const env = {
        getRandom: (ptr: number, len: number) => {
            const mem = new Uint8Array(memory.buffer, ptr, len);
            crypto.getRandomValues(mem);
        },
        memory: memory,
    };
    return fs
        .readFile("retrobot.wasm")
        .then((buffer) => WebAssembly.instantiate(buffer, { env }))
        .then((result) => result.instance.exports);
}

function initializeWasm(exports: WebAssembly.Exports) {
    rand64 = exports.rand64;
    randBool = exports.randBool;
    randFloat = exports.randFloat;
    exports.init();
}

let words: string[][];
let nouns: string[][];
let verbs: string[][];
let adverbs: string[][];
let adjectives: string[][];

// Get a random word from some starting letter
function getW(letter: string, list: string[][]): string {
    assert(letter.length === 1);
    assert(letter[0] === letter[0]?.toLowerCase());
    const letter_idx = letter.charCodeAt(0) - "a".charCodeAt(0);
    const u_num = rand64() & 0xffff_ffff_ffff_ffffn;
    const choice_idx = u_num % BigInt(list[letter_idx]!.length);
    return list[letter_idx]![Number(choice_idx)]!;
}

function loadWordLists() {
    const n_text = fs.readFile("static/nouns.txt", "utf8");
    const v_text = fs.readFile("static/verbs.txt", "utf8");
    const a_text = fs.readFile("static/adverbs.txt", "utf8");
    const j_text = fs.readFile("static/adjectives.txt", "utf8");

    const init_a = n_text.then(
        (text) => (nouns = partitionLetter(text.split("\n")))
    );
    const init_b = v_text.then(
        (text) => (verbs = partitionLetter(text.split("\n")))
    );
    const init_c = a_text.then(
        (text) => (adverbs = partitionLetter(text.split("\n")))
    );
    const init_d = j_text.then(
        (text) => (adjectives = partitionLetter(text.split("\n")))
    );

    Promise.all([init_a, init_b, init_c, init_d]).then(() => {
        words = Array.from({ length: 26 }, () => []);
        for (let i = 0; i < 26; i += 1) {
            words[i] = [
                ...(nouns[i] || []),
                ...(verbs[i] || []),
                ...(adverbs[i] || []),
                ...(adjectives[i] || []),
            ];
        }
    });
}

function partitionLetter(word_list: string[]): string[][] {
    const lists: string[][] = Array.from({ length: 26 }, () => []);
    for (const word of word_list) {
        assert(word.length !== 0);
        assert(word[0] === word[0]?.toLowerCase());
        const letter_idx = word.charCodeAt(0) - "a".charCodeAt(0);
        lists[letter_idx]!.push(word);
    }
    return lists;
}

function zigCodeBlocks(text: string): string[] {
    const regex = /```zig\s*([\s\S]*?)```/g;
    const matches = text.matchAll(regex);
    const results: string[] = [];

    for (const match of matches) {
        results.push(match[1]!);
    }

    return results;
}

function zigAnnotate(input: string): string {
    const zig_string = /"(?:\\.|[^\n"])*"|\\\\.*/g;
    const zig_comment = /\/\/.*/g;
    const zig_builtin = /@\w+/g;
    const zig_keyword =
        /\b(?:addrspace|align|allowzero|and|anyframe|anytype|asm|break|callconv|catch|comptime|const|continue|defer|else|enum|errdefer|error|export|extern|fn|for|if|inline|noalias|noinline|nosuspend|opaque|or|orelse|packed|pub|resume|return|linksection|struct|suspend|switch|test|threadlocal|try|union|unreachable|usingnamespace|var|volatile|while)\b/g;
    const zig_primitive =
        /\b(?:[uif]\d+|isize|usize|bool|anyopaque|void|noreturn|type|anyerror|comptime_int|comptime_float)\b/g;
    const zig_number =
        /(?:-|\b)[0-9][xo+\-\wpP]*|\b(?:true|false|null|undefined)\b|'(?:\\.|[^\n'])*'/g;
    const zig_type = /\b[A-Z]\w*/g;
    const zig_function = /\b[a-z_]\w*(?=\()/g;
    const zig_variable = /\b\w+/g;

    const white = (a: string): string => "\x1b[37m" + a; // White
    const red = (a: string): string => "\x1b[31m" + a; // Red
    const yellow = (a: string): string => "\x1b[33m" + a; // Yellow
    const green = (a: string): string => "\x1b[32m" + a; // Green
    const cyan = (a: string): string => "\x1b[36m" + a; // Cyan
    const blue = (a: string): string => "\x1b[34m" + a; // Blue
    const magenta = (a: string): string => "\x1b[35m" + a; // Magenta

    const zig_8 = stringMatcher(zig_variable, blue, white);
    const zig_7 = stringMatcher(zig_function, cyan, zig_8);
    const zig_6 = stringMatcher(zig_type, magenta, zig_7);
    const zig_5 = stringMatcher(zig_number, yellow, zig_6);
    const zig_4 = stringMatcher(zig_primitive, red, zig_5);
    const zig_3 = stringMatcher(zig_keyword, green, zig_4);
    const zig_2 = stringMatcher(zig_builtin, red, zig_3);
    const zig_1 = stringMatcher(zig_string, yellow, zig_2);
    const zig_0 = stringMatcher(zig_comment, white, zig_1);

    return zig_0(input);
}

function stringMatcher(
    regex: RegExp,
    tag_fn: (match: string) => string,
    nomatch_fn: (span: string) => string
): (source: string) => string {
    return (source: string): string => {
        let last_index: number = 0;
        let annotated: string = "";

        for (const match of source.matchAll(regex)) {
            if (match.index! > last_index) {
                const span: string = source.slice(last_index, match.index!);
                annotated += nomatch_fn(span);
            }
            annotated += tag_fn(match[0]);
            last_index = match.index! + match[0].length;
        }

        if (last_index < source.length) {
            const span: string = source.slice(last_index);
            annotated += nomatch_fn(span);
        }

        return annotated;
    };
}

// Initialize everything
async function main() {
    const intents = [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildModeration,
    ];

    const partials = [
        Partials.Message,
        Partials.Channel,
        Partials.User,
        Partials.GuildMember,
        Partials.ThreadMember,
    ];

    const load_words = loadWordLists();
    const wasm_create = instantiateWasm();

    const client = new Client({ intents, partials });
    client.once("ready", ready);
    client.on("guildMemberAdd", guildMemberAdd);
    client.on("messageCreate", messageCreate);

    await load_words;
    initializeWasm(await wasm_create);
    client.login(process.env.DISCORD_TOKEN);
}

await main();
