import { Client, Message, Partials, GatewayIntentBits } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ollama from "ollama";
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
                await safeReply(message, content);
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

const generative_ai = new GoogleGenerativeAI(process.env["GEMINI_API_KEY"]!);
const gemini_model = generative_ai.getGenerativeModel({
    model: "gemini-2.5-flash",
});

async function handleAiRequest(message: Message) {
    if (message.author.bot) return;
    if (!message.content.startsWith(".ai ")) return;
    const prompt = message.content.slice(4);

    try {
        const result = await gemini_model.generateContentStream(prompt);
        const stream = adaptGeminiStream(result.stream);
        await aiStreamResponse(message, stream);
    } catch (err) {
        console.log("Warning: " + String(err));
        await safeReply(message, "Gemini API is rate limited - using Ollama.");

        const response = await ollama.chat({
            model: "llama3.2:3b",
            messages: [{ role: "user", content: prompt }],
            stream: true,
            keep_alive: -1,
            options: {
                temperature: 0.7,
                num_ctx: 32_768,
            },
        });

        const stream = adaptOllamaStream(response);
        await aiStreamResponse(message, stream);
    }
}

// Adapt response from streaming gemini chat for aiStreamResponse
async function* adaptGeminiStream(stream: any) {
    for await (const segment of stream) {
        yield segment.text();
    }
}

// Adapt response from streaming ollama.chat for aiStreamResponse
async function* adaptOllamaStream(stream: any) {
    for await (const segment of stream) {
        yield segment.message.content;
    }
}

async function aiStreamResponse(message: Message, stream: any) {
    let current = await safeReply(message, "-# Loading...");
    let last_time = Date.now();
    let buffer: string = "";

    for await (const segment of stream) {
        buffer += segment;

        if (buffer.length > 2000) {
            const sliced = messageSlice(buffer);
            await safeEdit(current, sliced[0]!);

            for (let i = 1; i < sliced.length; i += 1) {
                current = await safeReply(current, sliced[i]!);
            }

            buffer = sliced[sliced.length - 1]!;
            last_time = Date.now();
        }

        if (Date.now() - last_time >= 1000) {
            if (await safeEdit(current, buffer)) {
                last_time = Date.now();
            }
        }
    }

    await safeEdit(current, buffer);
}

// Splits a string into one or more message contents.
// Split at a block, newline, word, then at 2000 characters.
function messageSlice(message: string): string[] {
    let messages: string[] = [];
    let remaining: string = message;

    while (remaining.length != 0) {
        const max_len = 2000 - "```abc\n".length;
        const limit = Math.min(remaining.length, max_len);

        const consideration = remaining.slice(0, limit);
        const newline = consideration.lastIndexOf("\n");
        const space = consideration.lastIndexOf(" ");

        let split = limit;

        if (newline > Math.max(0, max_len - 256)) {
            split = newline;
        } else if (space > Math.max(0, max_len - 128)) {
            split = space;
        }

        messages.push(remaining.slice(0, split));
        remaining = remaining.slice(split);

        if (split != remaining.length) {
            const block = remaining.slice(0, limit);
            const cb_matches = block.match(/```/g) || [];
            const after_split = block.split("```")[cb_matches.length];
            const lang_name = after_split?.match(/^([a-z]{1,3})\n/);

            if (cb_matches.length % 2 !== 0) {
                messages.push(messages.pop() + "```");
                const name = lang_name ? lang_name[1] : "";
                remaining = "```" + name + "\n" + remaining;
            }
        }
    }

    return messages;
}

// Disable unwanted pings while replying to a message
async function safeReply(message: Message, content: string) {
    const allowedMentions = { parse: [], repliedUser: true };
    return message.reply({ content, allowedMentions });
}

// Memoize api calls for message edits and disable unwanted pings
// Returns true if the api call was sent, otherwise returns false
async function safeEdit(message: Message, content: string) {
    if (message.content === content) return false;
    const allowedMentions = { parse: [], repliedUser: true };
    await message.edit({ content, allowedMentions });
    return true;
}

if (!init()) throw new Error("Failed to initialize WASM");
client.login(process.env["DISCORD_TOKEN"]);
