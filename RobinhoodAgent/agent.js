import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MCP_URL = process.env.ROBINHOOD_MCP_URL || "https://agent.robinhood.com/mcp/trading";

const conversationHistory = [];

async function chat(userMessage) {
  conversationHistory.push({ role: "user", content: userMessage });

  const response = await client.beta.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    betas: ["mcp-client-2025-11-20"],
    mcp_servers: [
      {
        type: "url",
        url: MCP_URL,
        name: "robinhood",
      },
    ],
    tools: [{ type: "mcp_toolset", mcp_server_name: "robinhood" }],
    system:
      "You are a helpful trading assistant with access to Robinhood trading tools. " +
      "Help users check portfolio data, stock prices, market info, and execute trades when requested. " +
      "Always confirm before executing any trades and provide clear summaries of actions taken.",
    messages: conversationHistory,
  });

  const assistantText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  conversationHistory.push({ role: "assistant", content: response.content });

  return { text: assistantText, stopReason: response.stop_reason };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
    process.exit(1);
  }

  console.log("Robinhood Trading Agent (powered by Claude)");
  console.log(`Connected to MCP server: ${MCP_URL}`);
  console.log('Type "exit" to quit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question("You: ", async (input) => {
      const userInput = input.trim();
      if (!userInput) return ask();
      if (userInput.toLowerCase() === "exit") {
        console.log("Goodbye!");
        rl.close();
        return;
      }

      try {
        const { text } = await chat(userInput);
        console.log(`\nAssistant: ${text}\n`);
      } catch (err) {
        console.error(`Error: ${err.message}\n`);
      }

      ask();
    });
  };

  ask();
}

main();
