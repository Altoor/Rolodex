import { GraphQLError } from "graphql";
import {
  getAppSettings,
  updateAppSettings,
  type TranscriberBackend,
  type UpdateAppSettingsInput,
} from "@repo/db";

function validateHttpUrl(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new GraphQLError(`${field} must be a valid URL`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GraphQLError(`${field} must use http or https`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return trimmed;
}

export async function getAppSettingsForApi() {
  return getAppSettings();
}

export async function updateAppSettingsForApi(input: UpdateAppSettingsInput) {
  if (input.ollamaBaseUrl !== undefined) {
    input = {
      ...input,
      ollamaBaseUrl: validateHttpUrl(input.ollamaBaseUrl, "ollamaBaseUrl"),
    };
  }

  if (input.whisperApiUrl !== undefined) {
    input = {
      ...input,
      whisperApiUrl: validateHttpUrl(input.whisperApiUrl, "whisperApiUrl"),
    };
  }

  if (input.maxParallelTasks !== undefined) {
    if (
      !Number.isInteger(input.maxParallelTasks) ||
      input.maxParallelTasks < 1 ||
      input.maxParallelTasks > 50
    ) {
      throw new GraphQLError("maxParallelTasks must be between 1 and 50", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }

  if (input.ollamaKeepAlive !== undefined) {
    const raw = input.ollamaKeepAlive?.trim();
    if (raw) {
      const isInteger = /^-?\d+$/.test(raw);
      // Ollama accepts seconds (-1 keeps the model resident) or Go-style
      // durations such as 30m, 1h, or 500ms. Duration values must be positive.
      const isDuration = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(raw);

      if ((isInteger && Number(raw) < -1) || (!isInteger && !isDuration)) {
        throw new GraphQLError(
          "ollamaKeepAlive must be a duration such as 30m, a positive number of seconds, -1 (keep loaded), or empty to use the server default",
          { extensions: { code: "BAD_USER_INPUT" } },
        );
      }
    }
  }

  return updateAppSettings(input);
}

export type { TranscriberBackend };
