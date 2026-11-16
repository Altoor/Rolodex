import type { FileType } from "@repo/queries/__generated__/graphql";

export function formatBytes(size: number | null): string {
  if (size === null || Number.isNaN(size)) return "—";
  if (size < 1024) return `${size} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

export function shortHash(hash: string | null): string {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;
}

export function fileTypeLabel(fileType: FileType | null): string {
  if (!fileType) return "unknown";
  return fileType;
}
