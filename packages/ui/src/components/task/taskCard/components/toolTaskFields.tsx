import { FieldDescription } from "#components/ui/field";
import type { ToolStatePathSuggestion } from "#lib/toolStatePaths";
import {
  ToolDetails,
  type ToolDetailsData,
} from "#components/tools/toolDetails";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";
import type { TaskOption } from "../taskCard.types";
import BranchTaskFields from "./branchTaskFields";
import BranchTaskSelect from "./branchTaskSelect";
import { PromptFieldsHint } from "./promptFieldsHint";
import SwitchTaskFields from "./switchTaskFields";
import { TodoFieldsHint } from "./todoFieldsHint";
import {
  FILE_CONTEXT_TOOLS,
  PATH_AWARE_TOOLS,
  PATH_TOOL_HINTS,
} from "./toolTaskHints";
import ToolConfigField from "./toolConfigField";
import ToolOutputTypeField from "./toolOutputTypeField";
import ToolSelectField from "./toolSelectField";

/** Schema properties that a dedicated editor or non-Ollama value owns. */
const EXCLUDED_CONFIG_PROPERTIES: Record<string, readonly string[]> = {
  switch: ["path", "quantifier"],
  // The audio model is a Whisper model, not one of the Ollama models.
  read_audio_file: ["model"],
};

interface ToolTaskFieldsProps {
  tools: ToolDetailsData[];
  tasks: TaskOption[];
  models: string[];
  toolKey: string | null;
  selectedTool: ToolDetailsData | undefined;
  supportedOutputTypes: string[];
  pathSuggestions: ToolStatePathSuggestion[];
}

const ToolTaskFields = ({
  tools,
  tasks,
  models,
  toolKey,
  selectedTool,
  supportedOutputTypes,
  pathSuggestions,
}: ToolTaskFieldsProps) => {
  const { control } = useFormContext<TaskFormValues>();
  const toolOutputType = useWatch({ control, name: "toolOutputType" });

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <ToolSelectField tools={tools} />
      <ToolConfigField
        pathAware={toolKey != null && PATH_AWARE_TOOLS.has(toolKey)}
        suggestions={pathSuggestions}
        description={toolKey ? PATH_TOOL_HINTS[toolKey] : undefined}
        models={models}
        inputSchema={selectedTool?.inputSchema}
        excludedProperties={
          toolKey ? EXCLUDED_CONFIG_PROPERTIES[toolKey] : undefined
        }
      />
      <ToolOutputTypeField supportedOutputTypes={supportedOutputTypes} />

      {toolOutputType === "foreach" &&
      supportedOutputTypes.includes("foreach") ? (
        <div className="flex flex-col gap-2">
          <BranchTaskSelect
            name="joinTaskId"
            label="After all items"
            tasks={tasks}
            noneLabel="No join — branches end independently"
          />
          <FieldDescription>
            This task runs once, after every per-item branch has finished. Use a
            task with the <code className="font-mono">join</code> tool to
            collect the branch results before continuing. Choose no join to
            leave the branches independent.
          </FieldDescription>
        </div>
      ) : null}

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
          <code className="font-mono">folders</code> in toolState before the
          first task. Path-aware configs can reference values such as{" "}
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
};

export default ToolTaskFields;
