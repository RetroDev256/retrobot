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

let words: string[];
let nouns: string[];
let verbs: string[];
let adverbs: string[];
let adjectives: string[];

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
            const u64_a = rand64() & 0xffff_ffff_ffff_ffffn;
            response.push(`Here's your random u64: 0x${u64_a.toString(16)}`);
            break;
        case "rand":
            const u64_b = rand64() & 0xffff_ffff_ffff_ffffn;
            response.push(`Here's your random u64: ${u64_b}`);
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
        const trimmed = command.substring(4);
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

    if (Number(rand64() % 4n) === 0) {
        return Array.from(cleaned).map((letter) => getW(letter));
    } else if (cleaned.length === 1) {
        return [getW(cleaned[0]!)];
    } else {
        let selection: string[] = [];

        const inc_verb = randBool();
        const inc_adverb = inc_verb && randBool();
        const overhead = Number(inc_verb) + Number(inc_adverb) + 1;
        const adj_count = cleaned.length - overhead;

        for (let i = 0; i < adj_count; i += 1) {
            selection.push(getJ(cleaned[i]!));
        }

        selection.push(getN(cleaned[adj_count]!));
        if (inc_verb) selection.push(getV(cleaned[adj_count + 1]!));
        if (inc_adverb) selection.push(getA(cleaned[adj_count + 2]!));
        return selection.slice(-cleaned.length);
    }
}

function getW(letter: string): string {
    assert(letter.length == 1);
    const choices = words.filter((word) => word.startsWith(letter));
    const choice_idx = rand64() % BigInt(choices.length);
    return choices[Number(choice_idx)]!;
}

function getN(letter: string): string {
    assert(letter.length == 1);
    const choices = nouns.filter((word) => word.startsWith(letter));
    const choice_idx = rand64() % BigInt(choices.length);
    return choices[Number(choice_idx)]!;
}

function getV(letter: string): string {
    assert(letter.length == 1);
    const choices = verbs.filter((word) => word.startsWith(letter));
    const choice_idx = rand64() % BigInt(choices.length);
    return choices[Number(choice_idx)]!;
}

function getA(letter: string): string {
    assert(letter.length == 1);
    const choices = adverbs.filter((word) => word.startsWith(letter));
    const choice_idx = rand64() % BigInt(choices.length);
    return choices[Number(choice_idx)]!;
}

function getJ(letter: string): string {
    assert(letter.length == 1);
    const choices = adjectives.filter((word) => word.startsWith(letter));
    const choice_idx = rand64() % BigInt(choices.length);
    return choices[Number(choice_idx)]!;
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

function loadWordLists() {
    const n_text = fs.readFile("static/nouns.txt", "utf8");
    const v_text = fs.readFile("static/verbs.txt", "utf8");
    const a_text = fs.readFile("static/adverbs.txt", "utf8");
    const j_text = fs.readFile("static/adjectives.txt", "utf8");

    const init_a = n_text.then((text) => (nouns = text.split("\n")));
    const init_b = v_text.then((text) => (verbs = text.split("\n")));
    const init_c = a_text.then((text) => (adverbs = text.split("\n")));
    const init_d = j_text.then((text) => (adjectives = text.split("\n")));

    Promise.all([init_a, init_b, init_c, init_d]).then(() => {
        words = [...nouns, ...verbs, ...adverbs, ...adjectives];
    });
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
