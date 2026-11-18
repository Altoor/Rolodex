export type FileTypeKind =
  "image" | "text" | "plaintext" | "audio" | "video" | "other";

export interface DetectedFileType {
  fileType: FileTypeKind;
  mimeType: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface ExtensionInfo {
  fileType: FileTypeKind;
  mimeType: string;
}
