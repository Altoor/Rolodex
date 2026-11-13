import { FieldDescription } from "#components/ui/field";
import {
  promptFieldNamesFromText,
  type ToolStatePathSuggestion,
} from "#lib/toolStatePaths";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  ToolDetails,
  type ToolDetailsData,
} from "#components/tools/toolDetails";
import type { TaskFormValues } from "../../task-form";
import BranchTaskFields from "./branchTaskFields";
import DisplayBlockFields from "./displayBlockFields";
import SwitchTaskFields from "./switchTaskFields";
import ToolConfigField from "./toolConfigField";
import ToolOutputTypeField from "./toolOutputTypeField";
import ToolSelectField from "./toolSelectField";
import type { TaskOption } from "../taskCard.types";

const FILE_PATH_AWARE_TOOLS = [
  "find_file",
  "find_files",
  "find_folder",
  "find_folders",
  "scan_files",
  "update_file_metadata",
  "detect_file_type",
  "read_plaintext_file",
  "read_text_file",
  "read_image_file",
  "read_audio_file",
  "read_video_file",
  "read_other_file",
  "create_folder",
  "create_file",
  "delete_file_entry",
] as const;

const FILE_TOOL_HINT =
  "Use these in `id`, `path`, or `parentPath` where that field is available.";

const PATH_AWARE_TOOLS = new Set<string>([
  "if",
  "switch",
  "filter_tool_state",
  "display_block",
  "prompt",
  ...FILE_PATH_AWARE_TOOLS,
]);

const FILE_CONTEXT_TOOLS = new Set<string>([
  "if",
  "switch",
  "filter_tool_state",
  "display_block",
  "prompt",
  ...FILE_PATH_AWARE_TOOLS,
]);

const PATH_TOOL_HINTS: Record<string, string> = {
  if: "Use these in `path` or in any `where` path.",
  switch:
    "Use these in `path` or in any case condition path. Cases run in order; the first match wins.",
  filter_tool_state: "Use these in `path` or in any `where` path.",
  display_block:
    'Use these in `path` or `where`. Set `"select": "first"` to display a single value.',
  prompt:
    "Reference earlier outputs with `{{path}}` in `prompt` or `system`, for example `{{content}}` or `{{file.name}}`. Set `useToolState: true` to append the whole toolState. Add `fields` to publish named outputs downstream.",
  ...Object.fromEntries(
    FILE_PATH_AWARE_TOOLS.map((key) => [key, FILE_TOOL_HINT]),
  ),
  scan_files:
    "Use `path` to limit the scan. Foreach processes files only by default; add `includeUnchanged: false` for changes only, or filter with `kind`/`fileType` (for example `plaintext`).",
};

function PromptFieldsHint() {
  const { control } = useFormContext<TaskFormValues>();
  const configText = useWatch({ control, name: "toolConfigText" });
  const fieldNames = useMemo(
    () => promptFieldNamesFromText(configText ?? ""),
    [configText],
  );

  return (
    <FieldDescription>
      Prompt uses the generation model. Leave it empty to use your default.{" "}
      {fieldNames.length > 0 ? (
        <>
          <code className="font-mono">fields</code> publishes these downstream
          tool-state paths:{" "}
          {fieldNames.map((name, index) => (
            <span key={name}>
              {index > 0 ? ", " : null}
              <code className="font-mono">{name}</code>
            </span>
          ))}
          .
        </>
      ) : (
        <>
          Add a <code className="font-mono">fields</code> object to publish
          named values such as <code className="font-mono">name</code> or{" "}
          <code className="font-mono">description</code> for later tasks.
        </>
      )}
    </FieldDescription>
  );
}

function TodoFieldsHint({
  suggestions,
  mode,
}: {
  suggestions: ToolStatePathSuggestion[];
  mode: "create" | "update";
}) {
  const expected = [
    "name",
    "description",
    "doByDate",
    "date",
    "dueDate",
    "done",
  ];
  const available = expected.filter((path) =>
    suggestions.some((suggestion) => suggestion.path === path),
  );

  return (
    <FieldDescription>
      {mode === "create" ? (
        <>
          Reads <code className="font-mono">name</code>,{" "}
          <code className="font-mono">description</code>,{" "}
          <code className="font-mono">doByDate</code> (or{" "}
          <code className="font-mono">date</code>), and{" "}
          <code className="font-mono">done</code> from earlier toolState. A
          prompt task with matching fields can feed this automatically—leave
          this config empty unless you want to supply defaults such as{" "}
          <code className="font-mono">done</code>.
        </>
      ) : (
        <>
          Updates only the fields you provide. Put a selector such as{" "}
          <code className="font-mono">id</code> in this config, or place a{" "}
          <code className="font-mono">find_todo</code> task before this one. A
          prompt task with <code className="font-mono">description</code>,{" "}
          <code className="font-mono">doByDate</code>, or{" "}
          <code className="font-mono">done</code> fields feeds the update
          automatically; a <code className="font-mono">name</code> field will
          rename the todo.
        </>
      )}
      {available.length > 0 ? (
        <>
          {" "}
          Available now:{" "}
          {available.map((path, index) => (
            <span key={path}>
              {index > 0 ? ", " : null}
              <code className="font-mono">{path}</code>
            </span>
          ))}
          .
        </>
      ) : null}
    </FieldDescription>
  );
}

interface ToolTaskFieldsProps {
  tools: ToolDetailsData[];
  tasks: TaskOption[];
  toolKey: string | null;
  selectedTool: ToolDetailsData | undefined;
  supportedOutputTypes: string[];
  pathSuggestions: ToolStatePathSuggestion[];
}

const ToolTaskFields = ({
  tools,
  tasks,
  toolKey,
  selectedTool,
  supportedOutputTypes,
  pathSuggestions,
}: ToolTaskFieldsProps) => (
  <div className="flex flex-col gap-4 rounded-lg border p-4">
    <ToolSelectField tools={tools} />
    <ToolConfigField
      pathAware={toolKey != null && PATH_AWARE_TOOLS.has(toolKey)}
      suggestions={pathSuggestions}
      description={toolKey ? PATH_TOOL_HINTS[toolKey] : undefined}
    />
    <ToolOutputTypeField supportedOutputTypes={supportedOutputTypes} />

    {toolKey === "display_block" ? <DisplayBlockFields /> : null}

    {toolKey === "if" ? <BranchTaskFields tasks={tasks} /> : null}

    {toolKey === "switch" ? <SwitchTaskFields tasks={tasks} /> : null}

    {toolKey === "prompt" ? <PromptFieldsHint /> : null}

    {toolKey === "create_todo" ? (
      <TodoFieldsHint suggestions={pathSuggestions} mode="create" />
    ) : null}

    {toolKey === "update_todo" ? (
      <TodoFieldsHint suggestions={pathSuggestions} mode="update" />
    ) : null}

    {toolKey != null && FILE_CONTEXT_TOOLS.has(toolKey) ? (
      <FieldDescription>
        Dropping files on the files page seeds{" "}
        <code className="font-mono">files</code> and{" "}
        <code className="font-mono">folders</code> in toolState before the first
        task. Path-aware configs can reference values such as{" "}
        <code className="font-mono">files.0.name</code>; file tools also read
        them automatically when no explicit id or path is set.
      </FieldDescription>
    ) : null}

    {selectedTool ? (
      <div className="rounded-lg bg-muted/40 p-4">
        <ToolDetails tool={selectedTool} />
      </div>
    ) : null}
  </div>
);

export default ToolTaskFields;
