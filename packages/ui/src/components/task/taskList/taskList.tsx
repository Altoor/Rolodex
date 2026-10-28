"use client";

import { Button } from "#components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "#components/ui/item";
import { Spinner } from "#components/ui/spinner";
import { useMutation, useQuery } from "@apollo/client/react";
import { DELETE_TASK } from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { Pencil, Plus, X } from "lucide-react";

interface TaskListProps {
  setSelectedTaskId: (id: number | undefined) => void;
  selectedTaskId: number | undefined;
}

const TaskList = ({ selectedTaskId, setSelectedTaskId }: TaskListProps) => {
  const { loading, data } = useQuery(TASKS);
  const [deleteTask, { client }] = useMutation(DELETE_TASK);

  return (
    <div className="flex flex-col gap-2">
      {loading ? (
        <Spinner />
      ) : (
        data &&
        data.tasks?.map((task) => (
          <Item variant={"outline"} key={task.id}>
            <ItemContent>
              <ItemTitle>{task.name}</ItemTitle>{" "}
            </ItemContent>
            <ItemActions>
              <Button
                onClick={() => {
                  if (task.id !== selectedTaskId) {
                    setSelectedTaskId(task.id ?? undefined);
                  } else {
                    deleteTask({ variables: { id: selectedTaskId } });
                    client.refetchQueries({
                      include: [TASKS],
                    });
                  }
                }}
              >
                {task.id === selectedTaskId ? (
                  <X className="text-red-400" />
                ) : (
                  <Pencil />
                )}
              </Button>
            </ItemActions>
          </Item>
        ))
      )}
      <Button
        onClick={() => {
          setSelectedTaskId(undefined);
        }}
      >
        Create new task <Plus />
      </Button>
    </div>
  );
};

export default TaskList;
