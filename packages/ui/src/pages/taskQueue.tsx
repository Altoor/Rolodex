"use client";
import TaskBuilder from "#components/task/taskBuilder";
import TaskFlow from "#components/task/taskFlow/taskFlow";
import { useState } from "react";

export default function TaskQueuePage() {
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>(
    undefined,
  );

  return (
    <div className="flex flex-col gap-4 m-4">
      <div className="flex h-130 flex-col">
        <TaskFlow
          selectedTaskId={selectedTaskId}
          onSelectTaskId={setSelectedTaskId}
        ></TaskFlow>
      </div>
      <div className="flex flex-col w-full">
        <TaskBuilder selectedTaskId={selectedTaskId}></TaskBuilder>
      </div>
    </div>
  );
}
