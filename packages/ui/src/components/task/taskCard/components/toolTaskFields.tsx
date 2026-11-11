import { FieldDescription } from "#components/ui/field";
import {
  ToolDetails,
  type ToolDetailsData,
} from "#components/tools/toolDetails";
import BranchTaskFields from "./branchTaskFields";
import ToolConfigField from "./toolConfigField";
import ToolOutputTypeField from "./toolOutputTypeField";
import ToolSelectField from "./toolSelectField";
import type { TaskOption } from "../taskCard.types";

interface ToolTaskFieldsProps {
  tools: ToolDetailsData[];
  tasks: TaskOption[];
  toolKey: string | null;
  selectedTool: ToolDetailsData | undefined;
  supportedOutputTypes: string[];
}

const ToolTaskFields = ({
  tools,
  tasks,
  toolKey,
  selectedTool,
  supportedOutputTypes,
}: ToolTaskFieldsProps) => (
  <div className="flex flex-col gap-4 rounded-lg border p-4">
    <ToolSelectField tools={tools} />
    <ToolConfigField />
    <ToolOutputTypeField supportedOutputTypes={supportedOutputTypes} />

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
