/** 1–64 chars, starts alphanumeric, then lowercase letters/numbers/`-`/`_`. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** The supplied URL segment cannot be used as an endpoint slug. */
export class InvalidEndpointSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEndpointSlugError";
  }
}

/** Another endpoint already owns the requested slug. */
export class EndpointSlugConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EndpointSlugConflictError";
  }
}

/**
 * Normalises a user-supplied URL segment. Input is lowercased so shared links
 * stay predictable; anything outside the allowed character set is rejected.
 */
export function normalizeCustomEndpointSlug(value: string): string {
  const slug = value.trim().toLowerCase();

  if (!SLUG_PATTERN.test(slug)) {
    throw new InvalidEndpointSlugError(
      "Slug must be 1-64 characters using lowercase letters, numbers, dashes, or underscores, and must start with a letter or number.",
    );
  }

  return slug;
}

/** True for a PostgreSQL unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "23505"
  );
}
