"use client";

import { useMutation } from "@apollo/client/react";
import { useState } from "react";
import {
  API_ENDPOINTS,
  DELETE_API_ENDPOINT,
  ROTATE_API_ENDPOINT_KEY,
  UPDATE_API_ENDPOINT,
} from "@repo/queries/api/api-queries";
import { ApiEndpointCard } from "../organisms/api-endpoint-card";
import type { EndpointFormValues } from "../molecules/api-endpoint-form";
import type { ApiEndpoint, TaskOption } from "../lib/api-utils";

interface ApiEndpointCardContainerProps {
  endpoint: ApiEndpoint;
  tasks: TaskOption[];
  onKey: (input: { apiKey: string; endpointName: string }) => void;
}

/** Owns mutations and local UI state for one endpoint card. */
export function ApiEndpointCardContainer({
  endpoint,
  tasks,
  onKey,
}: ApiEndpointCardContainerProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [update, updateState] = useMutation(UPDATE_API_ENDPOINT, {
    refetchQueries: [API_ENDPOINTS],
  });
  const [rotate, rotateState] = useMutation(ROTATE_API_ENDPOINT_KEY, {
    refetchQueries: [API_ENDPOINTS],
  });
  const [remove, removeState] = useMutation(DELETE_API_ENDPOINT, {
    refetchQueries: [API_ENDPOINTS],
  });

  const busy =
    updateState.loading || rotateState.loading || removeState.loading;
  const error = updateState.error ?? rotateState.error ?? removeState.error;

  const save = async (values: EndpointFormValues) => {
    if (!endpoint.id) return;
    await update({ variables: { id: endpoint.id, ...values } });
    setEditing(false);
  };

  const rotateKey = async () => {
    if (!endpoint.id) return;
    const result = await rotate({ variables: { id: endpoint.id } });
    const payload = result.data?.rotateApiEndpointKey;
    if (!payload) return;

    onKey({
      apiKey: payload.apiKey ?? "",
      endpointName: payload.endpoint?.name ?? endpoint.name ?? "API endpoint",
    });
  };

  const deleteEndpoint = async () => {
    if (!endpoint.id) return;
    await remove({ variables: { id: endpoint.id } });
  };

  return (
    <ApiEndpointCard
      endpoint={endpoint}
      tasks={tasks}
      editing={editing}
      busy={busy}
      saving={updateState.loading}
      rotating={rotateState.loading}
      error={error}
      confirmDelete={confirmDelete}
      onToggleEditing={() => setEditing((current) => !current)}
      onSave={(values) => void save(values)}
      onToggleEnabled={() => {
        if (!endpoint.id) return;
        void update({
          variables: { id: endpoint.id, enabled: !(endpoint.enabled ?? false) },
        });
      }}
      onRotateKey={() => void rotateKey()}
      onDelete={() => void deleteEndpoint()}
      onRequestDelete={() => setConfirmDelete(true)}
      onCancelDelete={() => setConfirmDelete(false)}
    />
  );
}
