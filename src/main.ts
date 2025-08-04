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
    console.log(`Logged in as ${client.user?.tag}`);
});

client.on("messageCreate", async (message) => {
    // Ignore messages from other bots
    if (message.author.bot) return;

    switch (message.content) {
        case "ping":
            await message.reply("pong");
            break;
        case "no u":
            await message.reply("no u");
            break;
    }
});

client.login(process.env.DISCORD_TOKEN);
