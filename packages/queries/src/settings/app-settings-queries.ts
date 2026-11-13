import { gql } from "../__generated__";

export const APP_SETTINGS = gql(/* GraphQL */ `
  query AppSettings {
    appSettings {
      ollamaBaseUrl
      transcriberBackend
      whisperApiUrl
      whisperModel
      updatedAt
    }
  }
`);
