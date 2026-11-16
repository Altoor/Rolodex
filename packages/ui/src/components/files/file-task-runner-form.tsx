import { useRef } from "react";
import { Play } from "lucide-react";
import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";

type TaskOption = NonNullable<GetTasksQuery["tasks"]>[number];

interface FileTaskRunnerFormProps {
  tasks: TaskOption[];
  tasksLoading: boolean;
  effectiveTaskId: string;
  defaultId: string | null;
  stateText: string;
  busy: boolean;
  onTaskChange: (taskId: string) => void;
  onStateTextChange: (value: string) => void;
  onFiles: (files: File[]) => void;
}

export function FileTaskRunnerForm({
  tasks,
  tasksLoading,
  effectiveTaskId,
  defaultId,
  stateText,
  busy,
  onTaskChange,
  onStateTextChange,
  onFiles,
}: FileTaskRunnerFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>Starting task</FieldLabel>
        <Select
          value={effectiveTaskId}
          onValueChange={(value) => onTaskChange(value ?? "")}
          disabled={busy || tasksLoading || tasks.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a task or use your default" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={String(task.id)}>
                  {task.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          {defaultId
            ? "Your account default is selected automatically."
            : "No default task is set. Pick a task here before dropping files."}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="file-task-state">Instruction (optional)</FieldLabel>
        <Textarea
          id="file-task-state"
          value={stateText}
          onChange={(event) => onStateTextChange(event.target.value)}
          placeholder="For example: summarise each file and update its description."
          disabled={busy}
        />
        <FieldDescription>
          Leave empty to use the uploaded filenames as the run state.
        </FieldDescription>
      </Field>

      <Button
        type="button"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
      >
        {busy ? <Spinner className="size-4" /> : <Play />}
        {busy ? "Uploading and starting…" : "Choose files and run"}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}
