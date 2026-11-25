import type { ToolDefinition } from "../../../model";

export const promptDefinition: ToolDefinition = {
  key: "prompt",
  name: "Prompt",
  description:
    "Send a prompt to an installed Ollama model, wait for the answer, and return it. Optionally request structured fields.",
  category: "ai",
  usesModel: true,
  modelRoles: ["generation"],
  inputMode: "text",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "The prompt to send. Defaults to the queued task's state. Supports `{{path}}` placeholders that resolve against earlier toolState, for example `{{content}}` or `{{folder.name}}`.",
      },
      system: {
        type: "string",
        description:
          "Optional system prompt. Supports the same `{{path}}` placeholders as `prompt`.",
      },
      includeCurrentTime: {
        type: "boolean",
        description:
          'Add the current date and time to the system prompt. Enable when the model must resolve relative dates such as "tomorrow" or "before Saturday".',
        default: false,
      },
      timeZone: {
        type: "string",
        description:
          'Optional IANA time zone for the current time, for example "Europe/Copenhagen". Defaults to the server time zone.',
      },
      model: {
        type: "string",
        description:
          "Optional generation model override. Defaults to the model inherited by the run context, then the user's default generation model.",
      },
      format: {
        type: "object",
        description:
          "Optional JSON schema passed to Ollama for structured output. Cannot be combined with `fields`.",
      },
      fields: {
        type: "object",
        description:
          'Optional named output fields, for example { "name": { "type": "string" } }. Each field becomes a tool-state path.',
      },
      onInvalid: {
        type: "string",
        description:
          'What to do when the model response does not match `fields`: "fail" throws, "text" keeps the raw answer in `text`.',
        enum: ["fail", "text"],
        default: "fail",
      },
      useToolState: {
        type: "boolean",
        description:
          "Append the accumulated toolState to the prompt. Defaults to false.",
        default: false,
      },
    },
  },
  outputDescription:
    "The model answer as text, plus the model name and optional thinking text. With `fields`, each parsed field is also returned and appended to toolState.",
  exampleConfig: {
    model: "gemma4:e4b",
    prompt:
      "Return a short folder name and a one-sentence description for a folder of tax documents.",
    fields: {
      name: {
        type: "string",
        description: "Short folder name. No slashes.",
      },
      description: {
        type: "string",
        description: "One or two sentences describing the contents.",
      },
    },
  },
};
