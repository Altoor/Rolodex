"use client";

import { Button } from "#components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "#components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { LoaderCircle, Plus, Sparkles, Wrench } from "lucide-react";
import { useState } from "react";
import { FlowTaskDraftEditor } from "../flow-draft-editor";
import {
  flowKindLabel,
  type FlowStartKind,
} from "../flow-model";
import { TaskTargetSelect } from "../task-target-select";
import type { LandingTask } from "../../landing/landing-model";
import { useFlowNextTask } from "./use-flow-next-task";

type Mode = "ask" | "existing" | "new" | "draft" | "summary" | "ended";

interface NextTaskWiringProps {
  title: string;
  description?: string | null;
  /** Context passed to the generation model when drafting a new task. */
  contextState: string;
  tasks: LandingTask[];
  disabled?: boolean;
  /** Current target, used to show a summary instead of asking again. */
  value?: number | null;
  onWired: (taskId: number) => void | Promise<void>;
  /** Optional action for “the flow is done after this task”. */
  onEndFlow?: () => void | Promise<void>;
  /** Optional escape hatch that ends the run without wiring. */
  onDismiss?: () => void | Promise<void>;
}

const NEW_KINDS: Exclude<FlowStartKind, "existingTask">[] = [
  "newToolTask",
  "newDecisionTask",
  "newUserDecisionTask",
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function draftContext(draft: {
  name: string;
  toolKey: string | null;
  toolConfig: Record<string, unknown> | null;
}): string {
  return [
    `Task: ${draft.name}`,
    draft.toolKey ? `Tool: ${draft.toolKey}` : "",
    draft.toolConfig
      ? `Tool config: ${JSON.stringify(draft.toolConfig, null, 2)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Asks whether a decision slot should point at an existing task or a new one,
 * then drafts and creates the new task without starting a run.
 */
export function NextTaskWiring({
  title,
  description,
  contextState,
  tasks,
  disabled = false,
  value,
  onWired,
  onEndFlow,
  onDismiss,
}: NextTaskWiringProps) {
  const [mode, setMode] = useState<Mode>(value != null ? "summary" : "ask");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [kind, setKind] =
    useState<Exclude<FlowStartKind, "existingTask">>("newToolTask");
  const [prompt, setPrompt] = useState("");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [wiring, setWiring] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    draft,
    busy,
    error,
    draftTask,
    refineDraft,
    createTask,
    updateDraft,
    reset,
  } = useFlowNextTask(contextState);

  const anyBusy = busy != null || wiring || disabled;
  const wiredLabel =
    value != null
      ? (tasks.find((task) => task.id === value)?.name ?? `Task ${value}`)
      : null;

  const wire = async (taskId: number) => {
    setWiring(true);
    setLocalError(null);
    try {
      await onWired(taskId);
      setMode("summary");
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setWiring(false);
    }
  };

  const endFlow = async () => {
    if (!onEndFlow) return;

    setWiring(true);
    setLocalError(null);
    try {
      await onEndFlow();
      setMode("ended");
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setWiring(false);
    }
  };

  const startDraft = async () => {
    setLocalError(null);
    if (await draftTask(kind, prompt)) setMode("draft");
  };

  const createAndWire = async () => {
    setLocalError(null);
    const taskId = await createTask();
    if (taskId != null) await wire(taskId);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : (
          <FieldDescription>
            This option has no next task yet. Choose an existing task or define
            a new one.
          </FieldDescription>
        )}
      </div>

      {mode === "summary" ? (
        <div className="flex flex-wrap items-center gap-2">
          <FieldDescription>
            {wiredLabel ? `Next: ${wiredLabel}` : "A next step is already set."}
          </FieldDescription>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={anyBusy}
            onClick={() => setMode("ask")}
          >
            Change
          </Button>
        </div>
      ) : null}

      {mode === "ended" ? (
        <div className="flex flex-wrap items-center gap-2">
          <FieldDescription>
            The flow ends after this task.
          </FieldDescription>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={anyBusy}
            onClick={() => setMode("ask")}
          >
            Change
          </Button>
        </div>
      ) : null}

      {mode === "ask" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={anyBusy}
            onClick={() => setMode("existing")}
          >
            Use an existing task
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={anyBusy}
            onClick={() => setMode("new")}
          >
            <Plus /> Define a new task or tool
          </Button>
          {onEndFlow ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={anyBusy}
              onClick={() => void endFlow()}
            >
              The flow is done
            </Button>
          ) : null}
          {onDismiss ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={anyBusy}
              onClick={() => {
                setLocalError(null);
                void Promise.resolve(onDismiss()).catch((err: unknown) =>
                  setLocalError(errorMessage(err)),
                );
              }}
            >
              Stop this run
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === "existing" ? (
        <div className="flex flex-col gap-2">
          <Field>
            <FieldLabel>Existing task</FieldLabel>
            <TaskTargetSelect
              value={selectedTaskId}
              tasks={tasks}
              disabled={anyBusy}
              allowNone={false}
              placeholder="Choose a task"
              onChange={setSelectedTaskId}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={anyBusy || selectedTaskId == null}
              onClick={() => {
                if (selectedTaskId != null) void wire(selectedTaskId);
              }}
            >
              {wiring ? <Spinner /> : null}
              Use this task
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={anyBusy}
              onClick={() => setMode("ask")}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "new" ? (
        <div className="flex flex-col gap-2">
          <Field>
            <FieldLabel>New task kind</FieldLabel>
            <Select
              value={kind}
              disabled={anyBusy}
              onValueChange={(value) => {
                if (
                  value === "newToolTask" ||
                  value === "newDecisionTask" ||
                  value === "newUserDecisionTask"
                ) {
                  setKind(value);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {NEW_KINDS.map((candidate) => (
                    <SelectItem key={candidate} value={candidate}>
                      {flowKindLabel(candidate)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>What should this task do?</FieldLabel>
            <Textarea
              value={prompt}
              disabled={anyBusy}
              placeholder="Optional. For example: summarize the refund request and route it to support."
              onChange={(event) => setPrompt(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={anyBusy}
              onClick={() => void startDraft()}
            >
              {busy === "draft" ? <Spinner /> : <Wrench />}
              Draft this task
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={anyBusy}
              onClick={() => setMode("ask")}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "draft" && draft ? (
        <div className="flex flex-col gap-3">
          <FlowTaskDraftEditor
            draft={draft}
            tasks={tasks}
            disabled={anyBusy}
            onChange={updateDraft}
            renderToolNextWiring={({ onWired, onEndFlow }) => (
              <NextTaskWiring
                title="What should happen after this tool?"
                description="This tool produces output. Choose another task or tool, or end the flow here."
                contextState={draftContext(draft)}
                tasks={tasks}
                disabled={anyBusy}
                value={draft.fallbackTaskId}
                onWired={onWired}
                onEndFlow={onEndFlow}
              />
            )}
          />
          {draft.type === "decision" &&
          (draft.decision?.results.some(
            (result) => result.targetTaskId == null,
          ) ??
            false) ? (
            <FieldDescription>
              This new decision still has options without a next task. Wire them
              from the task builder, or when the decision runs.
            </FieldDescription>
          ) : null}
          {draft.type === "userDecision" &&
          (draft.userDecision?.options.some(
            (option) => option.resultTaskId == null,
          ) ??
            false) ? (
            <FieldDescription>
              This new user decision still has options without a next task.
              Wire them from the task builder, or when the decision runs.
            </FieldDescription>
          ) : null}
          <Field>
            <FieldLabel>Refine this task</FieldLabel>
            <Textarea
              value={refinePrompt}
              disabled={anyBusy}
              placeholder="For example: make it a todo task instead, and keep the prompt short."
              onChange={(event) => setRefinePrompt(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={anyBusy || !refinePrompt.trim()}
              onClick={() => {
                void refineDraft(refinePrompt).then((refined) => {
                  if (refined) setRefinePrompt("");
                });
              }}
            >
              {busy === "refine" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              Refine
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={anyBusy}
              onClick={() => void createAndWire()}
            >
              {busy === "create" || wiring ? <Spinner /> : <Wrench />}
              Create and use this task
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={anyBusy}
              onClick={() => {
                reset();
                setMode("new");
              }}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {error || localError ? (
        <p className="text-xs text-destructive">{error ?? localError}</p>
      ) : null}
    </div>
  );
}
