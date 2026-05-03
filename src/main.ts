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
    escapeMarkdown,
} from "discord.js";
import words from "../words.json";
import { randomInt } from "crypto";
import ollama from "ollama";
import { XMLParser } from "fast-xml-parser";
import { setTimeout } from "timers/promises";

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

const help_text = `
**USAGE:**
-# \`.acr [WORD]\` generate an acronym
-# \`.calc [EXPR]\` evaluate some math
-# \`.dice [SIDES]\` roll a die
-# \`.flip\` flip a coin
-# \`.gen [TEXT]\` simple LLM prompting
-# \`.help\` display this message
-# \`.look [IMAGE]\` describe an image
-# \`.love [USER]\` love a user
-# \`.msg [USER] [TEXT]\` message a user
-# \`.note [TEXT]\` message yourself
-# \`.reset\` reset slop session
-# \`.say [TEXT]\` say something
-# \`.slop [TEXT]\` LLM with session
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
    } catch (err) {
        // Report any unhandled errors
        const safe = `${err}`.replace(/\s+/g, " ");
        await message.reply("-# " + safe);
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
        case ".dice":
            return await commandDice(message);
        case ".flip":
            return await commandFlip(message);
        case ".gen":
            return await commandGen(message);
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
        case ".reset":
            return await commandReset(message);
        case ".say":
            return await commandSay(message);
        case ".slop":
            return await commandSlop(message);
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

const gen_cooldowns: { [key: string]: number } = {};
async function commandGen(message: Message) {
    const prompt = message.content.slice(5);
    if (prompt.length === 0) return await message.reply("-# missing prompt");

    // Ratelimit the user if they attempt to use .gen too often
    const last_time = gen_cooldowns[message.author.id];
    if (last_time !== undefined) {
        const rem = Math.ceil((last_time - Date.now()) / 1000 + 60);
        const rate_msg = `-# slow down! ${rem} seconds remaining...`;
        if (rem > 0) return await message.reply(rate_msg);
    }

    // Create the original response message to pump tokens
    const loading_msg = await message.reply("-# processing...");
    const writer = new ChunkedReplyWriter(loading_msg);
    gen_cooldowns[message.author.id] = Date.now();

    // Run the model on the requested prompt
    const response = await ollama.generate({
        model: process.env["OLLAMA_TEXT_MODEL"] as string,
        options: { num_ctx: 131072 },
        keep_alive: 3600,
        prompt: prompt,
        stream: true,
        think: false,
    });

    // Update the message on each token
    for await (const chunk of response) {
        writer.push(chunk.response);
    }
}

async function commandHelp(message: Message) {
    await message.reply(help_text);
}

const look_cooldowns: { [key: string]: number } = {};
async function commandLook(message: Message) {
    if (message.attachments.size === 0)
        return await message.reply("-# missing an attachment");
    if (message.attachments.size > 1)
        return await message.reply("-# too many attachments");

    const file_0 = message.attachments.at(0);
    if (!file_0?.contentType?.startsWith("image/"))
        return await message.reply("-# not an image");

    // Ratelimit the user if they attempt to use .look too often
    const last_time = look_cooldowns[message.author.id];
    if (last_time !== undefined) {
        const rem = Math.ceil((last_time - Date.now()) / 1000 + 60);
        const rate_msg = `-# slow down! ${rem} seconds remaining...`;
        if (rem > 0) return await message.reply(rate_msg);
    }

    // Fetch and convert to base 64 for passing to ollama
    const img = await (await fetch(file_0.url)).bytes();
    const loading_msg = await message.reply("-# processing...");
    const writer = new ChunkedReplyWriter(loading_msg);
    look_cooldowns[message.author.id] = Date.now();

    // Run the model and ask it to describe the image
    const prompt = "Describe this image in one short paragraph.";
    const response = await ollama.chat({
        messages: [{ role: "user", content: prompt, images: [img] }],
        model: process.env["OLLAMA_IMAGE_MODEL"] as string,
        stream: true,
        think: false,
    });

    // Update the message on each token
    for await (const chunk of response) {
        writer.push(chunk.message.content);
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

async function commandReset(message: Message) {
    slop_in_flight.delete(message.channel.id);
    slop_message_hist[message.channel.id] = [];
    await message.react("✅");
}

async function commandSay(message: Message) {
    const unsendable = !message.channel.isSendable();
    if (unsendable) return await message.reply("-# channel unsendable");
    await safeSend(message.channel, message.content.slice(5));
}

const slop_in_flight = new Set<string>(); // channels
const slop_message_hist: { [key: string]: any } = {};
async function commandSlop(message: Message) {
    const prompt = message.content.slice(6);
    if (prompt.length === 0)
        return await message.reply("-# missing slop prompt");

    // Prevent users from using the AI while it is answering
    if (slop_in_flight.has(message.channel.id))
        return await message.reply("-# wait for the slop");

    try {
        // Mark the slop as being generated.
        slop_in_flight.add(message.channel.id);

        // Create the original response message to pump tokens
        const loading_msg = await message.reply("-# processing...");
        const writer = new ChunkedReplyWriter(loading_msg);

        // Create a channel message history if it does not exist
        if (slop_message_hist[message.channel.id] === undefined)
            slop_message_hist[message.channel.id] = [];

        // Append the target message to the history
        const hist_a = { role: "user", content: prompt };
        slop_message_hist[message.channel.id].push(hist_a);

        // Run the model on the requested prompt
        const response = await ollama.chat({
            model: process.env["OLLAMA_TEXT_MODEL"] as string,
            messages: slop_message_hist[message.channel.id],
            options: { num_ctx: 131072 },
            keep_alive: 3600,
            stream: true,
            think: false,
        });

        // Update the message on each token
        let response_text = "";
        for await (const chunk of response) {
            writer.push(chunk.message.content);
            response_text += chunk.message.content;
        }

        // Attach the llm response to the slop history
        const hist_b = { role: "assistant", content: response_text };
        slop_message_hist[message.channel.id].push(hist_b);
    } finally {
        // Mark the slop generation as finished.
        slop_in_flight.delete(message.channel.id);
    }
}

const smite_cooldowns: { [key: string]: number } = {};
async function commandSmite(message: Message) {
    const user = await selectUser(message.content.slice(7), message.guild);
    if (user === undefined) return await message.reply("-# unknown user");

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

    await message.reply("-# user successfully smitten");
    smite_cooldowns[message.author.id] = Date.now();
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
        this.buffer = this.buffer.replace(/```/g, "`\u200B``");
        // A change has been made to the buffer, we are dirty
        this.dirty = true;
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
