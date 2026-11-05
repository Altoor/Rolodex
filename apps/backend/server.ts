import "dotenv/config";
import { createYoga } from "graphql-yoga";
import { createServer } from "node:http";
import { schema } from "./src/schema/index.ts";
import jwt from "jsonwebtoken";
import { getUser } from "./src/schema/user/user-service.ts";
import { resetStaleRunningTasks, triggerQueue } from "./src/queue/index.ts";
import { users } from "./src/db/index.ts";

const yoga = createYoga({
  schema,
  context: async ({ request }) => {
    const user = await extractUser(request.headers.get("authorization"));
    return { user };
  },
});
const server = createServer(yoga);

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

async function extractUser(
  auth_header: string | null,
): Promise<typeof users.$inferSelect | null> {
  if (!auth_header) return null;

  const token = auth_header.split(" ")[1];

  if (!token) return null;

  try {
    const theTokenVerified = jwt.verify(token, process.env.TOKEN_SECRET);
    if (typeof theTokenVerified === "string" || !theTokenVerified.aud)
      return null;

    return await getUser(parseInt(theTokenVerified.aud as string));
  } catch {
    return null;
  }
}
