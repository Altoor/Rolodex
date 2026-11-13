import { gql } from "../__generated__";

export const UPDATE_APP_SETTINGS = gql(/* GraphQL */ `
  mutation UpdateAppSettings(
    $ollamaBaseUrl: String
    $transcriberBackend: TranscriberBackend
    $whisperApiUrl: String
    $whisperModel: String
  ) {
    updateAppSettings(
      ollamaBaseUrl: $ollamaBaseUrl
      transcriberBackend: $transcriberBackend
      whisperApiUrl: $whisperApiUrl
      whisperModel: $whisperModel
    ) {
      ollamaBaseUrl
      transcriberBackend
      whisperApiUrl
      whisperModel
      updatedAt
    }
  }
`);
