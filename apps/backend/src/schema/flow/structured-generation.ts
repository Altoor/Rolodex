import { GraphQLError } from "graphql";
import { getOllamaClient } from "@repo/ai";
import { parseJsonObject } from "@repo/tools";

interface StructuredGenerationOptions {
  model: string;
  prompt: string;
  system?: string;
  format: Record<string, unknown>;
}

/** Runs one structured generation and returns a validated JSON object. */
export async function generateJsonObject({
  model,
  prompt,
  system,
  format,
}: StructuredGenerationOptions): Promise<Record<string, unknown>> {
  let text: string;

  try {
    const response = await (
      await getOllamaClient()
    ).generate({
      model,
      prompt,
      system,
      format,
    });
    text = response.response ?? "";
  } catch (err) {
    throw new GraphQLError(
      `Model "${model}" failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { extensions: { code: "BAD_GATEWAY" } },
    );
  }

  if (!text?.trim()) {
    throw new GraphQLError(`Model "${model}" returned an empty response`, {
      extensions: { code: "BAD_GATEWAY" },
    });
  }

  const direct = parseJsonObject(text);
  if (direct) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = parseJsonObject(fenced[1]);
    if (parsed) return parsed;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const parsed = parseJsonObject(text.slice(start, end + 1));
    if (parsed) return parsed;
  }

  throw new GraphQLError(
    `Model "${model}" returned invalid JSON. Raw output:\n${text}`,
    { extensions: { code: "BAD_GATEWAY" } },
  );
}
