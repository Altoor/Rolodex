import type {
  apiEndpoints,
  apiRequests,
  queuedTasks,
  runs,
} from "@repo/db";

export type ApiEndpointRow = typeof apiEndpoints.$inferSelect;
export type ApiRequestRow = typeof apiRequests.$inferSelect;
export type RunRow = typeof runs.$inferSelect;

export interface ApiEndpointInput {
  name: string;
  description?: string;
  taskId: number;
  stateField?: string | null;
}

export interface ApiEndpointUpdate {
  name?: string;
  description?: string;
  taskId?: number;
  stateField?: string | null;
  enabled?: boolean;
}

export interface CreatedApiEndpoint {
  endpoint: ApiEndpointRow;
  /** Plaintext key. Only returned on create and rotate. */
  apiKey: string;
}

export interface QueuedFlow {
  runId: string;
  stepId: number;
}

export type FlowStatus =
  | "accepted"
  | "running"
  | "awaiting_input"
  | "completed"
  | "failed"
  | "cancelled";

export interface FlowStepSnapshot {
  id: number;
  taskId: number;
  taskName: string;
  toolKey: string | null;
  status: string;
  summary: string | null;
  note: string | null;
  queuedAt: string;
}

export interface FlowSnapshot {
  requestId: string;
  runId: string;
  status: FlowStatus;
  endpoint: {
    id: string;
    name: string;
    slug: string;
  };
  submittedAt: string;
  finishedAt: string | null;
  result: unknown;
  error: string | null;
  steps: FlowStepSnapshot[];
}

export interface InvocationAccepted {
  accepted: true;
  requestId: string;
  runId: string;
  status: "accepted";
  statusUrl: string;
  websocketUrl: string;
}

export type QueuedRow = typeof queuedTasks.$inferSelect;

export interface ApiRuntime {
  /** Queues the endpoint's task through the standard queue. */
  queueFlow(input: {
    userId: number;
    taskId: number;
    state: string;
    fileIds?: number[];
  }): Promise<QueuedFlow>;
  /** Stores uploaded files and returns their file entry ids. */
  uploadFiles(files: File[]): Promise<Array<{ id: number }>>;
  /** Calls the listener whenever a step of the run changes. */
  onRunEvent(runId: string, listener: () => void): () => void;
}
