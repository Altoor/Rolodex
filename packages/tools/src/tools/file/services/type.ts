export {
  detectFileType,
  detectFileTypeFromBuffer,
  fileTypeFromMime,
} from "./type/detect";
export {
  detectFileTypeFromName,
  extensionInfoForName,
} from "./type/extensions";
export { sniffMagicBytes } from "./type/magic";
export type { DetectedFileType, FileTypeKind } from "./type/types";
