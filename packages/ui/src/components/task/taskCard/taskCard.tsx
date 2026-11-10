"use client";

import { Card, CardContent } from "#components/ui/card";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../task-form";
import type { TaskCardProps } from "./taskCard.types";
import TaskCardHeader from "./components/taskCardHeader";
import TaskModelFields from "./components/taskModelFields";
import TaskResultsSection from "./components/taskResultsSection";
import ToolTaskFields from "./components/toolTaskFields";

const TaskCard = ({
  resultFields,
  tools,
  tasks,
  models,
  save,
  saving = false,
  canEditResults,
  onAddResult,
  onSaveResult,
  onDeleteResult,
}: TaskCardProps) => {
  const { control } = useFormContext<TaskFormValues>();
  const type = useWatch({ control, name: "type" });
  const decision = useWatch({ control, name: "decision" });
  const toolKey = useWatch({ control, name: "toolKey" });

  const selectedTool = tools.find((tool) => tool.key === toolKey);
  const supportedOutputTypes = (selectedTool?.outputTypes ?? ["normal"]).filter(
    (outputType): outputType is string => Boolean(outputType),
  );

  return (
    <Card className="w-full">
      <TaskCardHeader save={save} saving={saving} />

      <CardContent className="flex flex-col gap-5">
        <TaskModelFields models={models} />

        {type === "tool" ? (
          <ToolTaskFields
            tools={tools}
            tasks={tasks}
            toolKey={toolKey ?? null}
            selectedTool={selectedTool}
            supportedOutputTypes={supportedOutputTypes}
          />
        ) : null}

        {type === "decision" ? (
          <TaskResultsSection
            resultFields={resultFields}
            options={decision?.options ?? []}
            canEditResults={canEditResults}
            onAddResult={onAddResult}
            onSaveResult={onSaveResult}
            onDeleteResult={onDeleteResult}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};

export default TaskCard;
