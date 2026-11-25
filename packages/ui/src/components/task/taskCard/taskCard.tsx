"use client";

import { Card, CardContent } from "#components/ui/card";
import { Checkbox } from "#components/ui/checkbox";
import { Field, FieldLabel } from "#components/ui/field";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../task-form";
import type { TaskCardProps } from "./taskCard.types";
import TaskCardHeader from "./components/taskCardHeader";
import TaskModelFields from "./components/taskModelFields";
import TaskResultsSection from "./components/taskResultsSection";
import ToolTaskFields from "./components/toolTaskFields";
import DecisionStateFields from "./components/decisionStateFields";

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
  pathSuggestions,
  onAssist,
  assistOpen = false,
}: TaskCardProps) => {
  const { control, setValue } = useFormContext<TaskFormValues>();
  const type = useWatch({ control, name: "type" });
  const decision = useWatch({ control, name: "decision" });
  const toolKey = useWatch({ control, name: "toolKey" });
  const forceUserDecideIfNoMatch = useWatch({
    control,
    name: "forceUserDecideIfNoMatch",
  });
  const canRunInParallel = useWatch({
    control,
    name: "canRunInParallel",
  });
  const prioritize = useWatch({
    control,
    name: "prioritize",
  });

  const selectedTool = tools.find((tool) => tool.key === toolKey);
  const supportedOutputTypes = (selectedTool?.outputTypes ?? ["normal"]).filter(
    (outputType): outputType is string => Boolean(outputType),
  );

  return (
    <Card className="w-full">
      <TaskCardHeader
        save={save}
        saving={saving}
        tools={tools}
        onAssist={onAssist}
        assistOpen={assistOpen}
      />

      <CardContent className="flex flex-col gap-5">
        <TaskModelFields models={models} />

        <Field orientation="horizontal">
          <Checkbox
            checked={canRunInParallel}
            onCheckedChange={(checked) =>
              setValue("canRunInParallel", checked === true)
            }
          />
          <div className="flex flex-col gap-0.5">
            <FieldLabel>Can run in parallel</FieldLabel>
            <p className="text-sm text-muted-foreground">
              Parallel tasks run before exclusive ones and at the same time as
              other parallel tasks, up to the limit on the Settings page. Tasks
              that call Ollama, Whisper, vision/OCR, or embeddings should stay
              off.
            </p>
          </div>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            checked={prioritize}
            onCheckedChange={(checked) =>
              setValue("prioritize", checked === true)
            }
          />
          <div className="flex flex-col gap-0.5">
            <FieldLabel>Prioritize</FieldLabel>
            <p className="text-sm text-muted-foreground">
              When queued, this task jumps to the top of the queue ahead of
              other tasks. A prioritized exclusive task waits for running work
              to finish, then runs before anything else.
            </p>
          </div>
        </Field>

        {type === "tool" ? (
          <ToolTaskFields
            tools={tools}
            tasks={tasks}
            models={models}
            toolKey={toolKey ?? null}
            selectedTool={selectedTool}
            supportedOutputTypes={supportedOutputTypes}
            pathSuggestions={pathSuggestions}
          />
        ) : null}

        {type === "decision" ? (
          <>
            <Field orientation="horizontal">
              <Checkbox
                checked={forceUserDecideIfNoMatch}
                onCheckedChange={(checked) =>
                  setValue("forceUserDecideIfNoMatch", checked === true)
                }
              />
              <div className="flex flex-col gap-0.5">
                <FieldLabel>Force user to decide if no match</FieldLabel>
                <p className="text-sm text-muted-foreground">
                  When the model matches a result, its next task is queued
                  automatically. If nothing matches, ask the user to choose one
                  of these result outputs. The fallback output is hidden while
                  this is on.
                </p>
              </div>
            </Field>
            <DecisionStateFields suggestions={pathSuggestions} />
            <TaskResultsSection
              resultFields={resultFields}
              options={decision?.options ?? []}
              canEditResults={canEditResults}
              onAddResult={onAddResult}
              onSaveResult={onSaveResult}
              onDeleteResult={onDeleteResult}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default TaskCard;
