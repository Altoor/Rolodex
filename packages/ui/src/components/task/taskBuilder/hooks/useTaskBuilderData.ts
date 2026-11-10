import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { MODELS } from "@repo/queries/model/model-queries";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { TOOLS } from "@repo/queries/tools/tool-queries";
import {
  toBranchTaskOptions,
  toModelNames,
} from "../task-builder-service";

/** Loads the tools, branch tasks and pulled models the builder needs. */
export function useTaskBuilderData() {
  const { data: toolsData } = useQuery(TOOLS);
  const { data: modelsData } = useQuery(MODELS);
  const { data: tasksData } = useQuery(TASKS);

  const tools = toolsData?.tools ?? [];
  const branchTasks = useMemo(
    () => toBranchTaskOptions(tasksData?.tasks),
    [tasksData],
  );
  const models = useMemo(
    () => toModelNames(modelsData?.models),
    [modelsData],
  );

  return { tools, branchTasks, models };
}
