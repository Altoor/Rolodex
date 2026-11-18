import path from "node:path";
import type { DetectedFileType, ExtensionInfo } from "./types";

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
  // Markdown is editable verbatim, so it belongs with plaintext.
  md: { fileType: "plaintext", mimeType: "text/markdown" },
  markdown: { fileType: "plaintext", mimeType: "text/markdown" },
  mdx: { fileType: "plaintext", mimeType: "text/markdown" },
  mdown: { fileType: "plaintext", mimeType: "text/markdown" },
  mkd: { fileType: "plaintext", mimeType: "text/markdown" },
  mkdn: { fileType: "plaintext", mimeType: "text/markdown" },
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
  return path.extname(name).slice(1).toLowerCase();
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
