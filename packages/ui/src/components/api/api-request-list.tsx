"use client";

import { useQuery } from "@apollo/client/react";
import { API_REQUESTS } from "@repo/queries/api/api-queries";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";
import { formatApiDate, type ApiRequest } from "./api-utils";

function statusVariant(
  status: ApiRequest["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "running" || status === "awaiting_input") return "secondary";
  return "outline";
}

export function ApiRequestList({ endpointId }: { endpointId: string }) {
  const { data, loading, refetch } = useQuery(API_REQUESTS, {
    variables: { endpointId, limit: 10 },
    fetchPolicy: "network-only",
  });
  const requests = (data?.apiRequests ?? []).filter(
    (request): request is ApiRequest => Boolean(request),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Recent requests
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void refetch()}
        >
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
