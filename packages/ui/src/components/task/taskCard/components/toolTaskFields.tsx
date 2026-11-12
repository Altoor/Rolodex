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
  "filter_tool_state",
  "display_block",
  ...FILE_PATH_AWARE_TOOLS,
]);

const PATH_TOOL_HINTS: Record<string, string> = {
  if: "Use these in `path` or in any `where` path.",
  filter_tool_state: "Use these in `path` or in any `where` path.",
  display_block:
    'Use these in `path` or `where`. Set `"select": "first"` to display a single value.',
  ...Object.fromEntries(
    FILE_PATH_AWARE_TOOLS.map((key) => [key, FILE_TOOL_HINT]),
  ),
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
