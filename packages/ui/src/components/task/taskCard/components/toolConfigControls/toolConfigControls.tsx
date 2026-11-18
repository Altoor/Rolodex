"use client";

import { FieldDescription } from "#components/ui/field";
import {
  booleanConfigValue,
  hasConfigKey,
  numberConfigValue,
  stringConfigValue,
  type ToolConfigControl,
} from "#lib/toolConfigControls";
import type { ToolStatePathSuggestion } from "#lib/toolStatePaths";
import { ToolConfigBooleanControl } from "./toolConfigBooleanControl";
import { ToolConfigEnumControl } from "./toolConfigEnumControl";
import { ToolConfigModelControl } from "./toolConfigModelControl";
import { ToolConfigNumberControl } from "./toolConfigNumberControl";
import { ToolConfigPathControl } from "./toolConfigPathControl";

interface ToolConfigControlsProps {
  controls: ToolConfigControl[];
  config: Record<string, unknown>;
  models: string[];
  suggestions: ToolStatePathSuggestion[];
  onChange: (key: string, value: unknown) => void;
  onClear: (key: string) => void;
}

/**
 * Renders schema-driven settings above the JSON editor. Every change writes
 * back into the same `toolConfigText` value the editor edits.
 */
export function ToolConfigControls({
  controls,
  config,
  models,
  suggestions,
  onChange,
  onClear,
}: ToolConfigControlsProps) {
  if (controls.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
      <FieldDescription className="text-xs">
        Changes here update the JSON below. Unset keys use the tool default.
      </FieldDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        {controls.map(({ key, property, kind }) => {
          const description = property.description;

          switch (kind) {
            case "boolean":
              return (
                <ToolConfigBooleanControl
                  key={key}
                  name={key}
                  checked={booleanConfigValue(config, key, property)}
                  isSet={hasConfigKey(config, key)}
                  description={description}
                  onChange={(checked) => onChange(key, checked)}
                  onClear={() => onClear(key)}
                />
              );
            case "enum":
              return (
                <ToolConfigEnumControl
                  key={key}
                  name={key}
                  value={stringConfigValue(config, key)}
                  values={property.enum ?? []}
                  defaultValue={
                    typeof property.default === "string"
                      ? property.default
                      : undefined
                  }
                  description={description}
                  onChange={(value) => onChange(key, value)}
                  onClear={() => onClear(key)}
                />
              );
            case "number":
              return (
                <ToolConfigNumberControl
                  key={key}
                  name={key}
                  value={numberConfigValue(config, key)}
                  description={description}
                  onChange={(value) => onChange(key, value)}
                  onClear={() => onClear(key)}
                />
              );
            case "path":
              return (
                <ToolConfigPathControl
                  key={key}
                  name={key}
                  value={stringConfigValue(config, key)}
                  suggestions={suggestions}
                  description={description}
                  onChange={(value) => onChange(key, value)}
                  onClear={() => onClear(key)}
                />
              );
            case "model":
              return (
                <ToolConfigModelControl
                  key={key}
                  name={key}
                  value={stringConfigValue(config, key)}
                  models={models}
                  description={description}
                  onChange={(value) => onChange(key, value)}
                  onClear={() => onClear(key)}
                />
              );
          }
        })}
      </div>
    </div>
  );
}
