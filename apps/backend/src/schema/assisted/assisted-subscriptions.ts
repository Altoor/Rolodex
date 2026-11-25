import { requireUserId } from "../auth";
import { builder } from "../builder";
import { AssistedTraceEvent } from "./assisted-types";
import { requireOwnedRun } from "./assisted-access";
import { assistedEvents } from "../../assisted/infrastructure/trace";
import type { TraceRow } from "./assisted-types";

builder.subscriptionType({
  fields: (t) => ({
    assistedTraceEvent: t.field({
      type: AssistedTraceEvent,
      args: { runId: t.arg.string({ required: true }) },
      subscribe: async function* (_root, { runId }, ctx) {
        const userId = requireUserId(ctx);
        await requireOwnedRun(userId, runId);

        for (;;) {
          const event = await new Promise<{ runId: string; event: TraceRow }>(
            (resolve) => assistedEvents.once("trace", resolve),
          );
          if (event.runId !== runId) continue;
          yield event.event;
        }
      },
      resolve: (event) => event,
    }),
  }),
});
