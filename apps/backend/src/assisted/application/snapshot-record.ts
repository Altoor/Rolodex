export type SnapshotRecord = Record<string, unknown>;

export const asRecord = (value: unknown): SnapshotRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as SnapshotRecord)
    : {};

export const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;
