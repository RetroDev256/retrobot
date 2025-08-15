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
    author_is_bot: boolean;
};

type ReactionApi = {
    op_channel_id: string;
    op_message_id: string;
    op_author_id: string;
    op_content: string;
    user_id: string;
    emoji_name: string | null;
};

type FetchReferenceApi = {
    message: MessageApi | null;
};

type PermissionsApi = {
    manages_messages: boolean;
};

type FetchPermissionApi = {
    permissions: PermissionsApi | null;
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
    fetchReferenceApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number,
        callback_ptr: number,
        callback_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const callback_str = readString(callback_ptr, callback_len);
                const callback = exports[callback_str] as () => void;

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                let message_api: MessageApi | null = null;
                if (message.reference !== null) {
                    const reference = await message.fetchReference();
                    message_api = {
                        channel_id: reference.channelId,
                        message_id: reference.id,
                        author_id: reference.author.id,
                        content: reference.content,
                        author_is_bot: reference.author.bot,
                    };
                }

                const result: FetchReferenceApi = { message: message_api };
                pushString(JSON.stringify(result as FetchReferenceApi));
                callback();
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
    fetchPermissionsApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        user_id_ptr: number,
        user_id_len: number,
        callback_ptr: number,
        callback_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const user_id = readString(user_id_ptr, user_id_len);
                const callback_str = readString(callback_ptr, callback_len);
                const callback = exports[callback_str] as () => void;

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("guild" in channel)) return;
                const member = await channel.guild.members.fetch(user_id);

                let manages_messages: boolean = false;
                if (channel.permissionsFor(member).has("ManageMessages")) {
                    manages_messages = true;
                }

                const result: FetchPermissionApi = {
                    permissions: { manages_messages: manages_messages },
                };
                pushString(JSON.stringify(result as FetchPermissionApi));
                callback();
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
                channel_id: message.channelId,
                message_id: message.id,
                author_id: message.author.id,
                content: message.content,
                author_is_bot: message.author.bot,
            } as MessageApi)
        );
        messageCreate();
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
                op_channel_id: reaction.message.channelId,
                op_message_id: reaction.message.id,
                op_author_id: reaction.message.author?.id,
                op_content: reaction.message.content,
                user_id: user.id,
                emoji_name: reaction.emoji.name,
            } as ReactionApi)
        );
        reactionAdd();
    } catch (err) {
        console.log("TypeScript Error: " + String(err));
    }
});

if (!init()) throw new Error("Failed to initialize WASM");
client.login(process.env["DISCORD_TOKEN"]);
