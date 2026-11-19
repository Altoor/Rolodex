"use client";

import { FieldDescription } from "#components/ui/field";
import {
  ChainOfThoughtStep,
  type StepStatus,
} from "#components/ui/chain-of-thought";
import { Block } from "#components/blocks/block";
import { DecisionReviewPanel } from "#components/flow/decision-review/decision-review-panel";
import { NextTaskWiring } from "#components/flow/next-task/next-task-wiring";
import { UserDecisionRevisionPanel } from "#components/flow/user-decision-revision/user-decision-revision-panel";
import UserChoiceBlock from "#components/userDecision/userChoiceBlock";
import { Circle, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import {
  stepBranchLabel,
  stepDetail,
  stepStatus,
  taskNameById,
  type LandingTask,
  type QueuedTaskStep,
} from "./landing-model";

interface LandingRunStepProps {
  step: QueuedTaskStep;
  tasks: LandingTask[];
  flowAutoImprovement: boolean;
  answering: boolean;
  dismissing: boolean;
  wiring: boolean;
  choiceError: string | null;
  onAnswer: (optionId: string) => void;
  onDismiss: () => void;
  onWireDecisionTarget: (
    stepId: number,
    resultId: number,
    targetTaskId: number,
  ) => Promise<void>;
}

function statusIcon(status: StepStatus) {
  if (status === "active") return <LoaderCircle className="animate-spin" />;
  if (status === "error") return <CircleAlert />;
  if (status === "complete") return <CircleCheck />;
  return <Circle />;
}

/** One step in a run's chain-of-thought, including its tool output. */
export function LandingRunStep({
  step,
  tasks,
  flowAutoImprovement,
  answering,
  dismissing,
  wiring,
  choiceError,
  onAnswer,
  onDismiss,
  onWireDecisionTarget,
}: LandingRunStepProps) {
  const status = stepStatus(step);
  const branch = stepBranchLabel(step, (id) => taskNameById(tasks, id));
  const detail = stepDetail(step);

  const wiringContext = [
    step.task?.name ? `Decision: ${step.task.name}` : "",
    step.result?.unwiredOption
      ? `Option: ${step.result.unwiredOption}`
      : "",
    step.result?.unwiredOptionDescription ?? "",
    step.state ? `Run state:\n${step.state}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="flex flex-col items-start gap-0.5">
      <ChainOfThoughtStep
        status={status}
        icon={statusIcon(status)}
        title={step.task?.name ?? `task ${step.taskId ?? step.id}`}
        description={branch}
      />
      {detail ? (
        <FieldDescription className="ml-6 text-xs">{detail}</FieldDescription>
      ) : null}
      {step.result?.output != null ? (
        <Block
          className="mt-1 ml-6"
          toolKey={step.result.toolKey}
          output={step.result.output}
        />
      ) : null}
      {step.pendingChoice?.kind === "decisionTarget" ? (
        <NextTaskWiring
          title={
            step.result?.unwiredOption
              ? `Option "${step.result.unwiredOption}" has no next task`
              : "This decision needs a next task"
          }
          description={step.result?.unwiredOptionDescription ?? null}
          contextState={wiringContext}
          tasks={tasks}
          disabled={wiring || dismissing}
          onWired={async (targetTaskId) => {
            const resultId = step.result?.unwiredResultId;
            if (resultId == null) {
              throw new Error("This decision result is missing");
            }
            await onWireDecisionTarget(step.id, resultId, targetTaskId);
          }}
          onDismiss={onDismiss}
        />
      ) : step.pendingChoice ? (
        <UserChoiceBlock
          choice={step.pendingChoice}
          answering={answering}
          dismissing={dismissing}
          error={choiceError}
          onAnswer={onAnswer}
          onDismiss={onDismiss}
        />
      ) : null}
      {flowAutoImprovement &&
      step.taskId != null &&
      step.task?.type === "decision" &&
      step.status === "completed" ? (
        <DecisionReviewPanel queuedTaskId={step.id} />
      ) : null}
      {flowAutoImprovement &&
      step.taskId != null &&
      step.task?.type === "userDecision" ? (
        <UserDecisionRevisionPanel
          taskId={step.taskId}
          queuedTaskId={step.id}
          awaitingInput={step.status === "awaiting_input"}
          state={step.state}
          currentOptions={step.pendingChoice?.options ?? []}
          tasks={tasks}
        />
      ) : null}
    </div>
  );
}
