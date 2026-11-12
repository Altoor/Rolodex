import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import { mergeToolInput, readBoolean, readNumber } from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import { ensureFileType } from "./services/fileType";
import { DEFAULT_MAX_BINARY_BYTES } from "./services/limits";
import { resolveFileEntryRow } from "./services/search";
import { readFileBuffer } from "./services/storage";
import { buildFileViewUrl } from "./services/viewUrl";

const definition: ToolDefinition = {
  key: "read_image_file",
  name: "Read image file",
  description:
    "Read image metadata and a preview URL. Optionally include the image bytes as base64 for vision models.",
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
      includeBase64: {
        type: "boolean",
        description: "Include the image bytes as base64. Defaults to false.",
        default: false,
      },
      maxBytes: {
        type: "number",
        description:
          "Maximum size to read when includeBase64 is true. Defaults to 25 MB.",
      },
    },
  },
  outputDescription:
    "The file, image metadata, and a streaming URL. Appended to toolState as `{ file, image, url }`.",
  exampleConfig: {
    includeBase64: false,
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
      const maxBytes =
        readNumber(input, "maxBytes") ?? DEFAULT_MAX_BINARY_BYTES;

      let base64: string | undefined;
      if (includeBase64) {
        const buffer = await readFileBuffer(row.relativePath, { maxBytes });
        base64 = buffer.toString("base64");
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
      const output = { file, image, url };

      return {
        output,
        summary: `Read image "${file.name}"`,
        toolStateAppend: output,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
