import { ToolInputError } from "../../../model";

/** Preserves ToolInputError and wraps unexpected filesystem/DB failures. */
export function asToolInputError(err: unknown): ToolInputError {
  if (err instanceof ToolInputError) return err;

  return new ToolInputError(err instanceof Error ? err.message : String(err));
}
