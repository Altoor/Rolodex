"use client";

import { FieldDescription } from "#components/ui/field";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "#components/ui/chain-of-thought";
import { Separator } from "#components/ui/separator";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
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
  wiringStepId: number | null;
  answerError: string | null;
  dismissError: string | null;
  onAnswer: (stepId: number, optionId: string) => void;
  onDismiss: (stepId: number) => void;
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
  wiringStepId,
  answerError,
  dismissError,
  onAnswer,
  onDismiss,
  onWireDecisionTarget,
}: LandingRunProps) {
  const headerStatus = runHeaderStatus(run);
  const startName = taskNameById(tasks, run.startTaskId);

  return (
    <div>
      <FieldDescription>{run.state}</FieldDescription>
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
              wiring={wiringStepId === step.id}
              choiceError={
                answeringStepId === step.id
                  ? answerError
                  : dismissingStepId === step.id
                    ? dismissError
                    : null
              }
              onAnswer={(optionId) => onAnswer(step.id, optionId)}
              onDismiss={() => onDismiss(step.id)}
              onWireDecisionTarget={onWireDecisionTarget}
            />
          ))}
        </ChainOfThoughtContent>
      </ChainOfThought>
      <Separator className="my-2" />
    </div>
  );
}
