import { Client, GatewayIntentBits, Partials } from "discord.js";
import * as fs from "fs";

const client = new Client({
    intents: Object.values(GatewayIntentBits) as GatewayIntentBits[],
    partials: Object.values(Partials) as Partials[],
});

const memory = new WebAssembly.Memory({ initial: 64 });

// Tool to help load WASM memory as TypeScript strings
function readString(ptr: number, len: number): string {
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
}

// For setting string parameters in TypeScript
function pushString(str: string): void {
    const utf_8 = new TextEncoder().encode(str);
    const ptr = allocateMem(utf_8.length);
    if (ptr === 0) throw new Error("Out of memory");
    const str_mem = new Uint8Array(memory.buffer, ptr, utf_8.length);
    str_mem.set(utf_8);
}

const wasm_env = {
    memory: memory,
    readFileApi: (path_ptr: number, path_len: number): boolean => {
        try {
            const path = readString(path_ptr, path_len);
            pushString(fs.readFileSync(path, "utf8"));
            return true;
        } catch (err) {
            console.log("TypeScript Error: " + String(err));
            return false;
        }
    },
    writeStdoutApi: (out_ptr: number, out_len: number): boolean => {
        try {
            const output = readString(out_ptr, out_len);
            process.stdout.write(output);
            return true;
        } catch (err) {
            console.log("TypeScript Error: " + String(err));
            return false;
        }
    },
    fillRandomApi: (dest_ptr: number, dest_len: number): boolean => {
        try {
            const bytes = new Uint8Array(memory.buffer, dest_ptr, dest_len);
            crypto.getRandomValues(bytes);
            return true;
        } catch (err) {
            console.log("TypeScript Error: " + String(err));
            return false;
        }
    },
    replyMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number,
        content_ptr: number,
        content_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const content = readString(content_ptr, content_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = channel.messages.fetch(message_id);
                await (await message).reply(content);
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
    editMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number,
        content_ptr: number,
        content_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const content = readString(content_ptr, content_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                await message.edit(content);
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
    deleteMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                await message.delete();
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
    reactMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number,
        reaction_ptr: number,
        reaction_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const reaction = readString(reaction_ptr, reaction_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                await message.react(reaction);
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
};

const buffer = fs.readFileSync("retrobot.wasm");
const module = new WebAssembly.Module(buffer);
const instance = new WebAssembly.Instance(module, { env: wasm_env });
const exports = instance.exports;

const allocateMem = exports["allocateMem"] as (len: number) => number;
const messageCreate = exports["messageCreate"] as () => void;
const reactionAdd = exports["reactionAdd"] as () => void;
const init = exports["init"] as () => boolean;

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

client.on("messageCreate", (message) => {
    try {
        pushString(
            JSON.stringify({
                channel_id: message.channelId, // []const u8
                message_id: message.id, // []const u8
                author_id: message.author.id, // []const u8
                content: message.content, // []const u8
                author_is_bot: message.author.bot, // bool
            })
        );
        messageCreate();
    } catch (err) {
        console.log("TypeScript Error: " + String(err));
    }
});

client.on("messageReactionAdd", async (reaction, user) => {
    try {
        pushString(
            JSON.stringify({
                op_channel_id: reaction.message.channelId, // []const u8
                op_message_id: reaction.message.id, // []const u8
                op_partial: reaction.message.partial, // bool
                op_author_id: reaction.message.author?.id, // ?[]const u8
                op_content: reaction.message.content, // ?[]const u8
                user_id: user.id, // []const u8
                emoji_name: reaction.emoji.name, // ?[]const u8
            })
        );
        reactionAdd();
    } catch (err) {
        console.log("TypeScript Error: " + String(err));
    }
});

if (!init()) throw new Error("Failed to initialize WASM");
client.login(process.env["DISCORD_TOKEN"]);
