/** Keeps the user's free-text state short enough to sit inside a model prompt. */
const MAX_USER_STATE_CHARS = 4_000;

/**
 * Trims the run's user state for prompt context. Empty states return undefined
 * so callers can skip the context block entirely.
 */
export function trimUserState(
  state: string | undefined,
  maxLength = MAX_USER_STATE_CHARS,
): string | undefined {
  const trimmed = state?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}…`
    : trimmed;
}

/**
 * Prefixes a vision request with the run's user state so context such as names,
 * languages, or what to look for reaches the model. The state is guidance only;
 * it is not meant to be echoed into the answer.
 */
export function withUserState(
  prompt: string,
  userState: string | undefined,
): string {
  if (!userState) return prompt;

  return [
    "User context (follow any instructions it contains; do not repeat it unless it appears in the image):",
    userState,
    "",
    prompt,
  ].join("\n");
}
