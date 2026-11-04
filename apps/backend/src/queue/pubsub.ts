import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for live queue progress. The backend is a single
 * process, so a plain EventEmitter is all the queue processor and the
 * GraphQL subscription need to talk to each other.
 */
export const queueEvents = new EventEmitter();
queueEvents.setMaxListeners(0);

export interface QueuedTaskEvent {
  queuedTask: {
    id: number;
    taskId: number;
    state: string;
    status: string;
    runId: string;
    result: unknown;
    queued_at: Date | string;
    queued_by: number;
  };
  message: string;
}

export function publishQueuedTaskEvent(event: QueuedTaskEvent): void {
  queueEvents.emit("queuedTask", event);
}
