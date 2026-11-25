"use client";

import { useQuery } from "@apollo/client/react";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { DecisionTargetWiring } from "../molecules/decision-target-wiring";
import type {
  AssistedAttempt,
  AssistedStep,
  NextTaskDraft,
  TargetTaskOption,
} from "../types";

interface DecisionTargetWiringContainerProps {
  step: AssistedStep;
  attempt: AssistedAttempt;
  busy: string | null;
  onDraft: (
    attemptId: number,
    feedback?: string,
    draft?: NextTaskDraft,
  ) => Promise<NextTaskDraft | null>;
  onWire: (attemptId: number, resultId: number, targetTaskId: number) => void;
  onCreate: (
    attemptId: number,
    resultId: number,
    draft: NextTaskDraft,
  ) => void;
}

/**
 * Loads the tasks that can be wired to a decision option. The molecule stays
 * presentational; only this container talks to Apollo.
 */
export function DecisionTargetWiringContainer(
  props: DecisionTargetWiringContainerProps,
) {
  const { step, ...rest } = props;
  const { data } = useQuery<{ tasks: TargetTaskOption[] }>(TASKS);
  const tasks = (data?.tasks ?? []).filter((task) => task.id !== step.taskId);

  return <DecisionTargetWiring {...rest} tasks={tasks} />;
}
