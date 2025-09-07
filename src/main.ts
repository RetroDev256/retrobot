import {
    Client,
    Message,
    Partials,
    GatewayIntentBits,
    type Channel,
    type SendableChannels,
} from "discord.js";
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
            debug(String(err));
            return false;
        }
    },
    writeStdoutApi: (out_ptr: number, out_len: number): void => {
        try {
            const output = readString(out_ptr, out_len);
            process.stdout.write(output);
        } catch (err) {
            debug(String(err));
        }
    },
    fillRandomApi: (dest_ptr: number, dest_len: number): void => {
        try {
            const bytes = new Uint8Array(memory.buffer, dest_ptr, dest_len);
            crypto.getRandomValues(bytes);
        } catch (err) {
            debug(String(err));
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
            debug(String(err));
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

client.once("clientReady", async (client) => {
    let info_message = `Logged in as ${client.user?.tag}`;
    for (const guild of client.guilds.cache.values()) {
        info_message += `\n - ${guild.name}: ${guild.memberCount} members`;
    }

    await debug(info_message);
});

client.on("guildMemberAdd", async (member) => {
    const channel = member.guild.systemChannel;
    if (channel === null) return;
    await channel.send(`Welcome ${member}! o/`);
});

client.on("messageCreate", async (message) => {
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
            await debug("messageCreate failed");
        }
        handleAiRequest(message);
    } catch (err) {
        await debug(String(err));
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
        await debug(String(err));

        const response = await ollama.chat({
            options: { temperature: 0.7, num_ctx: 32_768 },
            messages: [{ role: "user", content: prompt }],
            model: "llama3.2:3b",
            keep_alive: -1,
            stream: true,
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
    let buffer: string = "";
    let to_send: string[] = [];
    let last_time = Date.now();

    for await (const segment of stream) {
        buffer += segment;

        const line_split = buffer.split("\n");
        buffer = line_split[line_split.length - 1]!;
        for (let i = 0; i < line_split.length - 1; i += 1) {
            if (line_split[i]!.trim().length === 0) continue;
            to_send.push(line_split[i]!);
        }

        while (Date.now() - last_time > 1000) {
            const next_chunk = lineCollate(to_send, 4096);
            if (next_chunk === undefined) break;
            await safeSend(message.channel, next_chunk);
            last_time = last_time + 1000;
        }
    }

    if (buffer.trim().length !== 0) {
        to_send.push(buffer);
    }

    while (to_send.length > 0) {
        const chunk = lineCollate(to_send, 4096)!;
        await safeSend(message.channel, chunk);
    }
}

// Disable unwanted pings when sending a message
async function safeSend(channel: Channel, content: string) {
    const sendable = channel as SendableChannels;
    const allowedMentions = { parse: [], repliedUser: true };
    await sendable.send({
        embeds: [{ description: content }],
        allowedMentions,
    });
}

// Disable unwanted pings while replying to a message
async function safeReply(message: Message, content: string) {
    const allowedMentions = { parse: [], repliedUser: true };
    return message.reply({
        embeds: [{ description: content }],
        allowedMentions,
    });
}

// groups lines into the biggest message that can be formed below len
function lineCollate(list: string[], len: number): string | undefined {
    const first: string | undefined = list.shift();
    if (first === undefined) return undefined;

    if (first.length > len) {
        list.unshift(first.slice(len));
        return first.slice(0, len);
    }

    let sum: string = first;
    while (true) {
        if (list.length === 0) return sum;
        if (sum.length + list[0]!.length >= len) return sum;
        sum = sum + "\n" + list.shift()!;
    }
}

async function debug(content: string) {
    console.log("DEBUG: " + content);
    const bot_testing = "896098449672527963";
    const dbg_content = "```\nDEBUG: " + content + "\n```";
    const channel = await client.channels.fetch(bot_testing);
    if (channel !== null) await safeSend(channel, dbg_content);
}

// // Memoize api calls for message edits and disable unwanted pings
// // Returns true if the api call was sent, otherwise returns false
// async function safeEdit(message: Message, content: string) {
//     if (message.content === content) return false;
//     const allowedMentions = { parse: [], repliedUser: true };
//     await message.edit({ content, allowedMentions });
//     return true;
// }

if (!init()) throw new Error("Failed to initialize WASM");
client.login(process.env["DISCORD_TOKEN"]);
