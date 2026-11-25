"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  ROTATE_STANDARD_API_KEY,
  STANDARD_API_KEY,
} from "@repo/queries/api/api-queries";
import { ApiStandardSection } from "../organisms/api-standard-section";

interface ApiStandardSectionContainerProps {
  onKey: (input: { apiKey: string; endpointName: string }) => void;
}

/** Loads and rotates the user's standard API key. */
export function ApiStandardSectionContainer({
  onKey,
}: ApiStandardSectionContainerProps) {
  const keyQuery = useQuery(STANDARD_API_KEY, {
    fetchPolicy: "cache-and-network",
  });
  const [rotate, rotateState] = useMutation(ROTATE_STANDARD_API_KEY, {
    refetchQueries: [STANDARD_API_KEY],
  });

  const rotateKey = async () => {
    const result = await rotate();
    const payload = result.data?.rotateStandardApiKey;
    if (payload?.apiKey) {
      onKey({ apiKey: payload.apiKey, endpointName: "Standard API key" });
    }
  };

  return (
    <ApiStandardSection
      standardKey={keyQuery.data?.standardApiKey ?? null}
      loading={keyQuery.loading}
      error={keyQuery.error ?? rotateState.error}
      busy={rotateState.loading}
      onRotate={() => void rotateKey()}
      onRetry={() => void keyQuery.refetch()}
    />
  );
}
