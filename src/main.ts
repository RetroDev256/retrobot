import { Client, GatewayIntentBits } from "discord.js";
// import { readFileSync } from "fs";

// Load WASM & exported functions
// const wasm_buffer = readFileSync("./retrobot.wasm");
// const wasm_module = await WebAssembly.instantiate(wasm_buffer);
// const wasm_exports = wasm_module.instance.exports;
// const foo: () => number = wasm_exports.foo;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.GuildMessagePolls,
        GatewayIntentBits.DirectMessagePolls,
    ],
});

client.on("ready", () => {
    const tab = " ".repeat(4);
    console.log("Logged in as", client.user?.tag);
    for (const [_, guild] of client.guilds.cache) {
        console.log(tab, guild.name);
        const member_count = guild.memberCount;
        console.log(tab + tab, member_count, "members");
        const channel_count = guild.channels.cache.size;
        console.log(tab + tab, channel_count, "channels");
    }
});

client.on("messageCreate", (message) => {
    // Ignore messages from other bots
    if (message.author.bot) return;

    switch (message.content) {
        case "ping":
            message.reply("pong");
            break;
        case "no u":
            message.reply("no u");
            break;
    }
});

client.login(process.env.DISCORD_TOKEN);
