import { Client, GatewayIntentBits, Partials } from "discord.js";
import * as fs from "fs";

const client = new Client({
    intents: Object.values(GatewayIntentBits) as GatewayIntentBits[],
    partials: Object.values(Partials) as Partials[],
});

const memory = new WebAssembly.Memory({ initial: 64 });

// Tool to help load WASM memory as TypeScript strings
function readString(ptr: number, len: number): string {
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
}

// For setting string parameters in TypeScript
function setString(str: string): void {
    const utf_8 = new TextEncoder().encode(str);
    const ptr = allocateMem(utf_8.length);
    if (ptr === 0) throw new Error("Out of memory");
    const str_mem = new Uint8Array(memory.buffer, ptr, utf_8.length);
    str_mem.set(utf_8);
}

const wasm_env = {
    memory: memory,
    readFileApi: (path_ptr: number, path_len: number): boolean => {
        try {
            const path = readString(path_ptr, path_len);
            setString(fs.readFileSync(path, "utf8"));
            return true;
        } catch (err) {
            console.log("TypeScript Error: " + String(err));
            return false;
        }
    },
    writeStdoutApi: (out_ptr: number, out_len: number): boolean => {
        try {
            const output = readString(out_ptr, out_len);
            process.stdout.write(output);
            return true;
        } catch (err) {
            console.log("TypeScript Error: " + String(err));
            return false;
        }
    },
    fillRandomApi: (dest_ptr: number, dest_len: number): boolean => {
        try {
            const bytes = new Uint8Array(memory.buffer, dest_ptr, dest_len);
            crypto.getRandomValues(bytes);
            return true;
        } catch (err) {
            console.log("TypeScript Error: " + String(err));
            return false;
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
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const content = readString(content_ptr, content_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = channel.messages.fetch(message_id);
                await (await message).reply(content);
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
    editMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number,
        content_ptr: number,
        content_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const content = readString(content_ptr, content_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                await message.edit(content);
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
    deleteMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                await message.delete();
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
    reactMessageApi: (
        channel_id_ptr: number,
        channel_id_len: number,
        message_id_ptr: number,
        message_id_len: number,
        reaction_ptr: number,
        reaction_len: number
    ): void => {
        (async () => {
            try {
                const channel_id = readString(channel_id_ptr, channel_id_len);
                const message_id = readString(message_id_ptr, message_id_len);
                const reaction = readString(reaction_ptr, reaction_len);

                const channel = await client.channels.fetch(channel_id);
                if (!channel || !("messages" in channel)) return;
                const message = await channel.messages.fetch(message_id);
                await message.react(reaction);
            } catch (err) {
                console.log("TypeScript Error: " + String(err));
            }
        })();
    },
};

const buffer = fs.readFileSync("retrobot.wasm");
const module = new WebAssembly.Module(buffer);
const instance = new WebAssembly.Instance(module, { env: wasm_env });
const exports = instance.exports;

const allocateMem = exports["allocateMem"] as (len: number) => number;
const handleEvent = exports["handleEvent"] as () => void;

client.on("raw", (packet) => {
    setString(JSON.stringify(packet));
    handleEvent();
});

(exports["init"] as () => void)();
client.login(process.env["DISCORD_TOKEN"]);
