import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import { ensureFileType } from "./services/fileType";
import { resolveFileEntryRow } from "./services/search";
import { buildFileViewUrl } from "./services/viewUrl";

const definition: ToolDefinition = {
  key: "read_audio_file",
  name: "Read audio file",
  description:
    "Read audio metadata and a streaming URL. Transcription can be added later.",
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
    "The file, audio metadata, and a streaming URL. Appended to toolState as `{ file, audio, url }`.",
  exampleConfig: {},
};

export const readAudioFileTool: Tool = {
  definition,

  async execute(context) {
    try {
      const row = await resolveFileEntryRow(context, { kind: "file" });
      const { row: typedRow, detected } = await ensureFileType(row);

      if (detected.fileType !== "audio") {
        throw new ToolInputError(
          `"${row.relativePath}" is ${detected.fileType}, not audio`,
        );
      }

      const file = toFileEntryRef(typedRow);
      const url = buildFileViewUrl(file);
      const audio = {
        mimeType:
          detected.mimeType ?? typedRow.mimeType ?? "application/octet-stream",
        duration: null as number | null,
        url,
      };
      const output = { file, audio, url };

      return {
        output,
        summary: `Read audio "${file.name}"`,
        toolStateAppend: output,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
