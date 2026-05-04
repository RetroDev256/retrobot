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
import { randomInt } from "crypto";
import { XMLParser } from "fast-xml-parser";
import words from "../words.json";

// discord.js client: all intents and partials are requested on login
const intents = Object.values(GatewayIntentBits) as GatewayIntentBits[];
const partials = Object.values(Partials) as Partials[];
const client = new Client({ intents: intents, partials: partials });

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

const help_text = `
**USAGE:**
-# \`.acr [WORD]\` generate an acronym
-# \`.calc [EXPR]\` evaluate some math
-# \`.clear\` clear slop session
-# \`.dice [SIDES]\` roll a die
-# \`.flip\` flip a coin
-# \`.gen [TEXT]\` simple LLM prompting
-# \`.hate [USER]\` hate a user
-# \`.help\` display this message
-# \`.look [IMAGE]\` describe an image
-# \`.love [USER]\` love a user
-# \`.msg [USER] [TEXT]\` message a user
-# \`.note [TEXT]\` message yourself
-# \`.say [TEXT]\` say something
-# \`.slop [TEXT]\` LLM with session
-# \`.stop\` stop .slop, .gen, and .look
-# \`.smite [USER]\` mute for 30 seconds
-# \`.xkcd\` get the latest xkcd
`;

client.on("messageCreate", async (message) => {
    // Do not react to this or other bots
    if (message.author.bot) return;

    try {
        await reactMaps(message);
        await replyMaps(message);
        await replyGhat(message);
        await commands(message);
    } catch (err: any) {
        // Report unhandled errors in small lettering
        const safe = `-# ${err}`.replace(/\s+/g, " ");
        message.reply(safe).catch(() => {}); // ignore
    }
});

async function reactMaps(message: Message) {
    const react_map: { [key: string]: string } = { nice: "👌" };
    const react = react_map[message.content.toLowerCase()];
    if (react !== undefined) return await message.react(react);
}

async function replyMaps(message: Message) {
    const reply_map: { [key: string]: string } = {
        f: "-# RIP!",
        "no u": "-# no u",
        sigh: "-# no u",
        echo: "-# echo",
        ping: "-# pong",
        pong: "-# ping",
        "my eyes": "-# no u",
        rip: "-# Rest in pieces.",
        "fortuna tools": "-# <https://alloc.dev/fortuna/>",
        "brownie clicker": "-# <https://alloc.dev/brownie/>",
        "binary counter": "-# https://alloc.dev/2026/01/09/counter.mp4",
    };

    const reply = reply_map[message.content.toLowerCase()];
    if (reply !== undefined) return await message.reply(reply);
}

async function replyGhat(message: Message) {
    if (/\bghast\b/gi.test(message.content))
        return await message.reply("Excuse you! I think you meant ***GHAT***");
}

async function commands(message: Message) {
    switch (message.content.split(" ")[0]) {
        case ".acr":
            return await commandAcr(message);
        case ".calc":
            return await commandCalc(message);
        case ".clear":
            return await commandClear(message);
        case ".dice":
            return await commandDice(message);
        case ".flip":
            return await commandFlip(message);
        case ".gen":
            return await commandGen(message);
        case ".hate":
            return await commandHate(message);
        case ".help":
            return await commandHelp(message);
        case ".look":
            return await commandLook(message);
        case ".love":
            return await commandLove(message);
        case ".msg":
            return await commandMsg(message);
        case ".note":
            return await commandNote(message);
        case ".say":
            return await commandSay(message);
        case ".slop":
            return await commandSlop(message);
        case ".stop":
            return await commandStop(message);
        case ".smite":
            return await commandSmite(message);
        case ".xkcd":
            return await commandXkcd(message);
    }
}

async function commandAcr(message: Message) {
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
    const expr = message.content.substring(6);
    await message.reply("-# = " + expr); // TODO
}

async function commandClear(message: Message) {
    slop_message_hist[message.channel.id] = [];
    await message.react("🗑️");
}

async function commandGen(message: Message) {
    const prompt = message.content.slice(5);
    if (prompt.length === 0) return await message.reply("-# missing prompt");

    // Create the original response message to pump tokens
    const loading_msg = await message.reply("-# processing...");
    const writer = new ChunkedReplyWriter(loading_msg);

    // Create an abort controller for the .stop command
    const { signal, cleanup } = await stopAdd(message);

    try {
        const body = {
            model: process.env["OLLAMA_TEXT_MODEL"] as string,
            options: { num_ctx: 16384 },
            prompt: prompt,
            stream: true,
            think: false,
            raw: true,
        };

        // Fetch from the ollama API on the server with the body & signal
        const response = await fetch("http://localhost:11434/api/generate", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            method: "POST",
            signal,
        });

        if (response.body === null)
            // This error should be rare, I hope - not sure about it.
            return await message.reply("-# no ollama response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer: string = "";

        while (true) {
            // Read the next token from the response stream
            const { value, done } = await reader.read();
            if (done || signal.aborted) break;

            // Add the decoded value to the buffer
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); // NDJSON format
            buffer = lines.pop() || ""; // retain partial JSON

            // Process the completed lines from ollama
            for (const line of lines) {
                const json = JSON.parse(line);
                writer.push(json.response); 
            }
        }
    } finally {
        cleanup();
    }
}

const hate_cooldowns: { [key: string]: number } = {};
async function commandHate(message: Message) {
    const user = await selectUser(message.content.slice(6), message.guild);
    if (user === undefined) return await message.reply("-# unknown user");

    // Ratelimit the user if they attempt to use .hate too often
    const last_time = hate_cooldowns[message.author.id];
    if (last_time !== undefined) {
        const rem = Math.ceil((last_time - Date.now()) / 1000 + 60);
        const rate_msg = `-# slow down! ${rem} seconds remaining...`;
        if (rem > 0) return await message.reply(rate_msg);
    }

    const unsendable = !message.channel.isSendable();
    if (unsendable) return await message.reply("-# channel unsendable");
    const content = `🗡️💀🔪 ${message.author} hates ${user} 🔪🩸💀`;
    await (message.channel as SendableChannels).send(content);
    hate_cooldowns[message.author.id] = Date.now();
}

async function commandHelp(message: Message) {
    await message.reply(help_text);
}

async function commandLook(message: Message) {
    if (message.attachments.size === 0)
        return await message.reply("-# missing an attachment");
    if (message.attachments.size > 1)
        return await message.reply("-# too many attachments");

    const file_0 = message.attachments.at(0);
    if (!file_0?.contentType?.startsWith("image/"))
        return await message.reply("-# not an image");

    // Fetch and convert to base 64 for passing to ollama
    const loading_msg = await message.reply("-# processing...");
    const writer = new ChunkedReplyWriter(loading_msg);

    // Create an abort controller for the .stop command
    const { signal, cleanup } = await stopAdd(message);

    try {
        // Run the model and ask it to describe the image
        const img = await (await fetch(file_0.url)).bytes();
        const prompt = "Describe this image in one short paragraph.";
        const msg = { role: "user", content: prompt, images: [img.toBase64()] };
        const model = process.env["OLLAMA_IMAGE_MODEL"] as string;
        const body = { model: model, messages: [msg], stream: true };

        // Fetch from the ollama API on the server with the body & signal
        const response = await fetch("http://localhost:11434/api/chat", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            method: "POST",
            signal,
        });

        if (response.body === null)
            // This error should be rare, I hope - not sure about it.
            return await message.reply("-# no ollama response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer: string = "";

        while (true) {
            // Read the next token from the response stream
            const { value, done } = await reader.read();
            if (done || signal.aborted) break;

            // Add the decoded value to the buffer
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); // NDJSON format
            buffer = lines.pop() || ""; // retain partial JSON

            // Process the completed lines from ollama
            for (const line of lines) {
                const json = JSON.parse(line);
                writer.push(json.message.content);
            }
        }
    } finally {
        cleanup();
    }
}

const love_cooldowns: { [key: string]: number } = {};
async function commandLove(message: Message) {
    const user = await selectUser(message.content.slice(6), message.guild);
    if (user === undefined) return await message.reply("-# unknown user");

    // Ratelimit the user if they attempt to use .love too often
    const last_time = love_cooldowns[message.author.id];
    if (last_time !== undefined) {
        const rem = Math.ceil((last_time - Date.now()) / 1000 + 60);
        const rate_msg = `-# slow down! ${rem} seconds remaining...`;
        if (rem > 0) return await message.reply(rate_msg);
    }

    const unsendable = !message.channel.isSendable();
    if (unsendable) return await message.reply("-# channel unsendable");
    const content = `❤️😊❤️ <@${message.author.id}> loves <@${user.id}> ❤️😚❤️`;
    await (message.channel as SendableChannels).send(content);
    love_cooldowns[message.author.id] = Date.now();
}

async function commandDice(message: Message) {
    const side_str = message.content.slice(6);
    if (side_str === "") return await message.reply("-# missing side count");
    const sides = parseInt(side_str);
    if (isNaN(sides)) return await message.reply("-# invalid side count");
    await message.reply(`-# ${randomInt(sides) + 1}`);
}

async function commandFlip(message: Message) {
    if (randomInt(2) == 0) {
        await message.reply(`-# heads`);
    } else {
        await message.reply(`-# tails`);
    }
}

async function commandMsg(message: Message) {
    const command = message.content.slice(5).split(" ");
    const content = command.slice(1).join(" ");

    // Find & direct message the user
    const user = await selectUser(command[0] as string, message.guild);
    if (user === undefined) return await message.reply("-# unknown user");
    await user.send(`-# .msg ${message.author}\n${content}`);
    await message.react("📨");
}

async function commandNote(message: Message) {
    await message.author.send(`-# .note\n${message.content.slice(6)}`);
    await message.react("🗒️");
}

async function commandSay(message: Message) {
    const unsendable = !message.channel.isSendable();
    if (unsendable) return await message.reply("-# channel unsendable");
    await safeSend(message.channel, message.content.slice(5));
}

const slop_message_hist: { [key: string]: any } = {};
async function commandSlop(message: Message) {
    const prompt = message.content.slice(6);
    if (prompt.length === 0)
        return await message.reply("-# missing slop prompt");

    // Create the original response message to pump tokens
    const loading_msg = await message.reply("-# processing...");
    const writer = new ChunkedReplyWriter(loading_msg);

    // Create a channel message history if it does not exist
    if (slop_message_hist[message.channel.id] === undefined)
        slop_message_hist[message.channel.id] = [];

    // Append the target message to the history
    const hist_a = { role: "user", content: prompt };
    slop_message_hist[message.channel.id].push(hist_a);

    // Record the LLM response
    let response_text = "";

    // Create an abort controller for the .stop command
    const { signal, cleanup } = await stopAdd(message);

    try {
        const body = {
            model: process.env["OLLAMA_TEXT_MODEL"] as string,
            messages: slop_message_hist[message.channel.id],
            options: { num_ctx: 16384 },
            stream: true,
            think: false,
        };

        // Fetch from the ollama API on the server with the body & signal
        const response = await fetch("http://localhost:11434/api/chat", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            method: "POST",
            signal,
        });

        if (response.body === null)
            // This error should be rare, I hope - not sure about it.
            return await message.reply("-# no ollama response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer: string = "";

        while (true) {
            // Read the next token from the response stream
            const { value, done } = await reader.read();
            if (done || signal.aborted) break;

            // Add the decoded value to the buffer
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); // NDJSON format
            buffer = lines.pop() || ""; // retain partial JSON

            // Process the completed lines from ollama
            for (const line of lines) {
                const json = JSON.parse(line);
                writer.push(json.message.content);
                response_text += json.message.content;
            }
        }
    } finally {
        // Store the llm response in the slop history
        const hist_b = { role: "assistant", content: response_text };
        slop_message_hist[message.channel.id].push(hist_b);

        // Clean up the abort controller
        cleanup();
    }
}

const stop_queues = new Map<string, AbortController[]>();
async function commandStop(message: Message) {
    const controller = stop_queues.get(message.channel.id)?.shift();
    if (controller === undefined) return message.reply("-# nothing running");
    controller.abort("aborted via .stop");
    await message.react("🛑");
}

const smite_cooldowns: { [key: string]: number } = {};
async function commandSmite(message: Message) {
    const user = await selectUser(message.content.slice(7), message.guild);
    if (user === undefined) return await message.react("-# unknown user");

    // Ratelimit the user if they attempt to use .smite too often
    const last_time = smite_cooldowns[message.author.id];
    if (last_time !== undefined) {
        const rem = Math.ceil((last_time - Date.now()) / 1000 + 60);
        const rate_msg = `-# slow down! ${rem} seconds remaining...`;
        if (rem > 0) return await message.reply(rate_msg);
    }

    // Select the user to smite - must be within the same server
    if (message.guild === null) return await message.reply("-# not in server");
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (member === null) return await message.reply("-# not in server");

    // Mute the user for 30 seconds
    try {
        await member.timeout(30_000, "you have been smitten");
    } catch {
        return await safeReply(message, `-# unable to smite ${user}`);
    }

    smite_cooldowns[message.author.id] = Date.now();
    await message.react("🗡️");
}

async function commandXkcd(message: Message) {
    const rss_link = "https://xkcd.com/rss.xml";
    const text = await (await fetch(rss_link)).text();
    const data = new XMLParser().parse(text);
    const link = data?.rss?.channel?.item?.[0]?.link;
    await message.reply(`-# ${link}`);
}

// --------------------------------------------------- COMMAND HELPER FUNCTIONS

class ChunkedReplyWriter {
    reply: Message;
    buffer: string = "";
    dirty: boolean = false;
    flushing: boolean = false;

    constructor(reply: Message) {
        this.reply = reply;
    }

    async push(chunk: string) {
        // Ensure that the buffer gets the updated text appended
        this.buffer += chunk;
        // Ensure we don't get issues with formatting code
        const safe_ticks: string = "\u200B`\u200B`\u200B`\u200B";
        this.buffer = this.buffer.replace(/```/g, safe_ticks);
        // A change has been made to the buffer, we are dirty
        this.dirty = true;
        // Send the message edit over to discord
        this.update().catch((err: any) => {
            // Report unhandled errors in small lettering
            const safe = `-# ${err}`.replace(/\s+/g, " ");
            this.reply.reply(safe).catch(() => {}); // ignore
        });
    }

    async update() {
        // Don't update concurrently - we would be ratelimited
        if (this.flushing) return;
        // mark the update as "in flight" - we are sending
        this.flushing = true;

        // Continually send updates while our buffer is dirty
        while (this.dirty) {
            this.dirty = false;

            if (this.buffer.length > 1994) {
                // PRIORITY 0: paragraph breaks
                let split = this.buffer.lastIndexOf("\n\n", 1994);

                if (split < 1000) {
                    // PRIORITY 1: new lines
                    split = this.buffer.lastIndexOf("\n", 1994);
                    if (split < 1500) {
                        // PRIORITY 2: tabs
                        split = this.buffer.lastIndexOf("\t", 1994);
                        if (split < 1750) {
                            // PRIORITY 3: spaces
                            split = this.buffer.lastIndexOf(" ", 1994);
                            if (split < 1950) {
                                // PRIORITY 4: cutting
                                split = 1994;
                            }
                        }
                    }
                }

                // Determine the contents of the two messages
                const fmt_a = "```" + this.buffer.slice(0, split) + "```";
                this.buffer = this.buffer.slice(split);
                const fmt_b = "```" + this.buffer + "```";

                // Update the old reply and send a new reply
                await safeEdit(this.reply, fmt_a);
                this.reply = await safeReply(this.reply, fmt_b);
            } else {
                // Content can fit within the one message
                await safeEdit(this.reply, "```" + this.buffer + "```");
            }
        }

        // mark the update as no longer "in flight"
        this.flushing = false;
    }
}

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

    try {
        // PRIORITY 3: interpret the user as a snowflake
        return await client.users.fetch(user);
    } catch {}

    try {
        // PRIORITY 4: parse a user ping to get a snowflake
        const match = (user.match(/^<@(\d+)>$/) ?? [])[1];
        return await client.users.fetch(match as string);
    } catch {}

    return undefined;
}

async function stopAdd(message: Message) {
    const key: string = message.channel.id;

    // Get the list of running abort signals
    let aborts = stop_queues.get(key);
    if (aborts === undefined) {
        aborts = [];
        stop_queues.set(key, aborts);
    }

    // Create and add a new abort controller
    const controller = new AbortController();
    aborts.push(controller);

    // Provide a function to remove this controller
    const cleanup = () => {
        const aborts = stop_queues.get(key);
        if (aborts === undefined) return;
        const idx = aborts.indexOf(controller);
        if (idx !== -1) aborts.splice(idx, 1);
        if (aborts.length === 0) stop_queues.delete(key);
    };

    // Return the abort signal and the cleanup function
    return { signal: controller.signal, cleanup };
}

async function safeSend(channel: Channel, content: string) {
    const sendable = channel as SendableChannels;
    const allowedMentions = { parse: [], repliedUser: true };
    return await sendable.send({ content, allowedMentions });
}

async function safeEdit(message: Message, content: string) {
    const allowedMentions = { parse: [], repliedUser: true };
    if (message.content !== content)
        // no unnecessary edit
        await message.edit({ content, allowedMentions });
}

async function safeReply(message: Message, content: string) {
    const allowedMentions = { parse: [], repliedUser: true };
    return await message.reply({ content, allowedMentions });
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
