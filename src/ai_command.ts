import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ollama from "ollama";

const model_option = "gemini-2.5-flash";
const generative_ai = new GoogleGenerativeAI(process.env["GEMINI_API_KEY"]!);
const gemini_model = generative_ai.getGenerativeModel({ model: model_option });

const ai_command_builder = new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Prompt Gemini 2.5-flash, or fallback to llama3.2:3b.")
    .addStringOption((option) =>
        option
            .setName("prompt")
            .setRequired(true)
            .setDescription("A question or prompt for the LLM")
    );

// Handle generating, adapting, and sending async LLM text streams
async function execute(interaction: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const prompt = interaction.options.getString("prompt", true);

    try {
        const result = await gemini_model.generateContentStream(prompt);
        const stream = adaptGeminiStream(result.stream);
        await aiStreamResponse(interaction, stream);
    } catch (gemini_error) {
        const response = await ollama.chat({
            options: { temperature: 0.7, num_ctx: 32768 },
            messages: [{ role: "user", content: prompt }],
            model: "llama3.2:3b",
            stream: true,
        });
        const stream = adaptOllamaStream(response);
        await aiStreamResponse(interaction, stream);
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

// This generator yields message-sized chunks
async function* streamToChunks(stream: any) {
    let buffer: string = "";

    for await (const segment of stream) {
        buffer = buffer + segment;
        while (buffer.length >= 2000) {
            yield buffer.slice(0, 2000);
            buffer = buffer.slice(2000);
        }
    }

    if (buffer.length > 0) {
        yield buffer;
    }
}

// Reply to the interaction with ephemeral response messages
async function aiStreamResponse(interaction: any, stream: any) {
    const chunk_generator = streamToChunks(stream);

    const first_chunk = await chunk_generator.next();
    await interaction.editReply({ content: first_chunk.value });

    for await (const chunk of chunk_generator) {
        await interaction.followUp({
            content: chunk,
            flags: MessageFlags.Ephemeral,
        });
    }
}

export default {
    data: ai_command_builder,
    execute: execute,
};
