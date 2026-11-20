export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

/**
 * A lookup completed successfully but found nothing. Tools can opt in to
 * returning an empty result instead of failing the run.
 */
export class ToolNoMatchError extends ToolInputError {
  constructor(message: string) {
    super(message);
    this.name = "ToolNoMatchError";
  }
}
