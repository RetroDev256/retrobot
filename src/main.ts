import {
    Client,
    Message,
    Partials,
    GatewayIntentBits,
    type SendableChannels,
    type Channel,
    User,
    GuildMember,
    Guild,
} from "discord.js";
import words from "../words.json";
import { randomInt } from "crypto";
import ollama from "ollama";
import { XMLParser } from "fast-xml-parser";

const client = new Client({
    // Gimme everything ya got (permissions)
    intents: Object.values(GatewayIntentBits) as GatewayIntentBits[],
    partials: Object.values(Partials) as Partials[],
});

// ------------------------------------------------------------ STARTUP MESSAGE

// Display bot user tag when we have logged in
client.once("clientReady", async (client) => {
    await debug(`Logged in as ${client.user.tag}`);
});

// ----------------------------------------------------------- WELCOME MESSAGES

// Welcome new users of a server by greeting them
client.on("guildMemberAdd", async (member) => {
    const channel = member.guild.systemChannel;
    if (channel === null) return;
    await channel.send(`Welcome ${member}! o/`);
});

// ---------------------------------------------------- COMMAND IMPLEMENTATIONS

const help_text = `\`\`\`
USAGE:
- .acr  [WORD]        -> generate an acronym
- .calc [EXPR]        -> evaluate some math
- .dice [SIDES]       -> roll a die
- .flip               -> flip a coin
- .help               -> display this message
- .look [IMAGE]       -> describe an image
- .msg  [USER] [TEXT] -> message a user
- .xkcd               -> get the latest xkcd
\`\`\``;

client.on("messageCreate", async (message) => {
    switch (message.content.toLowerCase()) {
        case "no u":
            return await message.reply("-# no u");
        case "ping":
            return await message.reply("-# pong");
        case "pong":
            return await message.reply("-# ping");
        case "brownie clicker":
            return await message.reply("-# <https://alloc.dev/brownie/>");
        case "fortuna tools":
            return await message.reply("-# <https://alloc.dev/fortuna/>");
        case "binary counter":
            return await message.reply(
                "-# https://alloc.dev/2026/01/09/counter.mp4",
            );
    }

    try {
        await commandAcr(message);
        await commandCalc(message);
        await commandDice(message);
        await commandFlip(message);
        await commandHelp(message);
        await commandLook(message);
        await commandMsg(message);
        await commandXkcd(message);
    } catch (err) {
        const safe = `${err}`.replace(/\s+/g, " ");
        await message.reply("-# " + safe);
    }
});

async function commandAcr(message: Message) {
    if (!message.content.startsWith(".acr ")) return;

    // filter out the odd stuff
    const word = message.content
        .slice(5)
        .toLowerCase()
        .replace(/[^a-z]/g, "");

    if (word === "") return await message.reply("-# missing letters");

    // map each letter to a random word
    const chosen = [];
    const base = "a".charCodeAt(0);
    for (let i = 0; i < word.length; i++) {
        const index = word.charCodeAt(i) - base;
        const list = words[index] as string[];
        chosen.push(list[randomInt(list?.length)]);
    }

    // respond with the constructed acronym
    await message.reply("-# " + chosen.join(" "));
}

async function commandCalc(message: Message) {
    if (!message.content.startsWith(".calc ")) return;
    const expr = message.content.substring(6);
    await message.reply("-# = " + expr); // TODO
}

async function commandHelp(message: Message) {
    if (message.content !== ".help") return;
    await message.reply(help_text);
}

async function commandLook(message: Message) {
    if (message.content !== ".look") return;

    if (message.attachments.size === 0)
        return await message.reply("-# missing an attachment");
    if (message.attachments.size > 1)
        return await message.reply("-# too many attachments");

    const file_0 = message.attachments.at(0);
    if (!file_0?.contentType?.startsWith("image/"))
        return await message.reply("-# not an image");

    // Fetch and convert to base 64 for passing to ollama
    const img = await (await fetch(file_0.url)).bytes();
    const loading_msg = await message.reply("-# processing...");

    // Run the model and ask it to describe the image
    const prompt = "Describe this image in one short paragraph.";
    const response = await ollama.chat({
        messages: [{ role: "user", content: prompt, images: [img] }],
        model: process.env["OLLAMA_IMAGE_MODEL"] as string,
        stream: true,
        think: false,
    });

    // Update the message on each token
    let content: string = "";
    for await (const chunk of response) {
        if (chunk.message.content !== "") {
            content += chunk.message.content;
            const fmt = "```" + content + "```";
            await safeEdit(loading_msg, fmt);
        }
    }
}

async function commandDice(message: Message) {
    if (!message.content.startsWith(".dice ")) return;
    const side_str = message.content.slice(6);
    if (side_str === "") return await message.reply("-# missing side count");
    const sides = parseInt(side_str);
    if (isNaN(sides)) return await message.reply("-# invalid side count");
    await message.reply(`-# ${randomInt(sides) + 1}`);
}

async function commandFlip(message: Message) {
    if (message.content !== ".flip") return;

    if (randomInt(2) == 0) {
        await message.reply(`-# heads`);
    } else {
        await message.reply(`-# tails`);
    }
}

async function commandMsg(message: Message) {
    if (!message.content.startsWith(".msg ")) return;
    const command = message.content.slice(5).split(" ");
    if (command.length < 2) return await message.reply("-# missing arguments");

    // Find the user
    const target: string = command[0] as string;
    const user = await selectUser(target, message.guild);
    if (user === undefined) return await message.reply("-# unknown user");

    // Format the resulting message
    const user_id = message.author.id;
    const global = message.author.globalName;
    const content = command.slice(1).join(" ");
    const header = `\`.msg ${user_id}\` **${global}** :`;

    if (/[\t\n]/g.test(content)) {
        // Send in a codeblock if they had a tab or newline
        await user.send(header + "\n```" + content + "```");
    } else {
        // Send on the same line if they had no tab or newline
        await user.send(header + " " + content);
    }
}

async function commandXkcd(message: Message) {
    if (message.content !== ".xkcd") return;

    const rss_link = "https://xkcd.com/rss.xml";
    const text = await (await fetch(rss_link)).text();
    const data = new XMLParser().parse(text);
    const link = data?.rss?.channel?.item?.[0]?.link;
    await message.reply(("-# " + link) as string);
}

// --------------------------------------------------- COMMAND HELPER FUNCTIONS

async function selectUser(
    user: string,
    guild: Guild | null,
): Promise<User | undefined> {
    // PRIORITY 0: interpret the user as a username
    const find_0 = (u: User) => u.username === user;
    const search_0 = client.users.cache.find(find_0);
    if (search_0 !== undefined) return search_0;

    // PRIORITY 1: interpret the user as a guild displayname
    const find_1 = (m: GuildMember) => m.displayName === user;
    const search_1 = guild?.members.cache.find(find_1)?.user as User;
    if (search_1 !== undefined) return search_1;

    // PRIORITY 2: interpret the user as a global name
    const find_2 = (u: User) => u.globalName === user;
    const search_2 = client.users.cache.find(find_2) as User;
    if (search_2 !== undefined) return search_2;

    // PRIORITY 3: interpret the user as a snowflake
    return await client.users.fetch(user);
}

async function safeSend(channel: Channel, content: string) {
    const sendable = channel as SendableChannels;
    const allowedMentions = { parse: [], repliedUser: true };
    return await sendable.send({ content, allowedMentions });
}

// async function safeReply(message: Message, content: string) {
//     const allowedMentions = { parse: [], repliedUser: true };
//     return await message.reply({ content, allowedMentions });
// }

async function safeEdit(message: Message, content: string) {
    const allowedMentions = { parse: [], repliedUser: true };
    return await message.edit({ content, allowedMentions });
}

async function debug(content: string) {
    console.log("DEBUG: " + content);
    const debug_channel = process.env["DEBUG_CHANNEL_ID"]!;
    const dbg_content = "```\nDEBUG: " + content + "\n```";
    const channel = await client.channels.fetch(debug_channel);
    if (channel !== null) await safeSend(channel, dbg_content);
}

// ---------------------------------------------------- RETROBOT INITIALIZATION

client.login(process.env["DISCORD_TOKEN"]);

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

// if (!init()) throw new Error("Failed to initialize WASM");
