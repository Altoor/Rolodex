"use client";

import { FieldDescription } from "#components/ui/field";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";
import {
  ChainOfThoughtStep,
  type StepStatus,
} from "#components/ui/chain-of-thought";
import { Block } from "#components/blocks/block";
import UserChoiceBlock from "#components/userDecision/userChoiceBlock";
import {
  Circle,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
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
  /** History rendering: no retry or answer actions. */
  readOnly?: boolean;
  answering: boolean;
  dismissing: boolean;
  retrying: boolean;
  choiceError: string | null;
  retryError: string | null;
  onAnswer: (optionId: string) => void;
  onDismiss: () => void;
  onRetry: () => void;
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

/** One step in a standard run's chain-of-thought. */
export function LandingRunStep({
  step,
  tasks,
  readOnly = false,
  answering,
  dismissing,
  retrying,
  choiceError,
  retryError,
  onAnswer,
  onDismiss,
  onRetry,
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
      {!readOnly && step.status === "failed" && step.result?.retried !== true ? (
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
      {!readOnly && step.pendingChoice ? (
        <UserChoiceBlock
          choice={step.pendingChoice}
          answering={answering}
          dismissing={dismissing}
          error={choiceError}
          answer={step.result?.effectiveAnswer ?? step.result?.answer}
          answerModel={
            step.result?.model ?? step.decisionModel ?? step.model ?? null
          }
          answerNote={step.result?.note ?? null}
          onAnswer={onAnswer}
          onDismiss={onDismiss}
        />
      ) : null}
    </div>
  );
}
