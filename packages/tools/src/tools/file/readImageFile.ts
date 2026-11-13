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
import { describeImageFile } from "./services/vision";
import { buildFileViewUrl } from "./services/viewUrl";

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
          "Optional custom vision prompt. Implies vision even when describe and ocr are false.",
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
    "The file, image metadata, and a streaming URL. Appended to toolState as `{ file, image, url }`. Vision adds `{ vision: { model, text, kind } }`; failures add `warning` instead.",
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
      const prompt = readString(input, "prompt");
      const wantsVision =
        describe || ocr || (prompt !== undefined && prompt.trim() !== "");
      const maxBytes =
        readNumber(input, "maxBytes") ?? DEFAULT_MAX_BINARY_BYTES;

      let base64: string | undefined;
      if (includeBase64 || wantsVision) {
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

      let vision: Awaited<ReturnType<typeof describeImageFile>> | undefined;
      let warning: string | undefined;

      if (wantsVision) {
        const kind = ocr && !describe ? "ocr" : "description";
        const effectivePrompt =
          prompt ??
          (describe && ocr
            ? "Describe this image and extract all visible text."
            : undefined);

        try {
          vision = await describeImageFile(typedRow, {
            userId: context.userId,
            kind,
            prompt: effectivePrompt,
            maxBytes,
          });
        } catch (err) {
          // Metadata and the preview URL are still useful when vision fails.
          warning = `Vision failed: ${
            err instanceof Error ? err.message : String(err)
          }`;
          console.warn(`[read_image_file] ${warning}`);
        }
      }

      const output = {
        file,
        image,
        url,
        ...(vision ? { vision } : {}),
        ...(warning ? { warning } : {}),
      };

      return {
        output,
        summary: vision
          ? vision.kind === "ocr"
            ? `Extracted text from image "${file.name}"`
            : `Described image "${file.name}"`
          : `Read image "${file.name}"`,
        toolStateAppend: output,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
