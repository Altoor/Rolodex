import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "#components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { useFormContext } from "react-hook-form";
import { Bot } from "lucide-react";
import { Button } from "#components/ui/button";
import type { ToolDetailsData } from "#components/tools/toolDetails";
import type { TaskFormValues } from "../../task-form";
import { TASK_TYPES } from "../taskCard.types";
import SaveTaskButton from "./saveTaskButton";

interface TaskCardHeaderProps {
  save: () => void;
  saving: boolean;
  tools: ToolDetailsData[];
  onAssist?: () => void;
  assistOpen?: boolean;
}

const TaskCardHeader = ({
  save,
  saving,
  tools,
  onAssist,
  assistOpen = false,
}: TaskCardHeaderProps) => {
  const { register, control, getValues, setValue } =
    useFormContext<TaskFormValues>();

  return (
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
              <Select
                value={value}
                onValueChange={(next) => {
                  onChange(next);

                  const toolKey = getValues("toolKey");
                  const selectedTool = tools.find(
                    (tool) => tool.key === toolKey,
                  );
                  const usesModel =
                    next === "decision" || next === "textPrompt"
                      ? true
                      : next === "tool"
                        ? Boolean(selectedTool?.usesModel)
                        : false;

                  setValue("canRunInParallel", !usesModel);
                }}
              >
                <SelectTrigger className="w-(--size-select-sm)">
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

      <CardAction className="flex items-center gap-2">
        {onAssist ? (
          <Button
            type="button"
            variant={assistOpen ? "secondary" : "outline"}
            size="icon"
            title="Build this task with the assistant"
            aria-label="Build this task with the assistant"
            aria-pressed={assistOpen}
            onClick={onAssist}
          >
            <Bot />
          </Button>
        ) : null}
        <SaveTaskButton save={save} saving={saving} />
      </CardAction>
    </CardHeader>
  );
};

export default TaskCardHeader;
