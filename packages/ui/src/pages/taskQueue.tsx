"use client";
import { useMutation } from "@apollo/client/react";
import { UPDATE_USER_SETTINGS } from "@repo/queries/user/user-mutations";
import { ME } from "@repo/queries/user/users-queries";
import { AuthGate } from "../components/auth/auth-gate";
import { useAuth } from "../components/auth/auth-provider";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import TaskBuilder from "#components/task/taskBuilder/taskBuilder";
import TaskFlow from "#components/task/taskFlow/taskFlow";
import { useState } from "react";

export default function TaskQueuePage() {
  return (
    <AuthGate>
      <TaskQueuePageContent />
    </AuthGate>
  );
}

function TaskQueuePageContent() {
  const { user } = useAuth();
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>(
    undefined,
  );
  const [updateSettings] = useMutation(UPDATE_USER_SETTINGS, {
    refetchQueries: [ME],
  });

  const defaultTaskId = user?.settings?.defaultTaskId ?? null;

  const setDefaultTask = (taskId: number) => {
    if (defaultTaskId === taskId) return;

    void updateSettings({ variables: { defaultTaskId: taskId } });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Task queue"
        description="Design tasks, wire their results, and inspect the flow."
      />
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex h-130 min-h-100 flex-col xl:flex-1">
          <TaskFlow
            selectedTaskId={selectedTaskId}
            onSelectTaskId={setSelectedTaskId}
            defaultTaskId={defaultTaskId}
            onDefaultTaskChange={setDefaultTask}
          />
        </div>
        <div className="flex w-full flex-col xl:w-[30rem] xl:shrink-0">
          <TaskBuilder
            key={selectedTaskId ?? "new-task"}
            selectedTaskId={selectedTaskId}
          />
        </div>
      </div>
    </PageContainer>
  );
}
