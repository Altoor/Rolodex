import { updateFileEntryRow, type FileEntryRow } from "./entry";
import { detectFileType, type DetectedFileType } from "./type";
import { ToolInputError } from "../../../model";

/**
 * Returns the stored type when present, otherwise detects and persists it.
 * Used by the read_* tools so they work even on rows created before type
 * detection existed.
 */
export async function ensureFileType(row: FileEntryRow): Promise<{
  row: FileEntryRow;
  detected: DetectedFileType;
}> {
  if (row.kind !== "file") {
    throw new ToolInputError(`"${row.relativePath}" is not a file`);
  }

  if (row.fileType && row.mimeType) {
    return {
      row,
      detected: {
        fileType: row.fileType,
        mimeType: row.mimeType,
        confidence: "high",
        reason: "stored",
      },
    };
  }

  const detected = await detectFileType(row.relativePath);
  const updated = await updateFileEntryRow(row.id, {
    fileType: detected.fileType,
    mimeType: detected.mimeType,
  });

  return { row: updated, detected };
}
