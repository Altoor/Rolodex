import { Badge } from "#components/ui/badge";

export interface ToolInputProperty {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolInputSchema {
  properties?: Record<string, ToolInputProperty>;
  required?: string[];
}

export interface ToolDetailsData {
  key?: string | null;
  name?: string | null;
  description?: string | null;
  inputMode?: string | null;
  outputDescription?: string | null;
  outputTypes?: Array<string | null> | null;
  foreachOutputDescription?: string | null;
  inputSchema?: unknown;
  exampleConfig?: unknown;
}

interface ToolDetailsProps {
  tool: ToolDetailsData;
  showDescription?: boolean;
}

/**
 * Shared tool metadata used by the tools page and the task builder. The test
 * form and the tool selector stay in their owning components.
 */
export function ToolDetails({
  tool,
  showDescription = true,
}: ToolDetailsProps) {
  const schema = (tool.inputSchema ?? {}) as ToolInputSchema;
  const properties = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);

  return (
    <div className="flex flex-col gap-4">
      {showDescription && tool.description ? (
        <p className="text-sm text-muted-foreground">{tool.description}</p>
      ) : null}

      <div className="flex flex-col gap-1 text-sm">
        {tool.inputMode ? (
          <p>
            <span className="font-medium">Input mode:</span> {tool.inputMode}
          </p>
        ) : null}
        {tool.outputDescription ? (
          <p>
            <span className="font-medium">Output:</span>{" "}
            {tool.outputDescription}
          </p>
        ) : null}
        {tool.outputTypes && tool.outputTypes.length > 0 ? (
          <p>
            <span className="font-medium">Output types:</span>{" "}
            {tool.outputTypes.filter(Boolean).join(", ")}
          </p>
        ) : null}
        {tool.foreachOutputDescription ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Foreach:</span>{" "}
            {tool.foreachOutputDescription}
          </p>
        ) : null}
      </div>

      {properties.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Input schema</p>
          <ul className="flex flex-col gap-2 text-sm">
            {properties.map(([name, property]) => (
              <li key={name} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium">{name}</span>
                  <Badge variant="outline">{property.type ?? "unknown"}</Badge>
                  {required.has(name) ? (
                    <Badge variant="destructive">required</Badge>
                  ) : null}
                </div>
                {property.description ? (
                  <p className="mt-1 text-muted-foreground">
                    {property.description}
                  </p>
                ) : null}
                {property.enum ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    enum: {property.enum.join(", ")}
                  </p>
                ) : null}
                {property.default !== undefined ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    default: {JSON.stringify(property.default)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Example config</p>
        <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
          {tool.exampleConfig
            ? JSON.stringify(tool.exampleConfig, null, 2)
            : "No example config"}
        </pre>
      </div>
    </div>
  );
}
