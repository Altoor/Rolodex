import type { FileTypeKind } from "./types";

export interface SniffResult {
  mimeType: string;
  fileType: FileTypeKind;
}

/** Minimal magic-byte sniffing for common binary formats. */
export function sniffMagicBytes(buffer: Buffer): SniffResult | null {
  if (buffer.length >= 8) {
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return { mimeType: "image/png", fileType: "image" };
    }
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mimeType: "image/jpeg", fileType: "image" };
  }

  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") {
      return { mimeType: "image/gif", fileType: "image" };
    }
  }

  if (buffer.length >= 12) {
    const riff = buffer.subarray(0, 4).toString("ascii");
    const type = buffer.subarray(8, 12).toString("ascii");
    if (riff === "RIFF" && type === "WEBP") {
      return { mimeType: "image/webp", fileType: "image" };
    }
    if (riff === "RIFF" && type === "WAVE") {
      return { mimeType: "audio/wav", fileType: "audio" };
    }
  }

  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  ) {
    return { mimeType: "application/pdf", fileType: "text" };
  }

  if (buffer.length >= 4) {
    const header = buffer.subarray(0, 4).toString("ascii");
    if (header === "fLaC") return { mimeType: "audio/flac", fileType: "audio" };
    if (header === "OggS") return { mimeType: "audio/ogg", fileType: "audio" };
    if (header === "ID3") return { mimeType: "audio/mpeg", fileType: "audio" };
  }

  if (buffer.length >= 4) {
    const marker = buffer.subarray(0, 4);
    if (
      marker[0] === 0x1a &&
      marker[1] === 0x45 &&
      marker[2] === 0xdf &&
      marker[3] === 0xa3
    ) {
      return { mimeType: "video/webm", fileType: "video" };
    }
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    return { mimeType: "video/mp4", fileType: "video" };
  }

  return null;
}

/** True when the leading bytes are valid UTF-8 without NULs. */
export function looksLikeUtf8Text(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  // NUL bytes are a strong signal for binary content.
  if (buffer.includes(0x00)) return false;

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}
