import { FieldDescription } from "#components/ui/field";
import type { ToolStatePathSuggestion } from "#lib/toolStatePaths";
import {
  ToolDetails,
  type ToolDetailsData,
} from "#components/tools/toolDetails";
import BranchTaskFields from "./branchTaskFields";
import DisplayBlockFields from "./displayBlockFields";
import ToolConfigField from "./toolConfigField";
import ToolOutputTypeField from "./toolOutputTypeField";
import ToolSelectField from "./toolSelectField";
import type { TaskOption } from "../taskCard.types";

const PATH_AWARE_TOOLS = new Set(["if", "filter_tool_state", "display_block"]);

const PATH_TOOL_HINTS: Record<string, string> = {
  if: "Use these in `path` or in any `where` path.",
  filter_tool_state: "Use these in `path` or in any `where` path.",
  display_block:
    'Use these in `path` or `where`. Set `"select": "first"` to display a single value.',
};

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

    {toolKey === "prompt" ? (
      <FieldDescription>
        Prompt uses the generation model. Leave it empty to use your default.
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
