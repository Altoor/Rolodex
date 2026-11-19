"use client";

import { Field, FieldLabel } from "#components/ui/field";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import type { Control } from "react-hook-form";
import { AUTO_TASK_ID, type LandingFormInputs, type LandingTask } from "./landing-model";

interface LandingTaskSelectProps {
  control: Control<LandingFormInputs>;
  tasks: LandingTask[];
  autoEnabled?: boolean;
  disabled?: boolean;
}

/** The landing page's starting-task picker. */
export function LandingTaskSelect({
  control,
  tasks,
  autoEnabled = false,
  disabled,
}: LandingTaskSelectProps) {
  return (
    <Field>
      <FieldLabel>Starting task</FieldLabel>
      <SelectController
        name="taskId"
        control={control}
        rules={{ required: "select a starting task" }}
      >
        {(value, onChange) => (
          <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a starting task" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={AUTO_TASK_ID}>
                  {autoEnabled
                    ? "No task — let the model decide"
                    : "No task"}
                </SelectItem>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={String(task.id)}>
                    {task.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </SelectController>
    </Field>
  );
}
