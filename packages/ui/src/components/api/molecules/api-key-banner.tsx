"use client";

import { useState } from "react";
import { Button } from "#components/ui/button";
import { Badge } from "#components/ui/badge";
import { copyText } from "../lib/api-utils";

interface ApiKeyBannerProps {
  endpointName: string;
  apiKey: string;
  onDismiss: () => void;
}

/** One-time reveal after creating or rotating an endpoint key. */
export function ApiKeyBanner({
  endpointName,
  apiKey,
  onDismiss,
}: ApiKeyBannerProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">New key</Badge>
        <span className="font-medium">{endpointName}</span>
        <span className="text-muted-foreground">
          Copy this now — it is not shown again.
        </span>
      </div>
      <code className="overflow-x-auto rounded-md bg-background/70 px-2 py-1 font-mono text-xs">
        {apiKey}
      </code>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void copyText(apiKey).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy key"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
