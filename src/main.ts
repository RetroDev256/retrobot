import {
    Client,
    Message,
    Partials,
    GatewayIntentBits,
    type OmitPartialGroupDMChannel,
} from "discord.js";
import ollama from "ollama";
import * as fs from "fs";

const allowedMentions = { parse: [], repliedUser: true };

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

const env = {
    memory: memory,

    readFileApi: (path_ptr: number, path_len: number): boolean => {
        try {
            const path = readString(path_ptr, path_len);
            pushString(fs.readFileSync(path, "utf8"));
            return true;
        } catch (err) {
            console.log("Error: " + String(err));
            return false;
        }
    },
    writeStdoutApi: (out_ptr: number, out_len: number): void => {
        try {
            const output = readString(out_ptr, out_len);
            process.stdout.write(output);
        } catch (err) {
            console.log("Error: " + String(err));
        }
    },
    fillRandomApi: (dest_ptr: number, dest_len: number): void => {
        try {
            const bytes = new Uint8Array(memory.buffer, dest_ptr, dest_len);
            crypto.getRandomValues(bytes);
        } catch (err) {
            console.log("Error: " + String(err));
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
        try {
            const channel_id = readString(channel_id_ptr, channel_id_len);
            const message_id = readString(message_id_ptr, message_id_len);
            const content = readString(content_ptr, content_len);
            (async () => {
                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                await message.reply({ content, allowedMentions });
            })();
        } catch (err) {
            console.log("Error: " + String(err));
        }
    },
};

const buffer = fs.readFileSync("retrobot.wasm");
const module = new WebAssembly.Module(buffer);
const instance = new WebAssembly.Instance(module, { env });
const exports = instance.exports;

const allocateMem = exports["allocateMem"] as (len: number) => number;
const messageCreate = exports["messageCreate"] as () => boolean;
const init = exports["init"] as () => boolean;

client.once("clientReady", (client) => {
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
        if (!messageCreate()) {
            console.log("Error: messageCreate failed");
        }
        handleAiRequest(message);
    } catch (err) {
        console.log("Error: " + String(err));
    }
});

async function handleAiRequest(
    message: OmitPartialGroupDMChannel<Message<boolean>>
) {
    if (message.author.bot) return;
    if (!message.content.startsWith(".ai ")) return;
    const prompt = message.content.slice(4);

    let current: Message = await message.reply("...");

    // The new, simplified system message.
    const system_message = `You are RetroBot™, a helpful AI assistant on this Discord server, created by "Retro_Dev".

Your persona is that of a classic, slightly formal programmer: be polite, direct, and prioritize providing factually accurate, concise information.

You will receive a single message from a user, formatted as "[DisplayName]: message content". Your task is to provide a single, helpful, and self-contained response.

**Strict Rules:**
- You MUST avoid all emojis, emoticons, and overly casual slang.
- You MUST refuse to discuss sexual, political, or deeply controversial topics.
- Your response MUST be a single, self-contained block of text.`;

    const author_name = message.member
        ? message.member.displayName
        : message.author.username;

    let messages = [
        { role: "system", content: system_message },
        { role: "user", content: `[${author_name}]: ${prompt}` },
    ];

    const response = await ollama.chat({
        model: "gemma3:12b",
        messages: messages,
        stream: true,
        keep_alive: -1,
        options: {
            temperature: 0.7,
            num_ctx: 32_768,
        },
    });

    let completed_queue: string[] = [];
    let last_time = Date.now();
    let buffer: string = "";
    let dirty: boolean = false;

    for await (const chunk of response) {
        const content = chunk.message.content;
        const sum_length = content.length + buffer.length;

        if (sum_length <= 2000) {
            buffer += content;
            dirty = true;
        } else {
            completed_queue.push(buffer);
            buffer = content;
            dirty = true;
        }

        if (Date.now() - last_time >= 500) {
            const content = completed_queue.shift();
            if (content !== undefined) {
                current = await current.reply({ content, allowedMentions });
            } else {
                current.edit({ content: buffer, allowedMentions });
                dirty = false;
            }
            last_time = Date.now();
        }
    }

    while (true) {
        const content = completed_queue.shift();
        if (content === undefined) break;
        current = await current.reply({ content, allowedMentions });
    }

    if (buffer.length != 0 && dirty) {
        current.edit({ content: buffer, allowedMentions });
    }
}

if (!init()) throw new Error("Failed to initialize WASM");
client.login(process.env["DISCORD_TOKEN"]);
