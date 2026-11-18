import type { Tool, ToolDefinition } from "../../model";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import { updateFileEntryRow } from "./services/entry";
import { resolveFileEntryRow } from "./services/search";
import { detectFileType as detectFileTypeOnDisk } from "./services/type";

const definition: ToolDefinition = {
  key: "detect_file_type",
  name: "Detect file type",
  description:
    "Detect a file's semantic type and MIME type from its extension and leading bytes, then persist the result.",
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
    },
  },
  outputDescription:
    "The updated file plus its detected type, MIME type, confidence, and reason. Appended to toolState as `{ file }`.",
  exampleConfig: {},
};

export const detectFileTypeTool: Tool = {
  definition,

  async execute(context) {
    try {
      const row = await resolveFileEntryRow(context, { kind: "file" });
      const detected = await detectFileTypeOnDisk(row.relativePath);

      const updated = await updateFileEntryRow(row.id, {
        fileType: detected.fileType,
        mimeType: detected.mimeType,
      });
      const file = toFileEntryRef(updated);

      return {
        output: {
          file,
          type: detected.fileType,
          mimeType: detected.mimeType,
          confidence: detected.confidence,
          reason: detected.reason,
        },
        summary: `Detected ${detected.fileType} (${detected.mimeType ?? "unknown MIME"}) for "${updated.relativePath}"`,
        toolStateAppend: { file },
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
