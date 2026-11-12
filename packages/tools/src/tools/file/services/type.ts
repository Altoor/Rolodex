import fs from "node:fs/promises";
import path from "node:path";
import { FilesystemError, resolveFilesPath } from "./paths";

export type FileTypeKind =
  "image" | "text" | "plaintext" | "audio" | "video" | "other";

export interface DetectedFileType {
  fileType: FileTypeKind;
  mimeType: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
}

interface ExtensionInfo {
  fileType: FileTypeKind;
  mimeType: string;
}

/**
 * Extension-based classification. The split between `plaintext` and `text`
 * follows the plan: plaintext is editable verbatim; text is a structured or
 * document format that may need a dedicated reader.
 */
const EXTENSIONS: Record<string, ExtensionInfo> = {
  // Images
  png: { fileType: "image", mimeType: "image/png" },
  jpg: { fileType: "image", mimeType: "image/jpeg" },
  jpeg: { fileType: "image", mimeType: "image/jpeg" },
  gif: { fileType: "image", mimeType: "image/gif" },
  webp: { fileType: "image", mimeType: "image/webp" },
  avif: { fileType: "image", mimeType: "image/avif" },
  bmp: { fileType: "image", mimeType: "image/bmp" },
  ico: { fileType: "image", mimeType: "image/x-icon" },
  tif: { fileType: "image", mimeType: "image/tiff" },
  tiff: { fileType: "image", mimeType: "image/tiff" },
  svg: { fileType: "image", mimeType: "image/svg+xml" },
  heic: { fileType: "image", mimeType: "image/heic" },
  heif: { fileType: "image", mimeType: "image/heif" },

  // Audio
  mp3: { fileType: "audio", mimeType: "audio/mpeg" },
  wav: { fileType: "audio", mimeType: "audio/wav" },
  ogg: { fileType: "audio", mimeType: "audio/ogg" },
  oga: { fileType: "audio", mimeType: "audio/ogg" },
  opus: { fileType: "audio", mimeType: "audio/opus" },
  flac: { fileType: "audio", mimeType: "audio/flac" },
  m4a: { fileType: "audio", mimeType: "audio/mp4" },
  aac: { fileType: "audio", mimeType: "audio/aac" },
  wma: { fileType: "audio", mimeType: "audio/x-ms-wma" },
  weba: { fileType: "audio", mimeType: "audio/webm" },

  // Video
  mp4: { fileType: "video", mimeType: "video/mp4" },
  m4v: { fileType: "video", mimeType: "video/x-m4v" },
  mov: { fileType: "video", mimeType: "video/quicktime" },
  webm: { fileType: "video", mimeType: "video/webm" },
  mkv: { fileType: "video", mimeType: "video/x-matroska" },
  avi: { fileType: "video", mimeType: "video/x-msvideo" },
  wmv: { fileType: "video", mimeType: "video/x-ms-wmv" },
  flv: { fileType: "video", mimeType: "video/x-flv" },
  mpeg: { fileType: "video", mimeType: "video/mpeg" },
  mpg: { fileType: "video", mimeType: "video/mpeg" },

  // Text documents / structured formats with dedicated readers
  md: { fileType: "text", mimeType: "text/markdown" },
  markdown: { fileType: "text", mimeType: "text/markdown" },
  mdx: { fileType: "text", mimeType: "text/markdown" },
  html: { fileType: "text", mimeType: "text/html" },
  htm: { fileType: "text", mimeType: "text/html" },
  pdf: { fileType: "text", mimeType: "application/pdf" },
  doc: { fileType: "text", mimeType: "application/msword" },
  docx: {
    fileType: "text",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  odt: {
    fileType: "text",
    mimeType: "application/vnd.oasis.opendocument.text",
  },
  rtf: { fileType: "text", mimeType: "application/rtf" },
  epub: { fileType: "text", mimeType: "application/epub+zip" },
  tex: { fileType: "text", mimeType: "application/x-tex" },
  rst: { fileType: "text", mimeType: "text/x-rst" },
  adoc: { fileType: "text", mimeType: "text/asciidoc" },

  // Plaintext and source code
  txt: { fileType: "plaintext", mimeType: "text/plain" },
  text: { fileType: "plaintext", mimeType: "text/plain" },
  log: { fileType: "plaintext", mimeType: "text/plain" },
  csv: { fileType: "plaintext", mimeType: "text/csv" },
  tsv: { fileType: "plaintext", mimeType: "text/tab-separated-values" },
  json: { fileType: "plaintext", mimeType: "application/json" },
  jsonc: { fileType: "plaintext", mimeType: "application/json" },
  ndjson: { fileType: "plaintext", mimeType: "application/x-ndjson" },
  yaml: { fileType: "plaintext", mimeType: "application/yaml" },
  yml: { fileType: "plaintext", mimeType: "application/yaml" },
  toml: { fileType: "plaintext", mimeType: "application/toml" },
  ini: { fileType: "plaintext", mimeType: "text/plain" },
  conf: { fileType: "plaintext", mimeType: "text/plain" },
  cfg: { fileType: "plaintext", mimeType: "text/plain" },
  env: { fileType: "plaintext", mimeType: "text/plain" },
  xml: { fileType: "plaintext", mimeType: "application/xml" },
  sql: { fileType: "plaintext", mimeType: "application/sql" },
  graphql: { fileType: "plaintext", mimeType: "application/graphql" },
  gql: { fileType: "plaintext", mimeType: "application/graphql" },
  sh: { fileType: "plaintext", mimeType: "text/x-shellscript" },
  bash: { fileType: "plaintext", mimeType: "text/x-shellscript" },
  zsh: { fileType: "plaintext", mimeType: "text/x-shellscript" },
  py: { fileType: "plaintext", mimeType: "text/x-python" },
  js: { fileType: "plaintext", mimeType: "text/javascript" },
  jsx: { fileType: "plaintext", mimeType: "text/jsx" },
  ts: { fileType: "plaintext", mimeType: "text/typescript" },
  tsx: { fileType: "plaintext", mimeType: "text/tsx" },
  mjs: { fileType: "plaintext", mimeType: "text/javascript" },
  cjs: { fileType: "plaintext", mimeType: "text/javascript" },
  go: { fileType: "plaintext", mimeType: "text/x-go" },
  rs: { fileType: "plaintext", mimeType: "text/x-rust" },
  java: { fileType: "plaintext", mimeType: "text/x-java" },
  c: { fileType: "plaintext", mimeType: "text/x-c" },
  h: { fileType: "plaintext", mimeType: "text/x-c" },
  cpp: { fileType: "plaintext", mimeType: "text/x-c++" },
  hpp: { fileType: "plaintext", mimeType: "text/x-c++" },
  cs: { fileType: "plaintext", mimeType: "text/x-csharp" },
  rb: { fileType: "plaintext", mimeType: "text/x-ruby" },
  php: { fileType: "plaintext", mimeType: "text/x-php" },
  swift: { fileType: "plaintext", mimeType: "text/x-swift" },
  kt: { fileType: "plaintext", mimeType: "text/x-kotlin" },
  kts: { fileType: "plaintext", mimeType: "text/x-kotlin" },
  css: { fileType: "plaintext", mimeType: "text/css" },
  scss: { fileType: "plaintext", mimeType: "text/x-scss" },
  sass: { fileType: "plaintext", mimeType: "text/x-sass" },
  less: { fileType: "plaintext", mimeType: "text/x-less" },
  vue: { fileType: "plaintext", mimeType: "text/x-vue" },
  svelte: { fileType: "plaintext", mimeType: "text/x-svelte" },
  lua: { fileType: "plaintext", mimeType: "text/x-lua" },
  pl: { fileType: "plaintext", mimeType: "text/x-perl" },
  r: { fileType: "plaintext", mimeType: "text/x-r" },
  dart: { fileType: "plaintext", mimeType: "text/x-dart" },
  scala: { fileType: "plaintext", mimeType: "text/x-scala" },
};

function extensionOf(name: string): string {
  const extension = path.extname(name).slice(1).toLowerCase();
  return extension;
}

export function extensionInfoForName(name: string): ExtensionInfo | undefined {
  return EXTENSIONS[extensionOf(name)];
}

/** Classification by filename extension only. */
export function detectFileTypeFromName(name: string): DetectedFileType {
  const extension = extensionOf(name);
  const info = EXTENSIONS[extension];

  if (info) {
    return {
      fileType: info.fileType,
      mimeType: info.mimeType,
      confidence: "high",
      reason: extension ? `extension .${extension}` : "known filename",
    };
  }

  return {
    fileType: "other",
    mimeType: null,
    confidence: "low",
    reason: extension ? `unknown extension .${extension}` : "no extension",
  };
}

interface SniffResult {
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

function looksLikeUtf8Text(buffer: Buffer): boolean {
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

function fileTypeFromMime(mimeType: string): FileTypeKind {
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
 * Classifies a filename plus optional leading bytes. Known extensions win over
 * magic bytes so formats like .docx (a ZIP container) stay `text`; magic bytes
 * fill the gap for unknown extensions.
 */
export function detectFileTypeFromBuffer(
  name: string,
  buffer: Buffer,
): DetectedFileType {
  const extension = extensionOf(name);
  const info = EXTENSIONS[extension];

  if (info) {
    return {
      fileType: info.fileType,
      mimeType: info.mimeType,
      confidence: "high",
      reason: extension ? `extension .${extension}` : "known filename",
    };
  }

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
    reason: extension ? `unknown extension .${extension}` : "no extension",
  };
}

export { fileTypeFromMime };

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
