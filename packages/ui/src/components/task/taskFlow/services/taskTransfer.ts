const FORMAT = "rolodex-tasks";

/** Downloads a tasks export as versioned JSON. */
export function downloadTasksFile(data: unknown, fileName?: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    fileName ??
    `rolodex-tasks-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Parses clipboard/file text, returning null when it is not a tasks export. */
export function parseTasksFile(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    const record =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;

    return record?.format === FORMAT ? record : null;
  } catch {
    return null;
  }
}
