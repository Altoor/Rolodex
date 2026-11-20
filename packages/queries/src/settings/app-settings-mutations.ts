import { gql } from "../__generated__";

export const UPDATE_APP_SETTINGS = gql(/* GraphQL */ `
  mutation UpdateAppSettings(
    $ollamaBaseUrl: String
    $transcriberBackend: TranscriberBackend
    $whisperApiUrl: String
    $whisperModel: String
    $maxParallelTasks: Int
    $ollamaKeepAlive: String
    $preloadModels: Boolean
    $warmModelsOnStartup: Boolean
  ) {
    updateAppSettings(
      ollamaBaseUrl: $ollamaBaseUrl
      transcriberBackend: $transcriberBackend
      whisperApiUrl: $whisperApiUrl
      whisperModel: $whisperModel
      maxParallelTasks: $maxParallelTasks
      ollamaKeepAlive: $ollamaKeepAlive
      preloadModels: $preloadModels
      warmModelsOnStartup: $warmModelsOnStartup
    ) {
      ollamaBaseUrl
      transcriberBackend
      whisperApiUrl
      whisperModel
      maxParallelTasks
      ollamaKeepAlive
      preloadModels
      warmModelsOnStartup
      updatedAt
    }
  }
`);
