/** Turns an empty numeric input into null and any other text into a number. */
export const parseNullableNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
};
