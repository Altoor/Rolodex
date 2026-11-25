"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#components/ui/collapsible";
import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { useAttemptTrace } from "../hooks/use-assisted-run";

interface TraceAccordionProps {
  runId: string;
  attemptId: number;
  summary?: string | null;
  live?: boolean;
}

/** Closed-by-default trace of every action, prompt, and model response. */
export function TraceAccordion({
  runId,
  attemptId,
  summary,
  live,
}: TraceAccordionProps) {
  const [open, setOpen] = useState(false);
  const { events, loading } = useAttemptTrace(
    runId,
    open ? attemptId : null,
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
        <span>{summary ?? "Trace"}</span>
        {live ? <Spinner className="size-3" /> : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {loading && events.length === 0 ? (
          <FieldDescription className="mt-1 text-xs">
            Loading trace…
          </FieldDescription>
        ) : events.length === 0 ? (
          <FieldDescription className="mt-1 text-xs">
            No trace events yet.
          </FieldDescription>
        ) : (
          <ol className="mt-1 flex flex-col gap-1 border-l pl-3 text-xs">
            {events.map((event) => (
              <li key={event.id} className="min-w-0">
                <span className="font-medium">{event.kind}</span>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {formatPayload(event.payload)}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatPayload(payload: unknown): string {
  if (payload == null) return "";
  try {
    const text = JSON.stringify(payload, null, 2);
    return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
  } catch {
    return String(payload);
  }
}
