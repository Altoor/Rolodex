"use client";

import { FieldDescription } from "#components/ui/field";
import {
  booleanConfigValue,
  enumConfigValue,
  type ToolConfigControl,
} from "#lib/toolConfigControls";
import { ToolConfigBooleanControl } from "./toolConfigBooleanControl";
import { ToolConfigEnumControl } from "./toolConfigEnumControl";

interface ToolConfigControlsProps {
  controls: ToolConfigControl[];
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

/**
 * Renders schema-driven settings above the JSON editor. Every change writes
 * back into the same `toolConfigText` value the editor edits.
 */
export function ToolConfigControls({
  controls,
  config,
  onChange,
}: ToolConfigControlsProps) {
  if (controls.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
      <FieldDescription className="text-xs">
        Changes here update the JSON below. Unset keys use the tool default.
      </FieldDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        {controls.map(({ key, property }) =>
          property.type === "boolean" ? (
            <ToolConfigBooleanControl
              key={key}
              name={key}
              checked={booleanConfigValue(config, key, property)}
              description={property.description}
              onChange={(checked) => onChange(key, checked)}
            />
          ) : (
            <ToolConfigEnumControl
              key={key}
              name={key}
              value={enumConfigValue(config, key, property)}
              values={property.enum ?? []}
              description={property.description}
              onChange={(value) => onChange(key, value)}
            />
          ),
        )}
      </div>
    </div>
  );
}
