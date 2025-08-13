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
