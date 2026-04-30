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
- .acr [WORD]        -> generate an acronym
- .calc [EXPR]       -> evaluate some math
- .dice [SIDES]      -> roll a die
- .flip              -> flip a coin
- .help              -> display this message
- .look [IMAGE]      -> describe an image
- .love [USER]       -> love a user
- .msg [USER] [TEXT] -> message a user
- .note [TEXT]       -> message yourself
- .say [TEXT]        -> say something
- .smite [USER]      -> mute someone for 30 seconds
- .xkcd              -> get the latest xkcd
\`\`\``;

client.on("messageCreate", async (message) => {
    // React to general things
    switch (message.content.toLowerCase()) {
        case "f":
            return await message.reply("-# RIP!");
        case "echo":
            return await message.reply("-# echo");
        case "no u":
        case "sigh":
        case "my eyes":
            return await message.reply("-# no u");
        case "ping":
            return await message.reply("-# pong");
        case "pong":
            return await message.reply("-# ping");
        case "nice":
            return await message.reply(":ok_hand:");
        case "rip":
            return await message.reply("-# Rest in pieces.");
        case "brownie clicker":
            const link_0 = "-# <https://alloc.dev/brownie/>";
            return await message.reply(link_0);
        case "fortuna tools":
            const link_1 = "-# <https://alloc.dev/fortuna/>";
            return await message.reply(link_1);
        case "binary counter":
            const link_2 = "-# https://alloc.dev/2026/01/09/counter.mp4";
            return await message.reply(link_2);
    }

    if (/[\bghast\b]/g.test(message.content))
        return await message.reply("Excuse you! I think you meant ***GHAT***");

    try {
        // React to purposeful commands
        await commandAcr(message);
        await commandCalc(message);
        await commandDice(message);
        await commandFlip(message);
        await commandHelp(message);
        await commandLook(message);
        await commandLove(message);
        await commandMsg(message);
        await commandNote(message);
        await commandSay(message);
        await commandSmite(message);
        await commandXkcd(message);
    } catch (err) {
        // Report any unhandled errors
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

async function commandLove(message: Message) {
    if (!message.content.startsWith(".love ")) return;
    const user = await selectUser(message.content.slice(6), message.guild);
    if (user === undefined) return await message.reply("-# unknown user");

    // Load the json file mapping user to "cooldown time"
    const db_file = Bun.file("love_db.json");
    let cooldown_map: { [key: string]: number } = {};
    if (await db_file.exists()) cooldown_map = await db_file.json();

    // Ratelimit the user if they attempt to use .love too often
    const last_time = cooldown_map[message.author.id];
    if (last_time !== undefined) {
        const rem = Math.ceil((last_time - Date.now()) / 1000 + 300);
        const rate_msg = `-# slow down! ${rem} seconds remaining...`;
        if (rem > 0) return await message.reply(rate_msg);
    }

    const unsendable = !message.channel.isSendable();
    if (unsendable) return await message.reply("-# channel unsendable");
    const content = `❤️😊❤️ <@${message.author.id}> loves <@${user.id}> ❤️😚❤️`;
    await (message.channel as SendableChannels).send(content);

    // Update their time for cooldown and save the file
    cooldown_map[message.author.id] = Date.now();
    await Bun.write(db_file, JSON.stringify(cooldown_map));
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

    // Let the user know their request has been completed
    await message.react("👍");
}

async function commandNote(message: Message) {
    if (!message.content.startsWith(".note ")) return;
    const content = message.content.slice(6);

    if (/[\t\n]/g.test(content)) {
        // Send in a codeblock if they had a tab or newline
        await message.author.send("`.note` -\n```" + content + "```");
    } else {
        // Send on the same line if they had no tab or newline
        await message.author.send("`.note` - " + content);
    }

    // Let the user know their request has been completed
    await message.react("👍");
}

async function commandSay(message: Message) {
    if (!message.content.startsWith(".say ")) return;
    const unsendable = !message.channel.isSendable();
    if (unsendable) return await message.reply("-# channel unsendable");
    await safeSend(message.channel, message.content.slice(5));
}

async function commandSmite(message: Message) {
    if (!message.content.startsWith(".smite ")) return;
    const user = await selectUser(message.content.slice(7), message.guild);
    if (user === undefined) return await message.reply("-# unknown user");

    // Load the json file mapping user to "cooldown time"
    const db_file = Bun.file("smite_db.json");
    let cooldown_map: { [key: string]: number } = {};
    if (await db_file.exists()) cooldown_map = await db_file.json();

    // Ratelimit the user if they attempt to use .smite too often
    const last_time = cooldown_map[message.author.id];
    if (last_time !== undefined) {
        const rem = Math.ceil((last_time - Date.now()) / 1000 + 300);
        const rate_msg = `-# slow down! ${rem} seconds remaining...`;
        if (rem > 0) return await message.reply(rate_msg);
    }

    // Select the user to smite - must be within the same server
    if (message.guild === null) return await message.reply("-# not in server");
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (member === null) return await message.reply("-# not in server");

    // Mute the user for 30 seconds
    await member.timeout(30_000, "you have been smitten");
    await message.reply("-# user successfully smitten");

    // Update their time for cooldown and save the file
    cooldown_map[message.author.id] = Date.now();
    await Bun.write(db_file, JSON.stringify(cooldown_map));
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
