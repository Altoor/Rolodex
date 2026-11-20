"use client";

import { FlowStartAssistant } from "../../../flow/flow-start-assistant";
import { useFlowStartAssistant } from "../../../flow/use-flow-start-assistant";
import type { LandingTask } from "../../../landing/landing-model";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { Bot, Sparkles, X } from "lucide-react";
import { useState } from "react";

interface TaskBuilderAssistantProps {
  /** Existing tasks, used both as proposal context and wiring targets. */
  tasks: LandingTask[];
  onCreated: (taskId: number) => void;
  onEditTask: (taskId: number) => void;
  onClose: () => void;
}

/**
 * The bot-button panel on the task card. It hosts the same proposal and draft
 * machinery as the landing assistant, but creates a task for the builder
 * instead of starting a run.
 */
export function TaskBuilderAssistant({
  tasks,
  onCreated,
  onEditTask,
  onClose,
}: TaskBuilderAssistantProps) {
  const [prompt, setPrompt] = useState("");

  const assistant = useFlowStartAssistant({
    buildMode: true,
    onCreated: (taskId) => onCreated(taskId),
    onExistingTask: onEditTask,
  });

  const busy = assistant.busy != null;
  const showPrompt = !assistant.proposal && !assistant.draft;

  const suggest = () => {
    if (!prompt.trim() || busy) return;
    void assistant.propose(prompt, []);
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Task assistant</p>
            <FieldDescription>
              Describe the task you want to build. The assistant uses your
              existing tasks as context and can wire new results to them.
            </FieldDescription>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close assistant"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      {showPrompt ? (
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="task-assistant-prompt">
              What should this task do?
            </FieldLabel>
            <Textarea
              id="task-assistant-prompt"
              value={prompt}
              disabled={busy}
              placeholder="For example: decide whether a file is an invoice, then read it with OCR."
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  suggest();
                }
              }}
            />
          </Field>

          {assistant.error ? (
            <p className="text-xs text-destructive">{assistant.error}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !prompt.trim()}
              onClick={suggest}
            >
              {assistant.busy === "propose" ? <Spinner /> : <Sparkles />}
              Find or build this task
            </Button>
          </div>
        </div>
      ) : (
        <FlowStartAssistant
          assistant={assistant}
          tasks={tasks}
          mode="build"
          embedded
        />
      )}
    </div>
  );
}

export default TaskBuilderAssistant;
