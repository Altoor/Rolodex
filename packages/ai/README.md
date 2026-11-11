# @repo/ai

Owns Ollama access and model selection helpers.

## Contents

- `ollama` — configured Ollama client.
- `getModelForUser` / `getDecisionModelForUser` — resolve a user's default
  generation or decision model, with task/queued overrides applied by callers.
- `assertPulledModel` — validates that a model is available locally.
- Embedding helpers used by the todo tools.

This package may depend on `@repo/db`, but never on `@repo/tools`.
