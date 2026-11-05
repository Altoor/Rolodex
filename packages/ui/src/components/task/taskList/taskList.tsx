"use client";

import { Button } from "#components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "#components/ui/item";
import { Spinner } from "#components/ui/spinner";
import { EmptyState } from "#components/feedback/empty-state";
import { ErrorState } from "#components/feedback/error-state";
import { ConfirmButton } from "#components/feedback/confirm-button";
import { useMutation, useQuery } from "@apollo/client/react";
import { DELETE_TASK } from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { Pencil, Plus, Trash2 } from "lucide-react";

interface TaskListProps {
  setSelectedTaskId: (id: number | undefined) => void;
  selectedTaskId: number | undefined;
}

const TaskList = ({ selectedTaskId, setSelectedTaskId }: TaskListProps) => {
  const { loading, error, data } = useQuery(TASKS);
  const [deleteTask, { loading: deleting }] = useMutation(DELETE_TASK, {
    refetchQueries: [TASKS],
    awaitRefetchQueries: true,
  });

  if (loading) return <Spinner />;
  if (error) {
    return <ErrorState title="Could not load tasks" error={error} />;
  }

  const tasks = data?.tasks ?? [];

  return (
    <div className="flex flex-col gap-2">
      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create a task to define how a run moves from one decision to the next."
        />
      ) : (
        tasks.map((task) => {
          const isSelected = task.id === selectedTaskId;

          return (
            <Item variant="outline" key={task.id}>
              <ItemContent>
                <ItemTitle>{task.name}</ItemTitle>
              </ItemContent>
              <ItemActions>
                {isSelected && task.id != null ? (
                  <ConfirmButton
                    title="Delete task"
                    onConfirm={() => {
                      void deleteTask({
                        variables: { id: task.id as number },
                      }).then(({ error: deleteError }) => {
                        if (!deleteError) setSelectedTaskId(undefined);
                      });
                    }}
                    disabled={deleting}
                  >
                    <Trash2 />
                  </ConfirmButton>
                ) : null}
                <Button
                  type="button"
                  variant={isSelected ? "secondary" : "ghost"}
                  size="icon-sm"
                  title={isSelected ? "Selected task" : "Edit task"}
                  aria-label={isSelected ? "Selected task" : "Edit task"}
                  onClick={() => setSelectedTaskId(task.id ?? undefined)}
                >
                  <Pencil />
                </Button>
              </ItemActions>
            </Item>
          );
        })
      )}
      <Button type="button" onClick={() => setSelectedTaskId(undefined)}>
        Create new task <Plus />
      </Button>
    </div>
  );
};

export default TaskList;
