"use client";

import { FieldDescription } from "#components/ui/field";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "#components/ui/chain-of-thought";
import { Separator } from "#components/ui/separator";
import { CircleAlert, CircleCheck, LoaderCircle, Square } from "lucide-react";
import { LandingRunStep } from "./landing-run-step";
import {
  runHeaderStatus,
  runTitle,
  taskNameById,
  type LandingRun as LandingRunModel,
  type LandingTask,
} from "./landing-model";

interface LandingRunProps {
  run: LandingRunModel;
  tasks: LandingTask[];
  flowAutoImprovement: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answeringStepId: number | null;
  dismissingStepId: number | null;
  retryingStepId: number | null;
  retryErrorStepId: number | null;
  wiringStepId: number | null;
  answerError: string | null;
  dismissError: string | null;
  retryError: string | null;
  onAnswer: (stepId: number, optionId: string) => void;
  onConfirmNextStep: (stepId: number, taskId?: number) => Promise<void>;
  onDismiss: (stepId: number) => void;
  onRetry: (stepId: number) => void;
  onWireDecisionTarget: (
    stepId: number,
    resultId: number,
    targetTaskId: number,
  ) => Promise<void>;
}

/** One queued run, rendered as a collapsible chain-of-thought. */
export function LandingRun({
  run,
  tasks,
  flowAutoImprovement,
  open,
  onOpenChange,
  answeringStepId,
  dismissingStepId,
  retryingStepId,
  retryErrorStepId,
  wiringStepId,
  answerError,
  dismissError,
  retryError,
  onAnswer,
  onConfirmNextStep,
  onDismiss,
  onRetry,
  onWireDecisionTarget,
}: LandingRunProps) {
  const headerStatus = runHeaderStatus(run);
  const startName = taskNameById(tasks, run.startTaskId);
  // Stopping any active step ends the whole run, including foreach children.
  const stopStepId = [...run.steps]
    .reverse()
    .find(
      (step) =>
        step.status === "queued" ||
        step.status === "running" ||
        step.status === "awaiting_input",
    )?.id;
  const stopping = stopStepId != null && dismissingStepId === stopStepId;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <FieldDescription className="min-w-0 flex-1">
          {run.state}
        </FieldDescription>
        {stopStepId != null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={stopping}
            title="Stop this run and its remaining steps"
            onClick={() => onDismiss(stopStepId)}
          >
            {stopping ? <Spinner /> : <Square />}
            Stop
          </Button>
        ) : null}
      </div>
      {dismissError && stopStepId != null ? (
        <FieldDescription className="text-destructive">
          {dismissError}
        </FieldDescription>
      ) : null}
      <ChainOfThought open={open} onOpenChange={onOpenChange}>
        <ChainOfThoughtHeader
          status={headerStatus}
          icon={
            headerStatus === "error" ? (
              <CircleAlert />
            ) : headerStatus === "running" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CircleCheck />
            )
          }
          title={runTitle(run, startName)}
        />
        <ChainOfThoughtContent>
          {run.steps.map((step) => (
            <LandingRunStep
              key={step.id}
              step={step}
              tasks={tasks}
              flowAutoImprovement={flowAutoImprovement}
              answering={answeringStepId === step.id}
              dismissing={dismissingStepId === step.id}
              retrying={retryingStepId === step.id}
              wiring={wiringStepId === step.id}
              choiceError={
                answeringStepId === step.id
                  ? answerError
                  : dismissingStepId === step.id
                    ? dismissError
                    : null
              }
              retryError={retryErrorStepId === step.id ? retryError : null}
              onAnswer={(optionId) => onAnswer(step.id, optionId)}
              onConfirmNextStep={(taskId) => onConfirmNextStep(step.id, taskId)}
              onDismiss={() => onDismiss(step.id)}
              onRetry={() => onRetry(step.id)}
              onWireDecisionTarget={onWireDecisionTarget}
            />
          ))}
        </ChainOfThoughtContent>
      </ChainOfThought>
      <Separator className="my-2" />
    </div>
  );
}
