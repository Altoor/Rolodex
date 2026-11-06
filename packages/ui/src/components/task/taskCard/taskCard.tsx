"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "#components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";
import { Plus, Save } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Textarea } from "#components/ui/textarea";
import {
  ToolDetails,
  type ToolDetailsData,
} from "#components/tools/toolDetails";
import type { FieldArrayWithId } from "react-hook-form";
import { useFormContext, useWatch } from "react-hook-form";
import { USE_USER_DEFAULT_MODEL, type TaskFormValues } from "../task-form";
import TaskResultOption from "../taskResultOption/taskResultOption";
import { TaskType } from "@repo/queries/__generated__/graphql";

const TASK_TYPES = [
  { label: "Decision", value: "decision" as TaskType },
  { label: "TextPrompt", value: "textPrompt" as TaskType },
  { label: "Tool", value: "tool" as TaskType },
];

interface TaskCardProps {
  resultFields: FieldArrayWithId<TaskFormValues, "taskResults", "id">[];
  tools: ToolDetailsData[];
  models: string[];
  save: () => void;
  saving?: boolean;
  canEditResults: boolean;
  onAddResult: () => void;
  onSaveResult: (index: number) => void;
  onDeleteResult: (index: number) => void;
}

const TaskCard = ({
  resultFields,
  tools,
  models,
  save,
  saving = false,
  canEditResults,
  onAddResult,
  onSaveResult,
  onDeleteResult,
}: TaskCardProps) => {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<TaskFormValues>();
  const type = useWatch({ control, name: "type" });
  const decision = useWatch({ control, name: "decision" });
  const toolKey = useWatch({ control, name: "toolKey" });
  const selectedTool = tools.find((tool) => tool.key === toolKey);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <CardContent className="w-full">
          <CardTitle>Task</CardTitle>
          <CardDescription>Set up a task.</CardDescription>
          <Field>
            <SelectController
              name="type"
              control={control}
              defaultValue="decision"
            >
              {(value, onChange) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TASK_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SelectController>
          </Field>
        </CardContent>
        <CardContent className="w-full">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-name">Name</FieldLabel>
              <Input id="task-name" {...register("name", { required: true })} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardAction>
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            title="Save task"
            aria-label="Save task"
          >
            {saving ? <Spinner /> : <Save />}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Generation model</FieldLabel>
            <SelectController name="model" control={control}>
              {(value, onChange) => (
                <Select
                  value={value ?? USE_USER_DEFAULT_MODEL}
                  onValueChange={onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={USE_USER_DEFAULT_MODEL}>
                        Use user default
                      </SelectItem>
                      {models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SelectController>
            <FieldDescription>
              Used by the prompt tool and todo field extraction.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Decision model</FieldLabel>
            <SelectController name="decisionModel" control={control}>
              {(value, onChange) => (
                <Select
                  value={value ?? USE_USER_DEFAULT_MODEL}
                  onValueChange={onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={USE_USER_DEFAULT_MODEL}>
                        Use user default
                      </SelectItem>
                      {models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SelectController>
            <FieldDescription>
              Used by decision tasks and todo selection.
            </FieldDescription>
          </Field>
        </div>

        {type === "tool" ? (
          <div className="flex flex-col gap-4 rounded-lg border p-4">
            <Field>
              <FieldLabel>Tool</FieldLabel>
              <SelectController
                name="toolKey"
                control={control}
                rules={{ required: "select a tool" }}
              >
                {(value, onChange) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a tool" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {tools.map((tool) => (
                          <SelectItem
                            key={tool.key ?? tool.name}
                            value={tool.key ?? ""}
                          >
                            {tool.name ?? tool.key}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </SelectController>
              <FieldError errors={[errors.toolKey]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="task-tool-config">
                Tool config (JSON)
              </FieldLabel>
              <Textarea
                id="task-tool-config"
                placeholder='Optional JSON, for example {"id": 3, "done": true}.'
                {...register("toolConfigText")}
              />
              <FieldDescription>
                Optional JSON. The queued task state is also passed to the tool.
              </FieldDescription>
              <FieldError errors={[errors.toolConfigText]} />
            </Field>

            {toolKey === "prompt" ? (
              <FieldDescription>
                Prompt uses the generation model. Leave it empty to use your
                default.
              </FieldDescription>
            ) : null}

            {selectedTool ? (
              <div className="rounded-lg bg-muted/40 p-4">
                <ToolDetails tool={selectedTool} />
              </div>
            ) : null}
          </div>
        ) : null}

        {type === "decision" ? (
          <div className="flex flex-col gap-3">
            <CardTitle>Results</CardTitle>
            {!canEditResults ? (
              <p className="text-sm text-muted-foreground">
                Save the task before adding result branches.
              </p>
            ) : (
              <>
                <div className="flex flex-row flex-wrap gap-2">
                  {resultFields.map((field, index) => (
                    <TaskResultOption
                      key={field.id}
                      index={index}
                      options={decision?.options ?? []}
                      onSave={() => onSaveResult(index)}
                      onDelete={() => onDeleteResult(index)}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  className="w-min"
                  onClick={onAddResult}
                  title="Add result"
                  aria-label="Add result"
                >
                  <Plus />
                </Button>
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default TaskCard;
