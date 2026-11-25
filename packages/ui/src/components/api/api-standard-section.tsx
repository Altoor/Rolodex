"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  ROTATE_STANDARD_API_KEY,
  STANDARD_API_KEY,
} from "@repo/queries/api/api-queries";
import { ErrorState } from "#components/feedback/error-state";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "#components/ui/accordion";
import { Button } from "#components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#components/ui/card";
import { Spinner } from "#components/ui/spinner";
import { formatApiDate, standardApiUrl } from "./api-utils";

const listExample = `curl '${standardApiUrl("/todos")}?done=false&limit=25' \\
  -H 'Authorization: Bearer <api-key>'`;

const updateExample = `curl -X PATCH '${standardApiUrl("/todos/42")}' \\
  -H 'Authorization: Bearer <api-key>' \\
  -H 'Content-Type: application/json' \\
  -d '{"done":true}'`;

const listResponse = `{
  "items": [
    {
      "id": 42,
      "name": "File invoices",
      "description": "Before the accountant calls",
      "done": false,
      "doByDate": "2026-11-30T09:00:00.000Z",
      "createdAt": "2026-11-24T11:41:00.000Z",
      "archivedAt": null,
      "authorId": 1,
      "actorId": 1
    }
  ],
  "pagination": {
    "limit": 25,
    "offset": 0,
    "total": 1,
    "hasMore": false,
    "nextOffset": null
  }
}`;

const updateResponse = `{
  "todo": {
    "id": 42,
    "name": "File invoices",
    "description": "Before the accountant calls",
    "done": true,
    "doByDate": "2026-11-30T09:00:00.000Z",
    "createdAt": "2026-11-24T11:41:00.000Z",
    "archivedAt": null,
    "authorId": 1,
    "actorId": 1
  }
}`;

interface ApiStandardSectionProps {
  onKey: (input: { apiKey: string; endpointName: string }) => void;
}

export function ApiStandardSection({ onKey }: ApiStandardSectionProps) {
  const keyQuery = useQuery(STANDARD_API_KEY, {
    fetchPolicy: "cache-and-network",
  });
  const [rotate, rotateState] = useMutation(ROTATE_STANDARD_API_KEY, {
    refetchQueries: [STANDARD_API_KEY],
  });

  const standardKey = keyQuery.data?.standardApiKey;
  const busy = rotateState.loading;

  const rotateKey = async () => {
    const result = await rotate();
    const payload = result.data?.rotateStandardApiKey;
    if (payload?.apiKey) {
      onKey({ apiKey: payload.apiKey, endpointName: "Standard API key" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Standard API</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium text-foreground">Standard key</span>
            {keyQuery.loading && !keyQuery.data ? (
              <span className="text-muted-foreground">Loading key…</span>
            ) : standardKey ? (
              <span className="text-muted-foreground">
                <code className="font-mono text-foreground">
                  {standardKey.keyPrefix}…{standardKey.keyLastFour}
                </code>{" "}
                rotated {formatApiDate(standardKey.updatedAt)}
              </span>
            ) : (
              <span className="text-muted-foreground">
                No dedicated key yet. Endpoint keys also work.
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void rotateKey()}
          >
            {busy ? <Spinner /> : null}
            {standardKey ? "Rotate key" : "Create key"}
          </Button>
        </div>

        {keyQuery.error || rotateState.error ? (
          <ErrorState
            title="Standard key action failed"
            error={keyQuery.error ?? rotateState.error}
            onRetry={() => void keyQuery.refetch()}
          />
        ) : null}

        <p className="text-xs text-muted-foreground">
          These routes act on your own data. Use the standard key above or any
          enabled endpoint key from the links; the key&apos;s owner scopes every
          response. Send it as{" "}
          <code className="font-mono">Authorization: Bearer …</code> or{" "}
          <code className="font-mono">X-API-Key</code>.
        </p>

        <Accordion>
          <AccordionItem value="todos">
            <AccordionTrigger>Todos</AccordionTrigger>
            <AccordionPanel className="flex flex-col gap-3 pb-3 text-xs text-muted-foreground">
              <div className="flex flex-col gap-1">
                <p className="font-medium text-foreground">List todos</p>
                <p>
                  <code className="font-mono">GET /api/v1/todos</code> returns
                  todos sorted by due date (undated last), then id.
                </p>
                <ul className="list-disc pl-4">
                  <li>
                    <code className="font-mono">done=all|true|false</code>{" "}
                    (default <code className="font-mono">all</code>, or use{" "}
                    <code className="font-mono">notDone</code> for open todos)
                  </li>
                  <li>
                    <code className="font-mono">limit</code> 1–200, default 50
                  </li>
                  <li>
                    <code className="font-mono">offset</code>, default 0
                  </li>
                  <li>
                    <code className="font-mono">includeArchived=true</code> to
                    include archived todos
                  </li>
                </ul>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                  {listExample}
                </pre>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                  {listResponse}
                </pre>
              </div>

              <div className="flex flex-col gap-1">
                <p className="font-medium text-foreground">
                  Mark done or not done
                </p>
                <p>
                  <code className="font-mono">PATCH /api/v1/todos/:id</code>{" "}
                  updates only the <code className="font-mono">done</code> flag.
                  A todo you do not own returns{" "}
                  <code className="font-mono">404</code>.
                </p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                  {updateExample}
                </pre>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                  {updateResponse}
                </pre>
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
