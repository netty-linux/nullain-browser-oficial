import { Agent } from "@mastra/core/agent";

const BASE_INSTRUCTIONS = `You are Nullain Chat — a 100% open source ChatGPT-like assistant powered by Mastra and Ollama Cloud.

Principles:
- Be helpful, concise, and friendly
- Support markdown, code blocks, tables
- If user speaks Portuguese, answer in Portuguese. Otherwise match user's language.`;

export const chatAgent = new Agent({
  id: "chat-agent",
  name: "Chat Agent",
  instructions: BASE_INSTRUCTIONS,
  model: process.env.MASTRA_MODEL ?? "ollama-cloud/gpt-oss:20b",
  tools: {},
});
