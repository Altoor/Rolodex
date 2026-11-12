import type { FieldArrayWithId } from "react-hook-form";
import type { ToolDetailsData } from "#components/tools/toolDetails";
import type { ToolStatePathSuggestion } from "#lib/toolStatePaths";
import type { TaskType } from "@repo/queries/__generated__/graphql";
import type { TaskFormValues } from "../task-form";

export interface TaskOption {
  id: number;
  name: string;
}

export const TASK_TYPES: { label: string; value: TaskType }[] = [
  { label: "Decision", value: "decision" },
  { label: "User decision", value: "userDecision" },
  { label: "TextPrompt", value: "textPrompt" },
  { label: "Tool", value: "tool" },
];

export interface TaskCardProps {
  resultFields: FieldArrayWithId<TaskFormValues, "taskResults", "id">[];
  tools: ToolDetailsData[];
  tasks: TaskOption[];
  models: string[];
  save: () => void;
  saving?: boolean;
  canEditResults: boolean;
  onAddResult: () => void;
  onSaveResult: (index: number) => void;
  onDeleteResult: (index: number) => void;
  pathSuggestions: ToolStatePathSuggestion[];
}
