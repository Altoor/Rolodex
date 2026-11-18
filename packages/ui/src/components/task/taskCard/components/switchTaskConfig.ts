export const NO_TASK = "__none__";

export interface SwitchCaseDraft {
  id: string;
  label: string;
  whenText: string;
  nextTaskId: string;
}

export interface SwitchDraft {
  path: string;
  quantifier: "some" | "every";
  cases: SwitchCaseDraft[];
  defaultTaskId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the tool config without throwing on malformed JSON. */
export function parseSwitchConfigText(
  text: string | undefined,
): Record<string, unknown> {
  if (!text?.trim()) return {};

  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatWhen(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

/** Converts the raw tool config text into editable form state. */
export function readSwitchDraft(text: string | undefined): SwitchDraft {
  const config = parseSwitchConfigText(text);

  const cases = Array.isArray(config.cases)
    ? config.cases.flatMap((entry, index): SwitchCaseDraft[] => {
        if (!isRecord(entry)) return [];

        return [
          {
            id:
              typeof entry.id === "string" && entry.id
                ? entry.id
                : `case-${index + 1}`,
            label:
              typeof entry.label === "string" && entry.label
                ? entry.label
                : `Case ${index + 1}`,
            whenText: formatWhen(entry.when),
            nextTaskId:
              typeof entry.nextTaskId === "number"
                ? String(entry.nextTaskId)
                : NO_TASK,
          },
        ];
      })
    : [];

  return {
    path: typeof config.path === "string" ? config.path : "",
    quantifier: config.quantifier === "every" ? "every" : "some",
    cases,
    defaultTaskId:
      typeof config.defaultTaskId === "number"
        ? String(config.defaultTaskId)
        : NO_TASK,
  };
}

export function newSwitchCaseId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `case-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `case-${Math.random().toString(36).slice(2, 10)}`;
}

export interface SwitchConfigResult {
  config: Record<string, unknown> | null;
  errors: Record<string, string>;
}

/**
 * Serializes the draft back into the tool config. Returns `config: null` when
 * a case is invalid, so the caller can keep showing the previous JSON.
 */
export function buildSwitchConfig(
  currentText: string | undefined,
  draft: SwitchDraft,
): SwitchConfigResult {
  const errors: Record<string, string> = {};
  const cases: unknown[] = [];

  for (const entry of draft.cases) {
    if (!entry.label.trim()) {
      errors[entry.id] = "A case label is required.";
      continue;
    }

    let when: unknown;
    if (entry.whenText.trim()) {
      try {
        when = JSON.parse(entry.whenText);
      } catch (err) {
        errors[entry.id] = `Invalid condition JSON: ${
          err instanceof Error ? err.message : String(err)
        }`;
        continue;
      }
    }

    cases.push({
      id: entry.id,
      label: entry.label.trim(),
      ...(when !== undefined ? { when } : {}),
      ...(entry.nextTaskId !== NO_TASK
        ? { nextTaskId: Number(entry.nextTaskId) }
        : {}),
    });
  }

  if (Object.keys(errors).length > 0) {
    return { config: null, errors };
  }

  const config: Record<string, unknown> = {
    ...parseSwitchConfigText(currentText),
    cases,
  };

  if (draft.path.trim()) config.path = draft.path.trim();
  else delete config.path;

  config.quantifier = draft.quantifier;

  if (draft.defaultTaskId !== NO_TASK) {
    config.defaultTaskId = Number(draft.defaultTaskId);
  } else {
    delete config.defaultTaskId;
  }

  return { config, errors };
}
