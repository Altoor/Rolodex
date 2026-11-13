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
import { resolveFileEntryRow } from "./services/search";
import { transcribeAudioFile } from "./services/transcribe";
import { buildFileViewUrl } from "./services/viewUrl";

const definition: ToolDefinition = {
  key: "read_audio_file",
  name: "Read audio file",
  description:
    "Read audio metadata and a streaming URL. Set transcribe to true to send the file to the Whisper API configured on the Settings page.",
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
      transcribe: {
        type: "boolean",
        description:
          "Transcribe the audio with the configured Whisper API. Defaults to false.",
        default: false,
      },
      language: {
        type: "string",
        description: "Optional BCP-47 language code, for example `en` or `da`.",
      },
      model: {
        type: "string",
        description:
          "Optional Whisper model name. Falls back to the Settings page value.",
      },
      maxBytes: {
        type: "number",
        description:
          "Maximum audio size to upload for transcription. Defaults to 25 MB.",
      },
    },
  },
  outputDescription:
    "The file, audio metadata, and a streaming URL. When transcription is enabled, `transcription` is included. Appended to toolState.",
  exampleConfig: { transcribe: false },
};

export const readAudioFileTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);
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

      const transcribe = readBoolean(input, "transcribe") ?? false;
      const transcription = transcribe
        ? await transcribeAudioFile(typedRow, {
            language: readString(input, "language"),
            model: readString(input, "model"),
            maxBytes: readNumber(input, "maxBytes"),
          })
        : undefined;

      if (transcription?.duration != null) {
        audio.duration = transcription.duration;
      }

      const output = {
        file,
        audio,
        url,
        ...(transcription ? { transcription } : {}),
      };

      return {
        output,
        summary: transcription
          ? `Read and transcribed audio "${file.name}"`
          : `Read audio "${file.name}"`,
        toolStateAppend: output,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
