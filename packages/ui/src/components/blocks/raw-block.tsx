import { cn } from "cn";

interface RawBlockProps {
  output: unknown;
  collapsed?: boolean;
  className?: string;
}

function RawOutput({ output, className }: RawBlockProps) {
  return (
    <pre
      className={cn(
        "max-h-56 overflow-auto rounded-md bg-muted p-2 text-xs",
        className,
      )}
    >
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

export function RawBlock({
  output,
  collapsed = false,
  className,
}: RawBlockProps) {
  if (!collapsed) {
    return <RawOutput output={output} className={className} />;
  }

  return (
    <details className={cn("mt-1 text-xs text-muted-foreground", className)}>
      <summary className="cursor-pointer select-none">Raw output</summary>
      <RawOutput output={output} className="mt-1" />
    </details>
  );
}
