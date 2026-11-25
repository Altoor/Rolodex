"use client";

import { CopyRow } from "../atoms/copy-row";
import { invokeUrl, statusUrl, websocketUrl } from "../lib/api-utils";

/** The three URLs a client uses for one endpoint. */
export function EndpointUrls({ slug }: { slug: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <CopyRow label="Invoke" value={invokeUrl(slug)} />
      <CopyRow label="Status" value={statusUrl(slug)} />
      <CopyRow label="WebSocket" value={websocketUrl(slug)} />
    </div>
  );
}
