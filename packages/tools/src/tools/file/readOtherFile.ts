import type { Tool, ToolDefinition } from "../../model";
import { mergeToolInput, readBoolean, readNumber } from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import { ensureFileType } from "./services/fileType";
import { DEFAULT_MAX_BINARY_BYTES } from "./services/limits";
import { resolveFileEntryRow } from "./services/search";
import { readFileBuffer } from "./services/storage";
import { buildFileViewUrl } from "./services/viewUrl";

const definition: ToolDefinition = {
  key: "read_other_file",
  name: "Read other file",
  description:
    "Read an opaque/binary file as a download URL. Optionally include base64 bytes.",
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
        description: "Include the file bytes as base64. Defaults to false.",
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
    "The file, a download URL, and optional base64 bytes. Appended to toolState as `{ file, url }`.",
  exampleConfig: {
    includeBase64: false,
  },
};

export const readOtherFileTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);
      const row = await resolveFileEntryRow(context, { kind: "file" });
      const { row: typedRow } = await ensureFileType(row);

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
      const output = {
        file,
        url,
        ...(base64 !== undefined ? { base64 } : {}),
      };

      return {
        output,
        summary: `Read file "${file.name}"`,
        toolStateAppend: output,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
