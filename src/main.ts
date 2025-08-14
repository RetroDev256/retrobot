import { Client, GatewayIntentBits, Partials } from "discord.js";
import * as fs from "fs";

const client = new Client({
    intents: Object.values(GatewayIntentBits) as GatewayIntentBits[],
    partials: Object.values(Partials) as Partials[],
});

const wasm_memory = new WebAssembly.Memory({ initial: 64 });

// Tool to help load WASM memory as TypeScript strings
function readString(ptr: number, len: number): string {
    const bytes = new Uint8Array(wasm_memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
}

// For setting string parameters in TypeScript
function setString(str: string): void {
    const utf_8 = new TextEncoder().encode(str);
    const ptr = allocateApi(utf_8.length);
    const str_mem = new Uint8Array(wasm_memory.buffer, ptr, utf_8.length);
    str_mem.set(utf_8);
}

const wasm_env = {
    memory: wasm_memory,
    readFileApi: (path_ptr: number, path_len: number) => {
        const path = readString(path_ptr, path_len);
        setString(fs.readFileSync(path, "utf8"));
    },
    writeStdoutApi: (out_ptr: number, out_len: number) => {
        const output = readString(out_ptr, out_len);
        process.stdout.write(output);
    },
    fillRandomApi: (dest_ptr: number, dest_len: number) => {
        const bytes = new Uint8Array(wasm_memory.buffer, dest_ptr, dest_len);
        crypto.getRandomValues(bytes);
    },
    replyMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number,
        content_ptr: number,
        content_len: number
    ) => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const content = readString(content_ptr, content_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = channel.messages.fetch(message_id);
                await (await message).reply(content);
            } catch {}
        })();
    },
    sendMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        content_ptr: number,
        content_len: number
    ) => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const content = readString(content_ptr, content_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("send" in channel)) return;
                await channel.send(content);
            } catch {}
        })();
    },
    editMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number,
        content_ptr: number,
        content_len: number
    ) => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const content = readString(content_ptr, content_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                await message.edit(content);
            } catch {}
        })();
    },
    sendPrivateApi: (
        user_id_ptr: number,
        user_id_len: number,
        content_ptr: number,
        content_len: number
    ) => {
        (async () => {
            try {
                const user_id = readString(user_id_ptr, user_id_len);
                const content = readString(content_ptr, content_len);

                const user = await client.users.fetch(user_id);
                await user.send(content);
            } catch {}
        })();
    },
};

const wasm_buffer = fs.readFileSync("retrobot.wasm");
const wasm_module = new WebAssembly.Module(wasm_buffer);
const wasm_instance = new WebAssembly.Instance(wasm_module, { env: wasm_env });
const wasm_exports = wasm_instance.exports;

const allocateApi = wasm_exports["allocateApi"] as (len: number) => number;
const handleEventApi = wasm_exports["handleEventApi"] as () => void;

client.on("raw", (packet) => {
    setString(JSON.stringify(packet));
    handleEventApi();
});

(wasm_exports["initApi"] as () => void)();
client.login(process.env["DISCORD_TOKEN"]);
