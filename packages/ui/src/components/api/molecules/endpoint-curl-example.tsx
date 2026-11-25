"use client";

import { invokeUrl } from "../lib/api-utils";

/** Ready-to-copy curl examples for JSON and multipart requests. */
export function EndpointCurlExample({ slug }: { slug: string | null }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
      {`# JSON body
curl -X POST '${invokeUrl(slug)}' \\
  -H 'Authorization: Bearer <api-key>' \\
  -H 'Content-Type: application/json' \\
  -d '{"state":"Hello from the API"}'

# Attach one or more files
curl -X POST '${invokeUrl(slug)}' \\
  -H 'Authorization: Bearer <api-key>' \\
  -F 'state=Hello from the API' \\
  -F 'files=@./document.pdf' \\
  -F 'files=@./photo.jpg'`}
    </pre>
  );
}
