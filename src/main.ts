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
    await debug(`Logged in as ${client.user.displayName}`);
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
-# \`.bf [CODE]\` evaluate brainf***
-# \`.calc [EXPR]\` evaluate some math
-# \`.clear\` clear .slop session
-# \`.dice [SIDES]\` roll a die
-# \`.flip\` flip a coin
-# \`.gen [TEXT]\` one-shot raw LLM
-# \`.hate [USER]\` hate a user
-# \`.help\` display this message
-# \`.look [IMAGE]\` describe an image
-# \`.love [USER]\` love a user
-# \`.msg [USER] [TEXT]\` message a user
-# \`.note [TEXT]\` message yourself
-# \`.say [TEXT]\` say something
-# \`.slop [TEXT]\` sessioned LLM
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
    const react_map: Record<string, string> = { nice: "👌" };
    const react = react_map[message.content.toLowerCase()];
    if (react !== undefined) return await message.react(react);
}

async function replyMaps(message: Message) {
    const reply_map: Record<string, string> = {
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
    switch (message.content.split(/\s/g)[0]) {
        case ".acr":
            return await commandAcr(message);
        case ".bf":
            return await commandBf(message);
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
    const word_lower = message.content.slice(5).toLowerCase();
    const word = word_lower.replace(/[^a-z]/g, "");
    if (!word) return await message.reply("-# missing letters");

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

async function commandBf(message: Message) {
    // The unfiltered BF is both text & files
    let unfiltered = message.content.slice(4);
    for (const key of message.attachments.values()) {
        unfiltered += await (await fetch(key.url)).text();
    }

    const bf_code = unfiltered.replace(/[^<>+\-.,[\]]/g, "");
    if (!bf_code) return await message.reply("-# missing code");
    const loading_msg = await message.reply("-# transpiling code...");
    const js_code = transpileJsFromBf(bf_code);

    await loading_msg.edit("-# creating blob...");
    const blob = new Blob([js_code], { type: "text/javascript" });
    await loading_msg.edit("-# running...");
    const worker = new Worker(URL.createObjectURL(blob), { type: "module" });
    const chunked_writer = new ChunkedReplyWriter(loading_msg, 16);

    const timer = setTimeout(async () => {
        worker.terminate(); // first for safety
        await message.reply("-# timed out");
    }, 30_000);

    worker.onmessage = async (event) => {
        const data = event.data;
        switch (data.type) {
            case "post":
                if (!(await chunked_writer.push(data.content))) {
                    await message.reply("-# message limit reached");
                    clearTimeout(timer);
                    worker.terminate();
                } else {
                    // Acknowledge to resume execution
                    worker.postMessage({ type: "ack" });
                }
                break;
            case "done":
                await message.reply("-# completed");
                clearTimeout(timer);
                worker.terminate();
                break;
        }
    };

    worker.onerror = async (event) => {
        const location: string = `${event.lineno}:${event.colno}`;
        const error_msg: string = `${event.message} at ${location}`;
        await message.reply(`-# ${error_msg}`.replace(/\s+/g, " "));
        clearTimeout(timer);
        worker.terminate();
    };
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
    const loading_msg = await message.reply("-# starting .gen...");
    const chunked_writer = new ChunkedReplyWriter(loading_msg, 16);

    // Create an abort controller for the .stop command
    await loading_msg.edit("-# registering for .stop...");
    const { controller, cleanup } = await stopAdd(message);

    try {
        const body = {
            model: process.env["OLLAMA_MODEL"] as string,
            options: { num_ctx: 16384 },
            prompt: prompt,
            stream: true,
            raw: true,
        };

        // Fetch from the ollama API on the server with the body & signal
        await loading_msg.edit("-# waiting on ollama...");
        const response = await fetch("http://localhost:11434/api/generate", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
            method: "POST",
        });

        if (response.body === null)
            // This error should be rare, I hope - not sure about it.
            return await message.reply("-# no ollama response body");

        await loading_msg.edit("-# constructing stream...");
        const reader = response.body.getReader();
        await loading_msg.edit("-# thinking...");
        const decoder = new TextDecoder();
        let buffer: string = "";

        outer: while (true) {
            // Read the next token from the response stream
            const { value, done } = await reader.read();
            if (done || controller.signal.aborted) break;

            // Add the decoded value to the buffer
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); // NDJSON format
            buffer = lines.pop() || ""; // retain partial JSON

            // Process the completed lines from ollama
            for (const line of lines) {
                const json = JSON.parse(line);

                if (json.response) {
                    if (!(await chunked_writer.push(json.response))) {
                        message.reply("-# message limit reached");
                        break outer;
                    }
                }
            }
        }
    } finally {
        // Ensure that the connection is closed
        controller.abort();
        cleanup();
    }
}

const hate_cooldowns: Record<string, number> = {};
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
    const loading_msg = await message.reply("-# starting .look...");
    const chunked_writer = new ChunkedReplyWriter(loading_msg, 16);
    const thought_writer = new ThoughtWindowWriter(loading_msg);

    // Create an abort controller for the .stop command
    await loading_msg.edit("-# registering for .stop...");
    const { controller, cleanup } = await stopAdd(message);

    try {
        // Run the model and ask it to describe the image
        await loading_msg.edit("-# downloading image bytes...");
        const prompt: string = "Describe this image.";
        const img = await (await fetch(file_0.url)).bytes();
        const msg = { role: "user", content: prompt, images: [img.toBase64()] };
        const model = process.env["OLLAMA_MODEL"] as string;
        const body = { model: model, messages: [msg], stream: true };

        // Fetch from the ollama API on the server with the body & signal
        await loading_msg.edit("-# waiting on ollama...");
        const response = await fetch("http://localhost:11434/api/chat", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
            method: "POST",
        });

        if (response.body === null)
            // This error should be rare, I hope - not sure about it.
            return await message.reply("-# no ollama response body");

        await loading_msg.edit("-# constructing stream...");
        const reader = response.body.getReader();
        await loading_msg.edit("-# thinking...");
        const decoder = new TextDecoder();
        let buffer: string = "";

        outer: while (true) {
            // Read the next token from the response stream
            const { value, done } = await reader.read();
            if (done || controller.signal.aborted) break;

            // Add the decoded value to the buffer
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); // NDJSON format
            buffer = lines.pop() || ""; // retain partial JSON

            // Process the completed lines from ollama
            for (const line of lines) {
                const json = JSON.parse(line);
                if (json.message.content) {
                    if (!(await chunked_writer.push(json.message.content))) {
                        await message.reply("-# message limit reached");
                        break outer;
                    }
                } else if (json.message.thinking) {
                    await thought_writer.push(json.message.thinking);
                }
            }
        }
    } finally {
        // Ensure that the connection is closed
        controller.abort();
        cleanup();
    }
}

const love_cooldowns: Record<string, number> = {};
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
    const content = `❤️😊❤️ ${message.author} loves ${user} ❤️😚❤️`;
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

const slop_message_hist: Record<string, any> = {};
async function commandSlop(message: Message) {
    const prompt = message.content.slice(6);
    if (prompt.length === 0)
        return await message.reply("-# missing slop prompt");

    // Create the original response message to pump tokens
    const loading_msg = await message.reply("-# starting .slop...");
    const chunked_writer = new ChunkedReplyWriter(loading_msg, 16);
    const thought_writer = new ThoughtWindowWriter(loading_msg);

    // Create a channel message history if it does not exist
    if (slop_message_hist[message.channel.id] === undefined)
        slop_message_hist[message.channel.id] = [];

    // Append the target message to the history
    const hist_a = { role: "user", content: prompt };
    slop_message_hist[message.channel.id].push(hist_a);

    // Record the LLM response
    let response_text = "";

    // Create an abort controller for the .stop command
    await loading_msg.edit("-# registering for .stop...");
    const { controller, cleanup } = await stopAdd(message);

    try {
        const body = {
            model: process.env["OLLAMA_MODEL"] as string,
            messages: slop_message_hist[message.channel.id],
            options: { num_ctx: 16384 },
            stream: true,
        };

        // Fetch from the ollama API on the server with the body & signal
        await loading_msg.edit("-# waiting on ollama...");
        const response = await fetch("http://localhost:11434/api/chat", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
            method: "POST",
        });

        if (response.body === null)
            // This error should be rare, I hope - not sure about it.
            return await message.reply("-# no ollama response body");

        await loading_msg.edit("-# constructing stream...");
        const reader = response.body.getReader();
        await loading_msg.edit("-# thinking...");
        const decoder = new TextDecoder();
        let buffer: string = "";

        while (true) {
            // Read the next token from the response stream
            const { value, done } = await reader.read();
            if (done || controller.signal.aborted) break;

            // Add the decoded value to the buffer
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); // NDJSON format
            buffer = lines.pop() || ""; // retain partial JSON

            // Process the completed lines from ollama
            for (const line of lines) {
                const json = JSON.parse(line);

                if (json.message.content) {
                    response_text += json.message.content;
                    if (!(await chunked_writer.push(json.message.content))) {
                        await message.reply("-# message limit reached");
                        break;
                    }
                } else if (json.message.thinking) {
                    await thought_writer.push(json.message.thinking);
                }
            }
        }
    } finally {
        // Ensure that the connection is closed
        controller.abort();
        cleanup();

        // Store the llm response in the slop history
        const hist_b = { role: "assistant", content: response_text };
        slop_message_hist[message.channel.id].push(hist_b);
    }
}

const stop_queues = new Map<string, AbortController[]>();
async function commandStop(message: Message) {
    const controller = stop_queues.get(message.channel.id)?.shift();
    if (controller === undefined) return message.reply("-# nothing running");
    controller.abort(`aborted by ${message.author}`);
    await message.react("🛑");
}

const smite_cooldowns: Record<string, number> = {};
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

class ThoughtWindowWriter {
    private text_queue: string[] = [];
    private flushing: boolean = false;
    private buffer: string = "";
    private reply: Message;

    constructor(reply: Message) {
        this.reply = reply;
    }

    async push(chunk: string) {
        this.text_queue.push(chunk);
        this.update().catch((err: any) => {
            // Report unhandled errors in small lettering
            const safe = `-# ${err}`.replace(/\s+/g, " ");
            this.reply.reply(safe).catch(() => {}); // ignore
        });
    }

    private async update() {
        // RACE CONDITION CAN OCCUR IF TWO OR MORE CONTEXT SWITCHES
        // FROM ASYNC FUNCTIONS HAPPEN BETWEEN THESE LINES OF CODE
        if (this.flushing) return;
        this.flushing = true;

        try {
            while (this.text_queue.length > 0) {
                // RACE CONDITION CAN OCCUR IF CONTEXT SWITCH
                // HAPPENS BETWEEN THESE TWO LINES OF CODE
                const old_queue = this.text_queue;
                this.text_queue = [];

                // Add new changes to the text buffer
                this.buffer += old_queue.join("");
                old_queue.length = 0;

                // Sanitize buffer input - triple quotes and whitespace
                const safe_ticks: string = "\u200B`\u200B`\u200B`\u200B";
                this.buffer = this.buffer.replace(/```/g, safe_ticks);
                this.buffer = this.buffer.replace(/\s+/g, " ");

                // Sliding window for the message
                this.buffer = this.buffer.slice(-1980);
                const fmt = "-# thinking...```" + this.buffer + "```";
                await safeEdit(this.reply, fmt);
            }
        } finally {
            this.flushing = false;
        }
    }
}

class ChunkedReplyWriter {
    private limit_exceeded: boolean = false;
    private text_queue: string[] = [];
    private flushing: boolean = false;
    private buffer: string = "";
    private count: number = 1;
    private limit: number;
    private reply: Message;

    constructor(reply: Message, msg_limit: number) {
        this.limit = msg_limit;
        this.reply = reply;
    }

    // Returns false when the limit is exceeded
    async push(chunk: string): Promise<boolean> {
        if (this.limit_exceeded) return false;

        this.text_queue.push(chunk);
        this.update().catch((err: any) => {
            // Report unhandled errors in small lettering
            const safe = `-# ${err}`.replace(/\s+/g, " ");
            this.reply.reply(safe).catch(() => {}); // ignore
        });

        return true;
    }

    private async update() {
        // RACE CONDITION CAN OCCUR IF TWO OR MORE CONTEXT SWITCHES
        // FROM ASYNC FUNCTIONS HAPPEN BETWEEN THESE LINES OF CODE
        if (this.flushing) return;
        this.flushing = true;

        try {
            while (this.text_queue.length > 0) {
                // RACE CONDITION CAN OCCUR IF CONTEXT SWITCH
                // HAPPENS BETWEEN THESE TWO LINES OF CODE
                const old_queue = this.text_queue;
                this.text_queue = [];

                // Add new changes to the text buffer
                this.buffer += old_queue.join("");
                old_queue.length = 0;

                // Escape any triple quotes for code
                const safe_ticks: string = "\u200B`\u200B`\u200B`\u200B";
                this.buffer = this.buffer.replace(/```/g, safe_ticks);

                // Split the messages into small enough chunks to use
                const split = splitMessages(this.buffer);
                this.buffer = split.at(-1) as string;

                // Edit the content of the latest message
                const fmt = "```" + split[0] + "```";
                await safeEdit(this.reply, fmt);

                // Create new messages for the chunks that can't fit
                for (let index = 1; index < split.length; index++) {
                    // The limit is exceeded without pushing past our limit
                    if (this.limit !== 0 && this.count >= this.limit) {
                        this.limit_exceeded = true;
                        return;
                    }

                    const fmt = "```" + split[index] + "```";
                    this.reply = await safeReply(this.reply, fmt);
                    this.count += 1;
                }
            }
        } finally {
            this.flushing = false;
        }
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

type BfAstNode =
    | { kind: "out" }
    | { kind: "inp" }
    | { kind: "dec" }
    | { kind: "inc" }
    | { kind: "shl" }
    | { kind: "shr" }
    | { kind: "rep"; loop: BfAstNode[] };

function findBfLoopClose(bf_code: string): number {
    let depth = 0;

    for (let i = 0; i < bf_code.length; i++) {
        if (bf_code[i] === "[") depth++;
        else if (bf_code[i] === "]") depth--;
        if (depth === 0) return i;
    }

    throw "unmatched loop open";
}

function bfAstFromCode(bf_code: string): BfAstNode[] {
    const root: BfAstNode[] = [];

    let index: number = 0;
    while (index < bf_code.length) {
        switch (bf_code[index]) {
            case ".": // OUTPUT
                root.push({ kind: "out" });
                break;
            case ",": // INPUT
                root.push({ kind: "inp" });
                break;
            case "-": // DECREMENT
                root.push({ kind: "dec" });
                break;
            case "+": // INCREMENT
                root.push({ kind: "inc" });
                break;
            case "<": // SHIFT LEFT
                root.push({ kind: "shl" });
                break;
            case ">": // SHIFT RIGHT
                root.push({ kind: "shr" });
                break;
            case "[": // LOOP OPEN
                const end = findBfLoopClose(bf_code.slice(index));
                const loop_bf = bf_code.slice(index + 1, index + end);
                root.push({ kind: "rep", loop: bfAstFromCode(loop_bf) });
                index += end;
                break;
            case "]": // LOOP CLOSE
                throw "unexpected loop close";
            default: // OTHER
                throw "unexpected character";
        }

        index += 1;
    }

    return root;
}

type IrNode =
    | { kind: "clr" }
    | { kind: "rep"; idx: number }
    | { kind: "out"; off: number }
    | { kind: "inp"; off: number }
    | { kind: "shr"; amt: number }
    | { kind: "inc"; off: number; amt: number };

function bfEqualIr(a: IrNode[], b: IrNode[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function bfIrFromAst(full_ast: BfAstNode[]): IrNode[][] {
    const loops: IrNode[][] = [];

    function compileBf(ast: BfAstNode[]): number {
        const ir: IrNode[] = [];

        for (const node of ast) {
            switch (node.kind) {
                case "out":
                    ir.push({ kind: "out", off: 0 });
                    break;
                case "inp":
                    ir.push({ kind: "inp", off: 0 });
                    break;
                case "dec":
                    ir.push({ kind: "inc", off: 0, amt: 255 });
                    break;
                case "inc":
                    ir.push({ kind: "inc", off: 0, amt: 1 });
                    break;
                case "shl":
                    ir.push({ kind: "shr", amt: 29_999 });
                    break;
                case "shr":
                    ir.push({ kind: "shr", amt: 1 });
                    break;
                case "rep":
                    const child_idx = compileBf(node.loop);
                    ir.push({ kind: "rep", idx: child_idx });
                    break;
            }
        }

        for (let idx = 0; idx < loops.length; idx++) {
            const loop = loops[idx] as IrNode[];
            if (bfEqualIr(loop, ir)) return idx;
        }

        const idx = loops.length;
        loops.push(ir);
        return idx;
    }

    compileBf(full_ast);
    return loops;
}

function transpileJsFromBf(bf_code: string): string {
    const ast: BfAstNode[] = bfAstFromCode(bf_code);
    const ir: IrNode[][] = bfIrFromAst(ast);
    let loop_bodies: string = "";

    for (let i = 0; i < ir.length; i++) {
        let body = `async function loop_${i}(cell) {`;
        body += "if (cell === 0) return;";
        body += "branchLimitCheck();";

        for (const node of ir[i] as IrNode[]) {
            switch (node.kind) {
                case "clr":
                    body += "mem[ptr] = 0;";
                    break;
                case "rep":
                    body += `await loop_${node.idx}(mem[ptr]);`;
                    break;
                case "out":
                    body += `await print(mem[(ptr + ${node.off}) % 30_000]);`;
                    break;
                case "inp":
                    body += `throw "input unimplemented";`;
                    break;
                case "shr":
                    body += `ptr = (ptr + ${node.amt}) % 30_000;`;
                    break;
                case "inc":
                    body += `mem[(ptr + ${node.off}) % 30_000] += ${node.amt};`;
                    break;
            }
        }

        if (i !== ir.length - 1) {
            body += `await loop_${i}(mem[ptr]);`;
        }

        loop_bodies += body + "}";
    }

    const header: string = `
        let branch_count = 0;
        function branchLimitCheck() {
            branch_count++;
            if (branch_count >= 1 << 24) {
                throw "branch limit reached";
            }
        }

        let ptr = 0;
        let pending_ack = null;
        const mem = new Uint8Array(30_000);

        function print(char) {
            const content = String.fromCharCode(char);
            return new Promise((resolve) => {
                pending_ack = resolve;
                postMessage({ type: "post", content });
            });
        }

        onmessage = (event) => {
            if (event.data.type === "ack") {
                if (pending_ack) {
                    const resolve = pending_ack;
                    pending_ack = null;
                    resolve();
                }
            }
        };
    `;

    const footer: string = `
        (async function() {
            await loop_${ir.length - 1}(1);
            postMessage({ type: "done" });
        })();
    `;

    return header + loop_bodies + footer;
}

function splitMessages(text: string): string[] {
    const messages: string[] = [];

    while (text.length > 0) {
        // PRIORITY 0: message already small
        let split = text.length;
        if (split > 1994) {
            // PRIORITY 1: paragraph breaks
            split = text.lastIndexOf("\n\n", 1994);
            if (split < 1000) {
                // PRIORITY 2: new lines
                split = text.lastIndexOf("\n", 1994);
                if (split < 1500) {
                    // PRIORITY 3: tabs
                    split = text.lastIndexOf("\t", 1994);
                    if (split < 1750) {
                        // PRIORITY 4: spaces
                        split = text.lastIndexOf(" ", 1994);
                        if (split < 1950) {
                            // PRIORITY 5: cutting
                            split = 1994;
                        }
                    }
                }
            }
        }

        messages.push(text.substring(0, split));
        text = text.substring(split);
    }

    return messages;
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

    // Return the abort controller and the cleanup function
    return { controller: controller, cleanup };
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
