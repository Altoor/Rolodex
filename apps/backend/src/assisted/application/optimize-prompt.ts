/** Strips a Markdown code fence around a model's JSON answer. */
export function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]! : trimmed;
}

export interface OptimizationPromptInput {
  expectedOption: string;
  decisionPremise: string;
  instruction: string;
  options: unknown;
  optionDescriptions: unknown;
  feedback?: string;
}

/** Builds the decision-optimizer prompt. Keeping it here keeps the optimizer
 * focused on reading the model output and persisting the result. */
export function buildOptimizationPrompt(input: OptimizationPromptInput): string {
  return [
    "Rewrite a decision prompt so a System One model chooses the expected option.",
    "Return ONLY JSON: { decisionPremise, instruction, options, optionDescriptions }.",
    "Rules:",
    "- decisionPremise must be ONE word, or at most TWO words. It is a short key, not a question or sentence. Examples: approve, vendor, invoice_status.",
    "- Never return a premise with punctuation or more than two words.",
    "- Return the SAME options array, in the same order, with the exact same strings.",
    "- Do not rename, remove, or add options; only improve their descriptions.",
    "- options and optionDescriptions must have the same length.",
    "- Do not weaken safety or invent facts.",
    `Expected option: ${input.expectedOption}`,
    `Current premise: ${input.decisionPremise}`,
    `Current instruction: ${input.instruction}`,
    `Current options: ${JSON.stringify(input.options ?? [])}`,
    `Current descriptions: ${JSON.stringify(input.optionDescriptions ?? [])}`,
    input.feedback ? `User note: ${input.feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
