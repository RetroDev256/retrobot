import {
    REST,
    Routes,
    Client,
    Message,
    Partials,
    Collection,
    type Channel,
    GatewayIntentBits,
    type SendableChannels,
} from "discord.js";
import * as fs from "fs";
import ai_command from "./ai_command";

const client = new Client({
    intents: Object.values(GatewayIntentBits) as GatewayIntentBits[],
    partials: Object.values(Partials) as Partials[],
});

const commands = new Collection<string, any>();
commands.set(ai_command.data.name, ai_command);

const memory = new WebAssembly.Memory({ initial: 64 });

function readString(ptr: number, len: number): string {
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
}

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
    // Register slash commands on startup
    const token: string = process.env["DISCORD_TOKEN"]!;
    const client_id: string = process.env["CLIENT_ID"]!;
    const rest = new REST().setToken(token);
    await rest.put(Routes.applicationCommands(client_id), {
        body: [ai_command.data.toJSON()],
    });

    let info_message = `Logged in as ${client.user.tag}`;
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
            await debug("WASM messageCreate failed");
        }
    } catch (err) {
        await debug(String(err));
    }
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    await command.execute(interaction);
});

async function safeSend(channel: Channel, content: string) {
    const embeds = [{ description: content }];
    const allowedMentions = { parse: [], repliedUser: true };
    return (channel as SendableChannels).send({ embeds, allowedMentions });
}

async function safeReply(message: Message, content: string) {
    const embeds = [{ description: content }];
    const allowedMentions = { parse: [], repliedUser: true };
    return message.reply({ embeds, allowedMentions });
}

async function debug(content: string) {
    console.log("DEBUG: " + content);
    const debug_channel = process.env["DEBUG_CHANNEL_ID"]!;
    const dbg_content = "```\nDEBUG: " + content + "\n```";
    const channel = await client.channels.fetch(debug_channel);
    if (channel !== null) await safeSend(channel, dbg_content);
}

if (!init()) throw new Error("Failed to initialize WASM");
client.login(process.env["DISCORD_TOKEN"]);
