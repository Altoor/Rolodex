"use client";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";
import { formatApiDate, type ApiRequest } from "../lib/api-utils";

function statusVariant(
  status: ApiRequest["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "running" || status === "awaiting_input") return "secondary";
  return "outline";
}

interface ApiRequestListProps {
  requests: ApiRequest[];
  loading: boolean;
  onRefresh: () => void;
}

/** Recent invocations for one endpoint. */
export function ApiRequestList({
  requests,
  loading,
  onRefresh,
}: ApiRequestListProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Recent requests
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {loading && requests.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner /> Loading requests…
        </p>
      ) : requests.length === 0 ? (
        <p className="text-xs text-muted-foreground">No requests yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <Badge variant={statusVariant(request.status)}>
                {request.status}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground">
                {request.id}
              </span>
              <span className="ml-auto text-muted-foreground">
                {formatApiDate(request.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
