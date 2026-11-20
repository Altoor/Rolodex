"use client";

import { FieldDescription } from "#components/ui/field";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";
import {
  ChainOfThoughtStep,
  type StepStatus,
} from "#components/ui/chain-of-thought";
import { Block } from "#components/blocks/block";
import { DecisionReviewPanel } from "#components/flow/decision-review/decision-review-panel";
import { NextTaskWiring } from "#components/flow/next-task/next-task-wiring";
import { UserDecisionRevisionPanel } from "#components/flow/user-decision-revision/user-decision-revision-panel";
import UserChoiceBlock from "#components/userDecision/userChoiceBlock";
import {
  Circle,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { NextStepGate } from "./next-step-gate";
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
  retrying: boolean;
  wiring: boolean;
  choiceError: string | null;
  retryError: string | null;
  onAnswer: (optionId: string) => void;
  onConfirmNextStep: (taskId?: number) => Promise<void>;
  onDismiss: () => void;
  onRetry: () => void;
  onWireDecisionTarget: (
    stepId: number,
    resultId: number,
    targetTaskId: number,
  ) => Promise<void>;
}

function formatToolConfig(value: unknown): string {
  if (value === undefined || value === null) return "No tool config";

  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
  retrying,
  wiring,
  choiceError,
  retryError,
  onAnswer,
  onConfirmNextStep,
  onDismiss,
  onRetry,
  onWireDecisionTarget,
}: LandingRunStepProps) {
  const status = stepStatus(step);
  const branch = stepBranchLabel(step, (id) => taskNameById(tasks, id));
  const detail = stepDetail(step);

  const wiringContext = [
    step.task?.name ? `Decision: ${step.task.name}` : "",
    step.result?.unwiredOption ? `Option: ${step.result.unwiredOption}` : "",
    step.result?.unwiredOptionDescription ?? "",
    step.state ? `Run state:\n${step.state}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const gateContext = [
    step.task?.name ? `Next task: ${step.task.name}` : "",
    step.state ? `Run state:\n${step.state}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const proposedTaskId =
    step.pendingChoice?.kind === "nextStep"
      ? (step.pendingChoice.taskId ?? step.taskId ?? undefined)
      : undefined;

  const decisionAnswer =
    step.pendingChoice?.kind === "decisionOutput"
      ? (step.result?.effectiveAnswer ?? step.result?.answer)
      : undefined;

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
      {step.status === "failed" ? (
        <div className="mt-1 ml-6 flex flex-col gap-2 self-stretch">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="mb-1 text-xs font-medium">Tool config</p>
            <pre className="max-h-60 overflow-auto font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
              {formatToolConfig(step.task?.toolConfig)}
            </pre>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={onRetry}
            >
              {retrying ? <Spinner /> : <RotateCcw />}
              Retry
            </Button>
            {retryError ? (
              <FieldDescription className="text-destructive">
                {retryError}
              </FieldDescription>
            ) : null}
          </div>
        </div>
      ) : null}
      {step.pendingChoice?.kind === "nextStep" ? (
        <NextStepGate
          taskName={step.task?.name ?? null}
          tasks={tasks}
          contextState={gateContext}
          busy={answering}
          dismissing={dismissing}
          error={choiceError}
          onRun={() => onConfirmNextStep(proposedTaskId)}
          onChoose={onConfirmNextStep}
          onStop={onDismiss}
        />
      ) : step.pendingChoice?.kind === "decisionTarget" ? (
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
          answer={decisionAnswer}
          answerModel={
            step.result?.model ?? step.decisionModel ?? step.model ?? null
          }
          answerNote={step.result?.note ?? null}
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
