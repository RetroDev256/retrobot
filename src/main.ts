import {
    Client,
    Message,
    Partials,
    GatewayIntentBits,
    type SendableChannels,
    Attachment,
} from "discord.js";
import ollama from "ollama";

const client = new Client({
    // Gimme everything ya got (permissions)
    intents: Object.values(GatewayIntentBits) as GatewayIntentBits[],
    partials: Object.values(Partials) as Partials[],
});

// const memory = new WebAssembly.Memory({ initial: 64 });

// function readString(ptr: number, len: number): string {
//     const bytes = new Uint8Array(memory.buffer, ptr, len);
//     return new TextDecoder().decode(bytes);
// }

// function pushString(str: string): void {
//     const utf_8 = new TextEncoder().encode(str);
//     const ptr = allocateMem(utf_8.length);
//     if (ptr === 0) throw new Error("Out of memory");
//     const str_mem = new Uint8Array(memory.buffer, ptr, utf_8.length);
//     str_mem.set(utf_8);
// }

// type MessageApi = {
//     channel_id: string;
//     message_id: string;
//     author_id: string;
//     content: string;
//     is_bot: boolean;
// };

// const env = {
//     memory: memory,
//     readFileApi: (path_ptr: number, path_len: number): boolean => {
//         try {
//             const path = readString(path_ptr, path_len);
//             pushString(fs.readFileSync(path, "utf8"));
//             return true;
//         } catch (err) {
//             debug(String(err));
//             return false;
//         }
//     },
//     writeStdoutApi: (out_ptr: number, out_len: number): void => {
//         try {
//             const output = readString(out_ptr, out_len);
//             process.stdout.write(output);
//         } catch (err) {
//             debug(String(err));
//         }
//     },
//     fillRandomApi: (dest_ptr: number, dest_len: number): void => {
//         try {
//             const bytes = new Uint8Array(memory.buffer, dest_ptr, dest_len);
//             crypto.getRandomValues(bytes);
//         } catch (err) {
//             debug(String(err));
//         }
//     },
//     replyMessageApi: (
//         channel_id_ptr: number,
//         channel_id_len: number,
//         message_id_ptr: number,
//         message_id_len: number,
//         content_ptr: number,
//         content_len: number,
//     ): void => {
//         try {
//             const channel_id = readString(channel_id_ptr, channel_id_len);
//             const message_id = readString(message_id_ptr, message_id_len);
//             const content = readString(content_ptr, content_len);
//             (async () => {
//                 const channel = await client.channels.fetch(channel_id);
//                 if (!channel || !("messages" in channel)) return;
//                 const message = await channel.messages.fetch(message_id);
//                 await safeReply(message, content);
//             })();
//         } catch (err) {
//             debug(String(err));
//         }
//     },
// };

// const buffer = fs.readFileSync("retrobot.wasm");
// const module = new WebAssembly.Module(buffer);
// const instance = new WebAssembly.Instance(module, { env });
// const exports = instance.exports;

// const allocateMem = exports["allocateMem"] as (len: number) => number;
// const messageCreate = exports["messageCreate"] as () => boolean;
// const init = exports["init"] as () => boolean;

// Display bot user tag when we have logged in
client.once("clientReady", async (client) => {
    await debug(`Logged in as ${client.user.tag}`);
});

// Welcome new users of a server by greeting them
client.on("guildMemberAdd", async (member) => {
    const channel = member.guild.systemChannel;
    if (channel === null) return;
    await channel.send(`Welcome ${member}! o/`);
});

client.on("messageCreate", async (message) => {
    await commandHelp(message);
    await commandLook(message);
});

const help_text = `\`\`\`
USAGE:
- .help         -> display this message
- .look [IMAGE] -> describe an image
\`\`\``;

async function commandHelp(message: Message) {
    if (message.content !== ".help") return;
    await safeReply(message, help_text);
}

async function commandLook(message: Message) {
    if (message.content !== ".look") return;

    if (message.attachments.size === 0)
        return await safeReply(message, "Missing an attachment.");
    if (message.attachments.size > 1)
        return await safeReply(message, "Too many attachments.");

    const file_0 = message.attachments.at(0);
    if (!file_0?.contentType?.startsWith("image/"))
        return await safeReply(message, "Not an image.");

    // Fetch and convert to base 64 for passing to ollama
    const res = await fetch((file_0 as Attachment).url);
    const res_b64 = Buffer.from(await res.arrayBuffer()).toBase64();
    const loading_msg = await safeReply(message, "-# Processing...");

    // Run the model and ask it to describe the image
    const response = await ollama.chat({
        model: "qwen3.6:latest",
        stream: false,
        messages: [
            {
                role: "user",
                content: "Describe this in a short paragraph.",
                images: [res_b64],
            },
        ],
    });

    // Serve the response back to discord
    const content = response.message.content;
    const resp = "```" + content + "```";
    await safeReply(message, resp);
    await loading_msg.delete();
}

async function safeSend(channel: SendableChannels, content: string) {
    const allowedMentions = { parse: [], repliedUser: true };
    return channel.send({ content, allowedMentions });
}

async function safeReply(message: Message, content: string) {
    const allowedMentions = { parse: [], repliedUser: true };
    return message.reply({ content, allowedMentions });
}

async function debug(content: string) {
    console.log("DEBUG: " + content);
    const debug_channel = process.env["DEBUG_CHANNEL_ID"]!;
    const dbg_content = "```\nDEBUG: " + content + "\n```";
    const channel = await client.channels.fetch(debug_channel);
    if (channel !== null)
        await safeSend(channel as SendableChannels, dbg_content);
}

// if (!init()) throw new Error("Failed to initialize WASM");
client.login(process.env["DISCORD_TOKEN"]);
