import { Client, Message, GatewayIntentBits, Partials } from "discord.js";

// TODO: use zig somewhere
// import { readFileSync } from "fs";
// // Load WASM & exported functions
// const wasm_buffer = readFileSync("./retrobot.wasm");
// const wasm_module = await WebAssembly.instantiate(wasm_buffer);
// const wasm_exports = wasm_module.instance.exports;
// const foo: () => number = wasm_exports.foo;

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

const command_prefix: string = ".";

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

client.once("ready", () => {
    console.log("Logged in as", client.user?.tag);
    for (const guild of client.guilds.cache.values()) {
        console.log(" ".repeat(4), guild.name);
        console.log(" ".repeat(8), guild.memberCount, "members");
        console.log(" ".repeat(8), guild.channels.cache.size, "channels");
    }
});

// Greet new users with a friendly message
client.on("guildMemberAdd", (member) => {
    const channel = member.guild.systemChannel;
    if (channel === null) return;
    channel.send(`Welcome ${member}! o/`);
});

client.on("messageCreate", async (message) => {
    // Ignore messages from other bots
    if (message.author.bot) return;

    // Handle simple message templates
    switch (message.content) {
        case "ping":
            await message.reply("pong");
            return;
        case "no u":
            await message.reply("no u");
            return;
    }

    // Help people make their simple decisions
    const lower = message.content.toLowerCase();*:
    if (lower.startsWith("should i") || lower.startsWith("should we")) {
        await message.reply(rand32() % 2 === 0 ? "yes" : "no");
        return;
    }

    // Anything after this point is a command
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
});

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
            response.push(`Here's your random u64: ${rand64()}`);
            break;
        case "randfloat":
            response.push(`Here's your random float: ${randFloat()}`);
            break;
        case "randbit":
            response.push(`Here's your random bit: ${rand32() % 2}`);
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

// Cryptographically secure float [0, 1)
function randFloat(): number {
    const top53 = rand64() >> BigInt(11);
    return Number(top53) / 0x20000000000000;
}

// Cryptographically secure u64
function rand64(): bigint {
    const low = BigInt(rand32());
    const high = BigInt(rand32());
    return (high << BigInt(32)) | low;
}

// Cryptographically secure u32
function rand32(): number {
    const parts = new Uint32Array(1);
    crypto.getRandomValues(parts);
    return parts[0] as number;
}

client.login(process.env.DISCORD_TOKEN);
