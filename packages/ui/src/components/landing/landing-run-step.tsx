"use client";

import { FieldDescription } from "#components/ui/field";
import {
  ChainOfThoughtStep,
  type StepStatus,
} from "#components/ui/chain-of-thought";
import { Block } from "#components/blocks/block";
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
  answering: boolean;
  dismissing: boolean;
  choiceError: string | null;
  onAnswer: (optionId: string) => void;
  onDismiss: () => void;
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
  answering,
  dismissing,
  choiceError,
  onAnswer,
  onDismiss,
}: LandingRunStepProps) {
  const status = stepStatus(step);
  const branch = stepBranchLabel(step, (id) => taskNameById(tasks, id));
  const detail = stepDetail(step);

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
      {step.pendingChoice ? (
        <UserChoiceBlock
          choice={step.pendingChoice}
          answering={answering}
          dismissing={dismissing}
          error={choiceError}
          onAnswer={onAnswer}
          onDismiss={onDismiss}
        />
      ) : null}
    </div>
  );
}
