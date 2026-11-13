import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import { mergeToolInput, readNumber } from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import { ensureFileType } from "./services/fileType";
import { DEFAULT_MAX_TEXT_BYTES } from "./services/limits";
import { resolveFileEntryRow } from "./services/search";
import { readTextFile } from "./services/storage";

const definition: ToolDefinition = {
  key: "read_plaintext_file",
  name: "Read plaintext file",
  description:
    "Read a plaintext file as UTF-8 text. Used by the editor and by text-processing flows.",
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
      maxBytes: {
        type: "number",
        description: "Maximum file size to read. Defaults to 5 MB.",
      },
    },
  },
  outputDescription:
    "The file and its UTF-8 content. Appended to toolState as `{ file, content }`.",
  exampleConfig: {},
};

export const readPlaintextFileTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);
      const row = await resolveFileEntryRow(context, { kind: "file" });
      const { row: typedRow, detected } = await ensureFileType(row);

      if (detected.fileType !== "plaintext") {
        throw new ToolInputError(
          `"${row.relativePath}" is ${detected.fileType}; use read_text_file or a media reader`,
        );
      }

      const maxBytes = readNumber(input, "maxBytes") ?? DEFAULT_MAX_TEXT_BYTES;
      const content = await readTextFile(row.relativePath, { maxBytes });
      const file = toFileEntryRef(typedRow);
      const output = { file, content };

      return {
        output,
        summary: `Read plaintext file "${file.name}"`,
        toolStateAppend: output,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
