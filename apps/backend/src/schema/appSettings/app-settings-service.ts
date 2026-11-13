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

export async function updateAppSettingsForApi(
  input: UpdateAppSettingsInput,
) {
  if (input.ollamaBaseUrl !== undefined) {
    input = {
      ...input,
      ollamaBaseUrl: validateHttpUrl(
        input.ollamaBaseUrl,
        "ollamaBaseUrl",
      ),
    };
  }

  if (input.whisperApiUrl !== undefined) {
    input = {
      ...input,
      whisperApiUrl: validateHttpUrl(
        input.whisperApiUrl,
        "whisperApiUrl",
      ),
    };
  }

  return updateAppSettings(input);
}

export type { TranscriberBackend };
