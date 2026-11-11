import { blocks, blocksById } from "./registry";
import { RawBlock } from "./raw-block";

interface BlockProps {
  output: unknown;
  toolKey?: string | null;
  blockId?: string | null;
  className?: string;
  showRaw?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDisplayOutput(
  value: unknown,
): value is { block?: string | null; items: unknown[] } {
  return isRecord(value) && Array.isArray(value.items);
}

function isPrimitive(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function DisplayOutput({
  output,
  showRaw,
}: {
  output: { block?: string | null; items: unknown[] };
  showRaw: boolean;
}) {
  if (output.items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing to display.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {output.items.map((item, index) =>
        isPrimitive(item) ? (
          <p key={`${index}:${String(item)}`} className="text-sm">
            {item === null ? "null" : String(item)}
          </p>
        ) : (
          <Block
            key={`${index}:${JSON.stringify(item)}`}
            output={item}
            blockId={output.block ?? null}
            showRaw={showRaw}
          />
        ),
      )}
    </div>
  );
}

export function Block({
  output,
  toolKey,
  blockId,
  className,
  showRaw = true,
}: BlockProps) {
  if (toolKey === "display_block" && isDisplayOutput(output)) {
    return (
      <div className={className}>
        <DisplayOutput output={output} showRaw={false} />
        {showRaw ? <RawBlock output={output} collapsed /> : null}
      </div>
    );
  }

  const definition = blockId
    ? blocksById.get(blockId)
    : blocks.find((candidate) => candidate.match({ output, toolKey }));

  // Remount block components when the underlying snapshot changes so their
  // local interactive state is re-seeded.
  const contentKey = `${toolKey ?? ""}:${blockId ?? ""}:${JSON.stringify(
    output,
  )}`;

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
