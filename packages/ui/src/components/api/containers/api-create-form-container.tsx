"use client";

import { useMutation } from "@apollo/client/react";
import {
  API_ENDPOINTS,
  CREATE_API_ENDPOINT,
} from "@repo/queries/api/api-queries";
import { ApiCreateForm, type ApiCreateValues } from "../organisms/api-create-form";
import type { TaskOption } from "../lib/api-utils";

interface ApiCreateFormContainerProps {
  tasks: TaskOption[];
  onCreated: (input: { apiKey: string; endpointName: string }) => void;
}

/** Creates a new endpoint and reports its one-time key. */
export function ApiCreateFormContainer({
  tasks,
  onCreated,
}: ApiCreateFormContainerProps) {
  const [create, { loading, error }] = useMutation(CREATE_API_ENDPOINT, {
    refetchQueries: [API_ENDPOINTS],
  });

  const submit = async (values: ApiCreateValues): Promise<boolean> => {
    const result = await create({ variables: values });
    const payload = result.data?.createApiEndpoint;
    const endpoint = payload?.endpoint;
    if (!payload || !endpoint) return false;

    onCreated({
      apiKey: payload.apiKey ?? "",
      endpointName: endpoint.name ?? "API endpoint",
    });
    return true;
  };

  return (
    <ApiCreateForm
      tasks={tasks}
      busy={loading}
      error={error}
      onSubmit={submit}
    />
  );
}
