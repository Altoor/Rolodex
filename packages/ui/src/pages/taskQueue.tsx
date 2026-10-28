"use client";
import TaskBuilder from "#components/task/taskBuilder";
import TaskList from "#components/task/taskList/taskList";
import { useState } from "react";

export default function TaskQueuePage() {
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>(
    undefined,
  );

  /**
   * <TaskQueue
          setSelectedDecisionId={(decision) => setSelectedTaskId(decision)}
          selectedDecisionId={selectedTaskId}
        />

    <TaskBuilder selectedDecisionId={selectedTaskId} />
   */

  return (
    <div className="flex flex-row gap-4 m-4">
      <div className="flex flex-col w-full ">
        <TaskList
          setSelectedTaskId={(decision) => setSelectedTaskId(decision)}
          selectedTaskId={selectedTaskId}
        ></TaskList>
      </div>
      <div className="flex flex-col w-full">
        <TaskBuilder selectedTaskId={selectedTaskId}></TaskBuilder>
      </div>
    </div>
  );
}
