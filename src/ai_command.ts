import { type CacheType, SlashCommandBuilder, ChatInputCommandInteraction, Message, MessageFlags } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ollama from "ollama";

const generative_ai = new GoogleGenerativeAI(process.env["GEMINI_API_KEY"]!);
const gemini_model = generative_ai.getGenerativeModel({
    model: "gemini-2.5-flash",
});

const aiCommandBuilder = new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Prompt Gemini 2.5-flash, or fallback to llama3.2:3b.")
    .addStringOption((option) =>
        option.setName("prompt").setDescription("A question or prompt for the LLM").setRequired(true)
    );

async function execute(interaction: ChatInputCommandInteraction<CacheType>) {
    // Send "Bot is thinking..." and the edited reply only visible to the user.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Get the prompt from the user's command input
    const prompt = interaction.options.getString("prompt", true);

    try {
        // First, try to get a response from Gemini
        const result = await gemini_model.generateContentStream(prompt);
        const stream = adaptGeminiStream(result.stream);
        await aiStreamResponse(interaction, stream);
    } catch (err) {
        console.error("Gemini API failed, falling back to Ollama.", err);

        try {
            // If Gemini fails, fall back to the local Ollama model
            const response = await ollama.chat({
                options: { temperature: 0.7, num_ctx: 32_768 },
                messages: [{ role: "user", content: prompt }],
                model: "llama3.2:3b",
                stream: true,
            });

            const stream = adaptOllamaStream(response);
            await aiStreamResponse(interaction, stream);
        } catch (ollamaError) {
            console.error("Ollama fallback also failed.", ollamaError);
            await interaction.editReply("AI services are currently unavailable.");
        }
    }
}

// Adapt response from streaming gemini chat for aiStreamResponse
async function* adaptGeminiStream(stream: any) {
    for await (const segment of stream) {
        yield segment.text();
    }
}

// Adapt response from streaming ollama.chat for aiStreamResponse
async function* adaptOllamaStream(stream: any) {
    for await (const segment of stream) {
        yield segment.message.content;
    }
}

// Updated interface for the state object to work with Interactions
interface StreamState {
    interaction: ChatInputCommandInteraction<CacheType>;
    latest_follow_up: Message | null;
    not_sent: string[];
    buffer: string;
    is_first_message: boolean;
}

async function aiStreamQueue(state: StreamState): Promise<boolean> {
    const first = state.not_sent.shift();
    if (first === undefined) return false;

    if (state.buffer.length + first.length >= 2000) {
        state.latest_follow_up = await state.interaction.followUp({
            content: first,
            flags: MessageFlags.Ephemeral,
        });
        state.buffer = first;
        state.is_first_message = false;
        return true;
    }

    state.buffer = state.buffer + "\n" + first;
    while (state.not_sent.length > 0) {
        if (state.buffer.length + state.not_sent[0]!.length >= 2000) break;
        state.buffer = state.buffer + "\n" + state.not_sent.shift()!;
    }

    if (state.is_first_message) {
        await state.interaction.editReply({ content: state.buffer });
    } else if (state.latest_follow_up) {
        await state.latest_follow_up.edit({ content: state.buffer });
    }
    return true;
}

async function aiStreamResponse(interaction: ChatInputCommandInteraction<CacheType>, stream: any) {
    await interaction.editReply("Loading...");

    const state: StreamState = {
        interaction: interaction,
        latest_follow_up: null,
        not_sent: [] as string[],
        buffer: "" as string,
        is_first_message: true,
    };

    let not_parsed: string = "";
    let timer = Date.now();

    for await (const segment of stream) {
        not_parsed += segment;

        const line_split: string[] = not_parsed.split("\n");
        not_parsed = line_split[line_split.length - 1]!;
        for (let i = 0; i < line_split.length - 1; i += 1) {
            while (line_split[i]!.trimStart().length > 0) {
                state.not_sent.push(line_split[i]!.slice(0, 2000));
                line_split[i]! = line_split[i]!.slice(2000);
            }
        }

        while (Date.now() - timer > 1000) {
            if (await aiStreamQueue(state)) {
                timer = timer + 1000;
            } else break;
        }
    }

    if (not_parsed.trim().length !== 0) {
        state.not_sent.push(not_parsed);
    }

    while (await aiStreamQueue(state)) {}
}

export default {
    data: aiCommandBuilder,
    execute: execute,
};
