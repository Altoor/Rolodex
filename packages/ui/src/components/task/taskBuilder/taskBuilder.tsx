"use client";

import { ErrorState } from "#components/feedback/error-state";
import { FormProvider } from "react-hook-form";
import TaskCard from "../taskCard/taskCard";
import TaskDecisionSection from "./components/taskDecisionSection";
import { useTaskBuilderData } from "./hooks/useTaskBuilderData";
import { useTaskBuilderForm } from "./hooks/useTaskBuilderForm";
import { useTaskPersistence } from "./hooks/useTaskPersistence";
import { useTaskResultActions } from "./hooks/useTaskResultActions";

interface TaskBuilderProps {
  selectedTaskId: number | undefined;
}

const TaskBuilder = ({ selectedTaskId }: TaskBuilderProps) => {
  const { tools, branchTasks, models } = useTaskBuilderData();
  const {
    methods,
    type,
    fields,
    append,
    remove,
    selectedDecisionId,
    setSelectedDecisionId,
    taskId,
    setCreatedTaskId,
    loadError,
  } = useTaskBuilderForm(selectedTaskId);

  const { saveTask, creatingTask, updatingTask, persistenceError } =
    useTaskPersistence({
      methods,
      taskId,
      selectedDecisionId,
      onCreatedTaskId: setCreatedTaskId,
    });

  const {
    addTaskResult,
    saveTaskResult,
    deleteTaskResultAt,
    resultError,
  } = useTaskResultActions({ methods, taskId, append, remove });

  const error = loadError ?? persistenceError ?? resultError;

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col gap-2">
        {error ? (
          <ErrorState title="Task operation failed" error={error} />
        ) : null}
        <TaskCard
          resultFields={fields}
          tools={tools}
          tasks={branchTasks}
          models={models}
          save={saveTask}
          saving={creatingTask || updatingTask}
          canEditResults={taskId !== undefined}
          onAddResult={addTaskResult}
          onSaveResult={saveTaskResult}
          onDeleteResult={deleteTaskResultAt}
        />
        <TaskDecisionSection
          type={type}
          selectedDecisionId={selectedDecisionId}
          onSelectDecision={setSelectedDecisionId}
        />
      </div>
    </FormProvider>
  );
};

export default TaskBuilder;
