import { Ollama } from "ollama";

export const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

/**
const response = await ollama.generate({
  model: "gemma4:e2b",
  prompt:
    "from the following user prompt, extract a title and description for a todo item: 'i need to pick up johhny from daycare later today, maybe this afternoon'",
  format: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
    },
  },
});

console.log(response.response);
console.log(response.thinking);

 */
