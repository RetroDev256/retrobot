import {
    Client,
    Message,
    GuildMember,
    GatewayIntentBits,
    Partials,
} from "discord.js";

import { readFileSync } from "fs";

// TODO: .acr TEXT (acronymify TEXT)
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
        return message.reply(randBit() === 0 ? "no" : "yes");
    }

    // Anything after this point is a command
    const command_prefix: string = ".";
    if (!message.content.startsWith(command_prefix)) return;
    const command = message.content.slice(command_prefix.length);

    // Handle simple command queries
    const query_responses = queries(command, message);
    if (query_responses) {
        const fewer = aggregate(query_responses);
        for (const response of fewer) {
            await message.reply(response);
        }
        return;
    }
}

// TODO: .randimg (random 256x256 grayscale image)
// TODO: .maze (generate random maze)

// Handle simple command queries
function queries(command: string, message: Message): string[] | undefined {
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
            const b16_str = rand64().toString(16);
            response.push(`Here's your random u64: 0x${b16_str}`);
            break;
        case "rand":
            const u64 = rand64() & 0xffff_ffff_ffff_ffffn;
            response.push(`Here's your random u64: ${u64}`);
            break;
        case "randfloat":
            response.push(`Here's your random float: ${randFloat()}`);
            break;
        case "randbit":
            response.push(`Here's your random bit: ${randBit()}`);
            break;
        default:
            return undefined;
    }
    return response;
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

let rand64: () => bigint;
let randBit: () => number;
let randFloat: () => number;

function wasmCreate(): Promise<WebAssembly.Exports> {
    const buffer = readFileSync("./retrobot.wasm");
    const memory = new WebAssembly.Memory({ initial: 64 });

    return WebAssembly.instantiate(buffer, {
        env: {
            getRandom: (ptr: number, len: number) => {
                const mem = new Uint8Array(memory.buffer, ptr, len);
                crypto.getRandomValues(mem);
            },
            memory: memory,
        },
    }).then((module: WebAssembly.Exports) => module.instance.exports);
}

function wasmInitialize(exports: WebAssembly.Exports) {
    rand64 = exports.rand64;
    randBit = exports.randBit;
    randFloat = exports.randFloat;
    exports.init();
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

    const wasm_create = wasmCreate();

    const client = new Client({ intents, partials });
    client.once("ready", ready);
    client.on("guildMemberAdd", guildMemberAdd);
    client.on("messageCreate", messageCreate);

    wasmInitialize(await wasm_create);
    client.login(process.env.DISCORD_TOKEN);
}

await main();
