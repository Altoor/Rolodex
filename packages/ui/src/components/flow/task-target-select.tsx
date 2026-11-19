"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import type { LandingTask } from "../landing/landing-model";

const NO_TARGET = "__none__";

interface TaskTargetSelectProps {
  value: number | null;
  tasks: LandingTask[];
  disabled?: boolean;
  onChange: (value: number | null) => void;
  /** Show a “no target” option. */
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
}

/** A reusable select for wiring a flow slot to an existing task. */
export function TaskTargetSelect({
  value,
  tasks,
  disabled,
  onChange,
  allowNone = true,
  noneLabel = "No target",
  placeholder = "Choose a task",
}: TaskTargetSelectProps) {
  return (
    <Select
      value={value == null ? (allowNone ? NO_TARGET : "") : String(value)}
      onValueChange={(next) =>
        onChange(next && next !== NO_TARGET ? Number(next) : null)
      }
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {allowNone ? (
            <SelectItem value={NO_TARGET}>{noneLabel}</SelectItem>
          ) : null}
          {tasks.flatMap((task) =>
            task.id == null
              ? []
              : [
                  <SelectItem key={task.id} value={String(task.id)}>
                    {task.name ?? `Task ${task.id}`}
                  </SelectItem>,
                ],
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
