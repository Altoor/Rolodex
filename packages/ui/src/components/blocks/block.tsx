import { blocks } from "./registry";
import { RawBlock } from "./raw-block";

interface BlockProps {
  output: unknown;
  toolKey?: string | null;
  className?: string;
  showRaw?: boolean;
}

export function Block({
  output,
  toolKey,
  className,
  showRaw = true,
}: BlockProps) {
  const definition = blocks.find((candidate) =>
    candidate.match({ output, toolKey }),
  );
  // Remount block components when the underlying snapshot changes so their
  // local interactive state is re-seeded.
  const contentKey = `${toolKey ?? ""}:${JSON.stringify(output)}`;

  return (
    <div className={className}>
      {definition ? (
        <definition.Component
          key={contentKey}
          output={output}
          toolKey={toolKey}
        />
      ) : (
        <RawBlock output={output} />
      )}

      {definition && showRaw ? <RawBlock output={output} collapsed /> : null}
    </div>
  );
}
