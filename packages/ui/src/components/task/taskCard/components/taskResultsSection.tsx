import type { FieldArrayWithId } from "react-hook-form";
import { Plus } from "lucide-react";
import { Button } from "#components/ui/button";
import { CardTitle } from "#components/ui/card";
import TaskResultOption from "../../taskResultOption/taskResultOption";
import type { TaskFormValues } from "../../task-form";

interface TaskResultsSectionProps {
  resultFields: FieldArrayWithId<TaskFormValues, "taskResults", "id">[];
  options: string[];
  canEditResults: boolean;
  onAddResult: () => void;
  onSaveResult: (index: number) => void;
  onDeleteResult: (index: number) => void;
}

const TaskResultsSection = ({
  resultFields,
  options,
  canEditResults,
  onAddResult,
  onSaveResult,
  onDeleteResult,
}: TaskResultsSectionProps) => (
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
              options={options}
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
);

export default TaskResultsSection;
