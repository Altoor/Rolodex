"use client";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#components/ui/card";
import { ErrorState } from "#components/feedback/error-state";
import { Spinner } from "#components/ui/spinner";
import { ApiRequestListContainer } from "../containers/api-request-list-container";
import { EndpointCurlExample } from "../molecules/endpoint-curl-example";
import { EndpointUrls } from "../molecules/endpoint-urls";
import {
  ApiEndpointForm,
  type EndpointFormValues,
} from "../molecules/api-endpoint-form";
import type { ApiEndpoint, TaskOption } from "../lib/api-utils";

interface ApiEndpointCardProps {
  endpoint: ApiEndpoint;
  tasks: TaskOption[];
  editing: boolean;
  busy: boolean;
  saving: boolean;
  rotating: boolean;
  error: unknown;
  confirmDelete: boolean;
  onToggleEditing: () => void;
  onSave: (values: EndpointFormValues) => void;
  onToggleEnabled: () => void;
  onRotateKey: () => void;
  onDelete: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
}

/** One API link: URLs, examples, request history, and controls. */
export function ApiEndpointCard({
  endpoint,
  tasks,
  editing,
  busy,
  saving,
  rotating,
  error,
  confirmDelete,
  onToggleEditing,
  onSave,
  onToggleEnabled,
  onRotateKey,
  onDelete,
  onRequestDelete,
  onCancelDelete,
}: ApiEndpointCardProps) {
  const enabled = endpoint.enabled ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{endpoint.name}</CardTitle>
          <Badge variant={enabled ? "default" : "outline"}>
            {enabled ? "Enabled" : "Disabled"}
          </Badge>
          {endpoint.task?.name ? (
            <Badge variant="secondary">{endpoint.task.name}</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Key {endpoint.keyPrefix}…{endpoint.keyLastFour}
          {endpoint.description ? ` · ${endpoint.description}` : ""}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <EndpointUrls slug={endpoint.slug} />
        <EndpointCurlExample slug={endpoint.slug} />

        <ApiRequestListContainer endpointId={endpoint.id ?? ""} />

        {editing ? (
          <ApiEndpointForm
            endpoint={endpoint}
            tasks={tasks}
            busy={saving}
            onSave={onSave}
            onCancel={onToggleEditing}
          />
        ) : null}

        {error ? (
          <ErrorState title="Endpoint action failed" error={error} />
        ) : null}

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onToggleEditing}
          >
            {editing ? "Close editor" : "Edit"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !endpoint.id}
            onClick={onToggleEnabled}
          >
            {enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !endpoint.id}
            onClick={onRotateKey}
          >
            {rotating ? <Spinner /> : null}
            Rotate key
          </Button>
          {confirmDelete ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={onDelete}
              >
                Confirm delete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onCancelDelete}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRequestDelete}
            >
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
