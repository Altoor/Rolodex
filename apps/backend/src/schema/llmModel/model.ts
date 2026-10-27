import { ModelResponse } from "ollama";

export interface OllamaModelResponse extends ModelResponse {
  capabilities: string[];
}
