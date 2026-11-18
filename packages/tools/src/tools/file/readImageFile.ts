import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import {
  mergeToolInput,
  readBoolean,
  readNumber,
  readString,
} from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import { ensureFileType } from "./services/fileType";
import { DEFAULT_MAX_BINARY_BYTES } from "./services/limits";
import { resolveFileEntryRow } from "./services/search";
import { readFileBuffer } from "./services/storage";
import {
  describeImageTexts,
  type ImageVisionRequest,
  type ImageVisionText,
} from "./services/vision";
import { buildFileViewUrl } from "./services/viewUrl";

/**
 * Builds one request per requested output. A custom prompt applies to the only
 * request, or to the description when both are requested; OCR keeps its
 * standard prompt so the two fields stay distinct.
 */
function visionRequests(
  describe: boolean,
  ocr: boolean,
  prompt: string | undefined,
): ImageVisionRequest[] {
  if (!describe && !ocr) {
    return prompt ? [{ kind: "description", prompt }] : [];
  }

  const requests: ImageVisionRequest[] = [];

  if (describe) requests.push({ kind: "description", prompt });
  if (ocr) {
    requests.push({ kind: "ocr", prompt: describe ? undefined : prompt });
  }

  return requests;
}

function visionSummary(
  file: { name: string },
  vision: ImageVisionText | undefined,
): string {
  if (!vision) return `Read image "${file.name}"`;
  if (vision.description && vision.ocr) {
    return `Described and extracted text from image "${file.name}"`;
  }
  if (vision.ocr) return `Extracted text from image "${file.name}"`;
  return `Described image "${file.name}"`;
}

const definition: ToolDefinition = {
  key: "read_image_file",
  name: "Read image file",
  description:
    "Read image metadata and a preview URL. Set describe or ocr to send the image to the configured vision model. Vision failures are reported as a warning and do not block the metadata read.",
  category: "file",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description: "Optional direct file id.",
      },
      path: {
        type: "string",
        description: "Optional relative path of the file.",
      },
      describe: {
        type: "boolean",
        description: "Describe the image with the vision model.",
        default: false,
      },
      ocr: {
        type: "boolean",
        description: "Extract text from the image with the vision model.",
        default: false,
      },
      prompt: {
        type: "string",
        description:
          "Optional custom vision prompt. It replaces the description prompt, or the OCR prompt when OCR is the only requested output.",
      },
      includeBase64: {
        type: "boolean",
        description:
          "Include the image bytes as base64 in toolState. Defaults to false. Vision calls do not require this.",
        default: false,
      },
      maxBytes: {
        type: "number",
        description:
          "Maximum image size to read for base64 or vision. Defaults to 25 MB.",
      },
    },
  },
  outputDescription:
    "The file, image metadata, and a streaming URL. Appended to toolState as `{ file, image, url }`. `describe` adds `description`, `ocr` adds `ocr`, and a custom prompt adds `description` unless only OCR is requested. Failures add `warning` instead.",
  exampleConfig: {
    describe: true,
  },
};

export const readImageFileTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);
      const row = await resolveFileEntryRow(context, { kind: "file" });
      const { row: typedRow, detected } = await ensureFileType(row);

      if (detected.fileType !== "image") {
        throw new ToolInputError(
          `"${row.relativePath}" is ${detected.fileType}, not an image`,
        );
      }

      const includeBase64 = readBoolean(input, "includeBase64") ?? false;
      const describe = readBoolean(input, "describe") ?? false;
      const ocr = readBoolean(input, "ocr") ?? false;
      const prompt = readString(input, "prompt")?.trim() || undefined;
      const requests = visionRequests(describe, ocr, prompt);
      const maxBytes =
        readNumber(input, "maxBytes") ?? DEFAULT_MAX_BINARY_BYTES;

      let base64: string | undefined;
      if (includeBase64 || requests.length > 0) {
        const buffer = await readFileBuffer(row.relativePath, { maxBytes });
        if (includeBase64) base64 = buffer.toString("base64");
      }

      const file = toFileEntryRef(typedRow);
      const url = buildFileViewUrl(file);
      const image = {
        mimeType:
          detected.mimeType ?? typedRow.mimeType ?? "application/octet-stream",
        width: null as number | null,
        height: null as number | null,
        ...(base64 !== undefined ? { base64 } : {}),
      };

      let vision: ImageVisionText | undefined;
      let warning: string | undefined;

      if (requests.length > 0) {
        // Metadata and the preview URL are still useful when vision fails.
        const result = await describeImageTexts(typedRow, {
          userId: context.userId,
          requests,
          maxBytes,
        });

        if (result.text.description || result.text.ocr) vision = result.text;
        warning = result.warning;
        if (warning) console.warn(`[read_image_file] ${warning}`);
      }

      const output = {
        file,
        image,
        url,
        ...(vision?.description ? { description: vision.description } : {}),
        ...(vision?.ocr ? { ocr: vision.ocr } : {}),
        ...(vision?.model ? { visionModel: vision.model } : {}),
        ...(warning ? { warning } : {}),
      };

      return {
        output,
        summary: visionSummary(file, vision),
        toolStateAppend: output,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
