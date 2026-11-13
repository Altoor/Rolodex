import "dotenv/config";
import { createYoga } from "graphql-yoga";
import { createServer } from "node:http";
import { schema } from "./src/schema/index.ts";
import { extractUser } from "./src/auth-token.ts";
import { resetStaleRunningTasks, triggerQueue } from "./src/queue/index.ts";
import { handleFileUploadRequest } from "./src/schema/file/file-upload.ts";
import { handleFileViewRequest } from "./src/schema/file/file-service.ts";

const yoga = createYoga({
  schema,
  // Applies to GraphQL JSON and multipart uploads. Per-file and file-count
  // limits are enforced in uploadFilesForApi before reading each stream.
  maxRequestBodySize: 25 * 1024 * 1024,
  context: async ({ request }) => {
    const user = await extractUser(request.headers.get("authorization"));
    return { user };
  },
});

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/files/upload" || pathname === "/files/upload/") {
    void handleFileUploadRequest(req, res);
    return;
  }

  if (/^\/files\/\d+\/content\/?$/.test(pathname)) {
    void handleFileViewRequest(req, res);
    return;
  }

  yoga.requestListener(req, res);
});

// A stray unhandled rejection should log, not take the queue server down.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

server.listen(4000, () => {
  console.info("Server is running on http://localhost:4000/graphql");
  // Re-queue anything that was mid-run when the process last stopped,
  // then pick up whatever is left in the queue.
  void resetStaleRunningTasks();
  triggerQueue();
});
