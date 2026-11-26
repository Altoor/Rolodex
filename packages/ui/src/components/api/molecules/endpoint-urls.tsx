"use client";

import { CopyRow } from "../atoms/copy-row";
import { useApiOrigin } from "#lib/apiOriginContext";
import { invokeUrl, statusUrl, websocketUrl } from "../lib/api-utils";

/** The three URLs a client uses for one endpoint. */
export function EndpointUrls({ slug }: { slug: string | null }) {
  const apiOrigin = useApiOrigin();

  return (
    <div className="flex flex-col gap-1">
      <CopyRow label="Invoke" value={invokeUrl(apiOrigin, slug)} />
      <CopyRow label="Status" value={statusUrl(apiOrigin, slug)} />
      <CopyRow label="WebSocket" value={websocketUrl(apiOrigin, slug)} />
    </div>
  );
}
