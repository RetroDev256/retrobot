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

type MessageApi = {
    channel_id: string;
    message_id: string;
    author_id: string;
    content: string;
    is_bot: boolean;
};

type ReactionApi = {
    channel_id: string;
    message_id: string;
    author_id: string;
    content: string;
    user_id: string;
    emoji: string | null;
};

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
    writeStdoutApi: (out_ptr: number, out_len: number): void => {
        try {
            const output = readString(out_ptr, out_len);
            process.stdout.write(output);
        } catch (err) {
            console.log("TypeScript Error: " + String(err));
        }
    },
    fillRandomApi: (dest_ptr: number, dest_len: number): void => {
        try {
            const bytes = new Uint8Array(memory.buffer, dest_ptr, dest_len);
            crypto.getRandomValues(bytes);
        } catch (err) {
            console.log("TypeScript Error: " + String(err));
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
const messageCreate = exports["messageCreate"] as () => boolean;
const reactionAdd = exports["reactionAdd"] as () => boolean;
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
                channel_id: message.channelId,
                message_id: message.id,
                author_id: message.author.id,
                content: message.content,
                is_bot: message.author.bot,
            } as MessageApi)
        );
        if (!messageCreate()) throw new Error("WASM messageCreate error");
    } catch (err) {
        console.log("TypeScript Error: " + String(err));
    }
});

client.on("messageReactionAdd", async (reaction, user) => {
    try {
        // ensure op_author_id & op_content are non-null
        if (reaction.partial) await reaction.fetch();

        pushString(
            JSON.stringify({
                channel_id: reaction.message.channelId,
                message_id: reaction.message.id,
                author_id: reaction.message.author?.id,
                content: reaction.message.content,
                user_id: user.id,
                emoji: reaction.emoji.name,
            } as ReactionApi)
        );
        if (!reactionAdd()) throw new Error("WASM reactionAdd error");
    } catch (err) {
        console.log("TypeScript Error: " + String(err));
    }
});

if (!init()) throw new Error("Failed to initialize WASM");
client.login(process.env["DISCORD_TOKEN"]);
