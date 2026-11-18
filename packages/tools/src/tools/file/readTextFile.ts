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
  key: "read_text_file",
  name: "Read text file",
  description:
    "Read a structured/document text file. Markdown, HTML, and plaintext are returned verbatim; PDF/DOCX extraction is not implemented yet.",
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
    "The file, extracted content (or null when unsupported), and format. Appended to toolState as `{ file, content, format }`.",
  exampleConfig: {},
};

export const readTextFileTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);
      const row = await resolveFileEntryRow(context, { kind: "file" });
      const { row: typedRow, detected } = await ensureFileType(row);

      if (detected.fileType !== "text" && detected.fileType !== "plaintext") {
        throw new ToolInputError(
          `"${row.relativePath}" is ${detected.fileType}; use a media or opaque reader`,
        );
      }

      const file = toFileEntryRef(typedRow);

      if (
        detected.fileType === "text" &&
        !isReadableTextMime(detected.mimeType)
      ) {
        const output = {
          file,
          content: null,
          format: detected.mimeType ?? detected.fileType,
          unsupported: true,
          reason: "Text extraction for this format is not implemented yet.",
        };

        return {
          output,
          summary: `Preview not implemented for "${file.name}" (${detected.mimeType ?? detected.fileType})`,
          toolStateAppend: output,
        };
      }

      const maxBytes = readNumber(input, "maxBytes") ?? DEFAULT_MAX_TEXT_BYTES;
      const content = await readTextFile(row.relativePath, { maxBytes });
      const output = {
        file,
        content,
        format: detected.mimeType ?? detected.fileType,
      };

      return {
        output,
        summary: `Read text file "${file.name}"`,
        toolStateAppend: output,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};

function isReadableTextMime(mimeType: string | null): boolean {
  if (!mimeType) return true;
  return mimeType.startsWith("text/") || mimeType === "application/x-tex";
}
