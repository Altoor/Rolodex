import fs from "node:fs/promises";
import path from "node:path";
import { FilesystemError, resolveFilesPath } from "../paths";
import { detectFileTypeFromName } from "./extensions";
import { looksLikeUtf8Text, sniffMagicBytes } from "./magic";
import type { DetectedFileType, FileTypeKind } from "./types";

/**
 * Classifies a filename plus optional leading bytes. Known extensions win over
 * magic bytes so formats like .docx (a ZIP container) stay `text`; magic bytes
 * fill the gap for unknown extensions.
 */
export function detectFileTypeFromBuffer(
  name: string,
  buffer: Buffer,
): DetectedFileType {
  const byName = detectFileTypeFromName(name);
  if (byName.confidence === "high") return byName;

  const sniffed = sniffMagicBytes(buffer);
  if (sniffed) {
    return {
      fileType: sniffed.fileType,
      mimeType: sniffed.mimeType,
      confidence: "medium",
      reason: "magic bytes",
    };
  }

  if (looksLikeUtf8Text(buffer)) {
    return {
      fileType: "plaintext",
      mimeType: "text/plain",
      confidence: "low",
      reason: "unknown extension but valid UTF-8 text",
    };
  }

  return {
    fileType: "other",
    mimeType: "application/octet-stream",
    confidence: "low",
    reason: byName.reason,
  };
}

export function fileTypeFromMime(mimeType: string): FileTypeKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("application/vnd.") ||
    mimeType === "application/msword" ||
    mimeType === "application/rtf" ||
    mimeType === "application/epub+zip"
  ) {
    return "text";
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/yaml" ||
    mimeType === "application/toml"
  ) {
    return "plaintext";
  }
  return "other";
}

/**
 * Detects a file's type from its name, falling back to magic-byte sniffing for
 * unknown extensions. Known extensions avoid reading the file at all.
 */
export async function detectFileType(
  relativePath: string,
): Promise<DetectedFileType> {
  const absolutePath = resolveFilesPath(relativePath);

  const stat = await fs.lstat(absolutePath).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  });

  if (!stat) throw new FilesystemError(`file "${relativePath}" not found`);
  if (!stat.isFile()) {
    throw new FilesystemError(`"${relativePath}" is not a file`);
  }

  const name = path.basename(absolutePath);
  const byName = detectFileTypeFromName(name);
  if (byName.confidence === "high") return byName;

  const handle = await fs.open(absolutePath, "r");
  try {
    const length = Math.min(stat.size, 4096);
    const buffer = Buffer.alloc(length);
    if (length > 0) {
      await handle.read(buffer, 0, length, 0);
    }
    return detectFileTypeFromBuffer(name, buffer);
  } finally {
    await handle.close();
  }
}
