"use client";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { LoaderCircle, Play, Sparkles, Wrench } from "lucide-react";
import { useState } from "react";
import { FlowTaskDraftEditor } from "./flow-draft-editor";
import { NextTaskWiring } from "./next-task/next-task-wiring";
import {
  flowKindLabel,
  isDraftRunnable,
  isNewKind,
  type FlowDecisionResultDraft,
  type FlowTaskDraft,
  type FlowUserDecisionOptionDraft,
} from "./flow-model";
import type { FlowStartAssistantState } from "./use-flow-start-assistant";
import type { LandingTask } from "../landing/landing-model";

interface FlowStartAssistantProps {
  assistant: FlowStartAssistantState;
  tasks: LandingTask[];
  /** Build mode creates tasks for the builder instead of starting runs. */
  mode?: "start" | "build";
  /** Drops the outer card chrome so a parent panel can host the content. */
  embedded?: boolean;
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return null;
  return (
    <Badge variant="outline" className="shrink-0 tabular-nums">
      {confidence.toFixed(2)}
    </Badge>
  );
}

function decisionWiringContext(
  draft: FlowTaskDraft,
  result: FlowDecisionResultDraft,
): string {
  const decision = draft.decision;
  const optionIndex =
    result.option != null && decision
      ? decision.options.findIndex((option) => option.name === result.option)
      : -1;
  const optionDescription =
    optionIndex >= 0 ? (decision?.options[optionIndex]?.description ?? "") : "";

  return [
    `Task: ${draft.name}`,
    decision ? `Decision: ${decision.name}` : "",
    decision?.instruction ? `Instruction: ${decision.instruction}` : "",
    result.option ? `Option: ${result.option}` : "Threshold result",
    optionDescription ? `Option description: ${optionDescription}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function userDecisionWiringContext(
  draft: FlowTaskDraft,
  option: FlowUserDecisionOptionDraft,
): string {
  return [
    `Task: ${draft.name}`,
    draft.userDecision?.prompt ? `Question: ${draft.userDecision.prompt}` : "",
    `Option: ${option.label}`,
    option.description ? `Option description: ${option.description}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function toolWiringContext(draft: FlowTaskDraft): string {
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
 * The landing page's auto-start panel. It shows the model proposal, lets the
 * user pick another candidate or refine it, and then hosts the draft editor.
 */
export function FlowStartAssistant({
  assistant,
  tasks,
  mode = "start",
  embedded = false,
}: FlowStartAssistantProps) {
  const [proposalPrompt, setProposalPrompt] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const buildMode = mode === "build";
  const shell = embedded
    ? "flex flex-col gap-4"
    : "mt-3 flex flex-col gap-4 rounded-lg border bg-card p-4";

  const {
    proposal,
    draft,
    selectedCandidate,
    busy,
    error,
    notice,
    selectCandidate,
    refineProposal,
    buildCandidate,
    refineDraft,
    updateDraft,
    confirmDraft,
    cancel,
  } = assistant;

  if (!proposal && !notice) return null;

  const anyBusy = busy != null;

  if (draft) {
    const runnable = isDraftRunnable(draft);

    return (
      <div className={shell}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Review the new task</p>
            <FieldDescription>
              The model is local. Every value below can be changed before you
              create the task.
            </FieldDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={anyBusy}
            onClick={cancel}
          >
            Cancel
          </Button>
        </div>

        <FlowTaskDraftEditor
          draft={draft}
          tasks={tasks}
          disabled={anyBusy}
          onChange={updateDraft}
          renderDecisionResultWiring={({ result, draft: current, onWired }) => (
            <NextTaskWiring
              title={
                result.option
                  ? `Option "${result.option}" has no next task`
                  : "This threshold has no next task"
              }
              contextState={decisionWiringContext(current, result)}
              tasks={tasks}
              disabled={anyBusy}
              onWired={onWired}
            />
          )}
          renderUserDecisionOptionWiring={({
            option,
            draft: current,
            onWired,
          }) => (
            <NextTaskWiring
              title={`Option "${option.label}" has no next task`}
              contextState={userDecisionWiringContext(current, option)}
              tasks={tasks}
              disabled={anyBusy}
              onWired={onWired}
            />
          )}
          renderToolNextWiring={({ draft: current, onWired, onEndFlow }) => (
            <NextTaskWiring
              title="What should happen after this tool?"
              description="This tool produces output. Choose another task or tool, or end the flow here."
              contextState={toolWiringContext(current)}
              tasks={tasks}
              disabled={anyBusy}
              value={current.fallbackTaskId}
              onWired={onWired}
              onEndFlow={onEndFlow}
            />
          )}
        />

        <Field>
          <FieldLabel>Refine this draft</FieldLabel>
          <Textarea
            value={draftPrompt}
            disabled={anyBusy}
            placeholder="For example: make the prompt shorter and target the review task."
            onChange={(event) => setDraftPrompt(event.target.value)}
          />
        </Field>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={anyBusy || !draftPrompt.trim()}
            onClick={() => {
              void refineDraft(draftPrompt);
              setDraftPrompt("");
            }}
          >
            {busy === "refineDraft" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            Refine draft
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={anyBusy}
            onClick={() => void confirmDraft(false)}
          >
            {busy === "confirm" ? <Spinner /> : <Wrench />}
            {buildMode ? "Create task" : "Create only"}
          </Button>
          {buildMode ? null : (
            <Button
              type="button"
              disabled={anyBusy || !runnable}
              title={
                runnable
                  ? undefined
                  : "This draft needs a result target or at least one option before it can run."
              }
              onClick={() => void confirmDraft(true)}
            >
              {busy === "confirm" ? <Spinner /> : <Play />}
              Create and run
            </Button>
          )}
        </div>
        {!buildMode && !runnable ? (
          <FieldDescription>
            Fix the warning above, or use “Create only” and finish it in the
            task builder.
          </FieldDescription>
        ) : null}
      </div>
    );
  }

  if (!proposal) {
    return notice ? (
      <div className={embedded ? "" : "mt-3 rounded-lg border bg-card p-3"}>
        <FieldDescription>{notice}</FieldDescription>
      </div>
    ) : null;
  }

  return (
    <div className={shell}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Suggested starting step</p>
          <FieldDescription>{proposal.reason}</FieldDescription>
          {proposal.model ? (
            <FieldDescription>
              Local decision model: {proposal.model}
            </FieldDescription>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={anyBusy}
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {proposal.candidates.map((candidate) => {
          const selected = candidate.key === selectedCandidate?.key;
          return (
            <button
              key={candidate.key}
              type="button"
              disabled={anyBusy}
              onClick={() => selectCandidate(candidate.key)}
              className={`flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted"
              }`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {candidate.label}
                  {candidate.key === proposal.recommendedKey ? (
                    <Badge variant="secondary">Recommended</Badge>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {flowKindLabel(candidate.kind)} — {candidate.description}
                </span>
              </span>
              <ConfidenceBadge confidence={candidate.confidence} />
            </button>
          );
        })}
      </div>

      <Field>
        <FieldLabel>Refine the proposal</FieldLabel>
        <Textarea
          value={proposalPrompt}
          disabled={anyBusy}
          placeholder="For example: use the review flow instead of starting a new task."
          onChange={(event) => setProposalPrompt(event.target.value)}
        />
      </Field>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={anyBusy || !proposalPrompt.trim()}
          onClick={() => {
            void refineProposal(proposalPrompt);
            setProposalPrompt("");
          }}
        >
          {busy === "refine" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Sparkles />
          )}
          Refine proposal
        </Button>
        {selectedCandidate ? (
          <Button
            type="button"
            disabled={anyBusy}
            onClick={() => void buildCandidate(selectedCandidate)}
          >
            {busy === "draft" || busy === "confirm" ? (
              <Spinner />
            ) : isNewKind(selectedCandidate.kind) || buildMode ? (
              <Wrench />
            ) : (
              <Play />
            )}
            {isNewKind(selectedCandidate.kind)
              ? "Build this task"
              : buildMode
                ? "Edit this task"
                : "Start this task"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
