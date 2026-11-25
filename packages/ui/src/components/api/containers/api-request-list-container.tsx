"use client";

import { useQuery } from "@apollo/client/react";
import { API_REQUESTS } from "@repo/queries/api/api-queries";
import type { ApiRequest } from "../lib/api-utils";
import { ApiRequestList } from "../molecules/api-request-list";

/** Loads recent invocations for one endpoint. */
export function ApiRequestListContainer({
  endpointId,
}: {
  endpointId: string;
}) {
  const { data, loading, refetch } = useQuery(API_REQUESTS, {
    variables: { endpointId, limit: 10 },
    fetchPolicy: "network-only",
  });
  const requests = (data?.apiRequests ?? []).filter(
    (request): request is ApiRequest => Boolean(request),
  );

  return (
    <ApiRequestList
      requests={requests}
      loading={loading}
      onRefresh={() => void refetch()}
    />
  );
}
