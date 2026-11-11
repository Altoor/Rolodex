import BranchTaskSelect from "./branchTaskSelect";
import type { TaskOption } from "../taskCard.types";

interface BranchTaskFieldsProps {
  tasks: TaskOption[];
}

const BranchTaskFields = ({ tasks }: BranchTaskFieldsProps) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <BranchTaskSelect
      name="onTrueTaskId"
      label="True branch task"
      tasks={tasks}
    />
    <BranchTaskSelect
      name="onFalseTaskId"
      label="False branch task"
      tasks={tasks}
    />
  </div>
);

export default BranchTaskFields;
