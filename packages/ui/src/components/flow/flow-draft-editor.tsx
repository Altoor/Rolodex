"use client";

import { useQuery } from "@apollo/client/react";
import { TOOLS } from "@repo/queries/tools/tool-queries";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Separator } from "#components/ui/separator";
import { Textarea } from "#components/ui/textarea";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  flowKindLabel,
  isDraftRunnable,
  type FlowDecisionResultDraft,
  type FlowTaskDraft,
  type FlowUserDecisionOptionDraft,
} from "./flow-model";
import { TaskTargetSelect } from "./task-target-select";
import type { LandingTask } from "../landing/landing-model";

interface DecisionResultWiringArgs {
  index: number;
  result: FlowDecisionResultDraft;
  draft: FlowTaskDraft;
  onWired: (targetTaskId: number) => void;
}

interface UserDecisionOptionWiringArgs {
  index: number;
  option: FlowUserDecisionOptionDraft;
  draft: FlowTaskDraft;
  onWired: (resultTaskId: number) => void;
}

interface ToolNextWiringArgs {
  draft: FlowTaskDraft;
  onWired: (taskId: number) => void;
  /** Called when the user decides the flow ends after this tool. */
  onEndFlow: () => void;
}

interface FlowTaskDraftEditorProps {
  draft: FlowTaskDraft;
  tasks: LandingTask[];
  disabled: boolean;
  onChange: (draft: FlowTaskDraft) => void;
  /** Slots that prompt for a next task when a decision result is unwired. */
  renderDecisionResultWiring?: (args: DecisionResultWiringArgs) => ReactNode;
  renderUserDecisionOptionWiring?: (
    args: UserDecisionOptionWiringArgs,
  ) => ReactNode;
  /** Slot that asks what runs after a tool task that produces output. */
  renderToolNextWiring?: (args: ToolNextWiringArgs) => ReactNode;
}

function toThreshold(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ThresholdInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="number"
        step="0.05"
        min="0"
        max="1"
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(toThreshold(event.target.value))}
      />
    </Field>
  );
}

function ToolConfigEditor({
  value,
  disabled,
  onChange,
}: {
  value: Record<string, unknown> | null;
  disabled: boolean;
  onChange: (value: Record<string, unknown> | null) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [previousValue, setPreviousValue] = useState(value);
  const [focused, setFocused] = useState(false);

  // Reset the text when the draft is replaced (for example by a refinement),
  // but never while the user is typing in the field.
  if (!focused && previousValue !== value) {
    setPreviousValue(value);
    setText(JSON.stringify(value ?? {}, null, 2));
    setError(null);
  }

  return (
    <Field>
      <FieldLabel>Tool config (JSON)</FieldLabel>
      <Textarea
        value={text}
        disabled={disabled}
        className="min-h-40 font-mono text-xs"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            const parsed: unknown = JSON.parse(next);
            if (
              typeof parsed !== "object" ||
              parsed === null ||
              Array.isArray(parsed)
            ) {
              throw new Error("The config must be a JSON object");
            }
            setError(null);
            onChange(parsed as Record<string, unknown>);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      {error ? <FieldDescription>{error}</FieldDescription> : null}
    </Field>
  );
}

/** Editable fields for a freshly generated task draft. */
export function FlowTaskDraftEditor({
  draft,
  tasks,
  disabled,
  onChange,
  renderDecisionResultWiring,
  renderUserDecisionOptionWiring,
  renderToolNextWiring,
}: FlowTaskDraftEditorProps) {
  const { data: toolsData } = useQuery(TOOLS);

  const update = (patch: Partial<FlowTaskDraft>) =>
    onChange({ ...draft, ...patch });

  const updateResult = (
    index: number,
    patch: Partial<FlowDecisionResultDraft>,
  ) => {
    if (!draft.decision) return;
    const results = draft.decision.results.map((result, resultIndex) =>
      resultIndex === index ? { ...result, ...patch } : result,
    );
    update({ decision: { ...draft.decision, results } });
  };

  const updateUserDecisionOption = (
    index: number,
    patch: Partial<FlowUserDecisionOptionDraft>,
  ) => {
    if (!draft.userDecision) return;
    const options = draft.userDecision.options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, ...patch } : option,
    );
    update({ userDecision: { ...draft.userDecision, options } });
  };

  const selectedTool = (toolsData?.tools ?? []).find(
    (tool) => tool.key != null && tool.key === draft.toolKey,
  );
  const toolHasOutput =
    draft.type === "tool" &&
    (selectedTool?.outputDescription ?? "").trim() !== "";

  const unwiredDecisionResults =
    renderDecisionResultWiring && draft.type === "decision"
      ? (draft.decision?.results.filter((result) => result.targetTaskId == null)
          .length ?? 0)
      : 0;
  const unwiredUserDecisionOptions =
    renderUserDecisionOptionWiring && draft.type === "userDecision"
      ? (draft.userDecision?.options.filter(
          (option) => option.resultTaskId == null,
        ).length ?? 0)
      : 0;
  const unwiredCount = unwiredDecisionResults + unwiredUserDecisionOptions;

  const runnable = isDraftRunnable(draft);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{flowKindLabel(draft.kind)}</Badge>
        {draft.model ? (
          <Badge variant="outline">drafted by {draft.model}</Badge>
        ) : null}
        {runnable ? (
          <Badge variant="outline">ready to run</Badge>
        ) : (
          <Badge variant="destructive">create only</Badge>
        )}
      </div>

      {unwiredCount > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3">
          <FieldDescription>
            {unwiredCount} option{unwiredCount === 1 ? "" : "s"} have no next
            task yet. Choose an existing task or define a new one for each.
          </FieldDescription>
        </div>
      ) : null}

      <Field>
        <FieldLabel>Task name</FieldLabel>
        <Input
          value={draft.name}
          disabled={disabled}
          onChange={(event) => update({ name: event.target.value })}
        />
      </Field>

      {draft.warnings.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3">
          {draft.warnings.map((warning) => (
            <FieldDescription key={warning}>{warning}</FieldDescription>
          ))}
        </div>
      ) : null}

      {draft.type === "tool" ? (
        <>
          <Field>
            <FieldLabel>Tool</FieldLabel>
            <Select
              value={draft.toolKey ?? ""}
              disabled={disabled}
              onValueChange={(value) => update({ toolKey: value ?? null })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a tool" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(toolsData?.tools ?? []).map((tool) => (
                    <SelectItem key={tool.key} value={tool.key ?? ""}>
                      {tool.name ?? tool.key}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Output type</FieldLabel>
            <Select
              value={draft.toolOutputType}
              disabled={disabled}
              onValueChange={(value) =>
                update({
                  toolOutputType: value === "foreach" ? "foreach" : "normal",
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="foreach">Foreach</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <ToolConfigEditor
            value={draft.toolConfig}
            disabled={disabled}
            onChange={(toolConfig) => update({ toolConfig })}
          />

          {renderToolNextWiring && toolHasOutput
            ? renderToolNextWiring({
                draft,
                onWired: (taskId) => update({ fallbackTaskId: taskId }),
                onEndFlow: () => update({ fallbackTaskId: null }),
              })
            : null}
        </>
      ) : null}

      {draft.type === "decision" && draft.decision ? (
        <>
          <Separator />
          <Field>
            <FieldLabel>Decision name</FieldLabel>
            <Input
              value={draft.decision.name}
              disabled={disabled}
              onChange={(event) =>
                update({
                  decision: { ...draft.decision!, name: event.target.value },
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>Decision type</FieldLabel>
            <Select
              value={draft.decision.type}
              disabled={disabled}
              onValueChange={(value) =>
                update({
                  decision: {
                    ...draft.decision!,
                    type:
                      value === "noul" || value === "score" ? value : "choice",
                  },
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="choice">Choice</SelectItem>
                  <SelectItem value="score">Score</SelectItem>
                  <SelectItem value="noul">Noul</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Premise</FieldLabel>
            <Input
              value={draft.decision.decisionPremise}
              disabled={disabled}
              onChange={(event) =>
                update({
                  decision: {
                    ...draft.decision!,
                    decisionPremise: event.target.value,
                  },
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>Instruction</FieldLabel>
            <Textarea
              value={draft.decision.instruction}
              disabled={disabled}
              onChange={(event) =>
                update({
                  decision: {
                    ...draft.decision!,
                    instruction: event.target.value,
                  },
                })
              }
            />
          </Field>

          {draft.decision.type !== "noul" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <FieldLabel>Options</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={disabled}
                  onClick={() =>
                    update({
                      decision: {
                        ...draft.decision!,
                        options: [
                          ...draft.decision!.options,
                          { name: "", description: "" },
                        ],
                      },
                    })
                  }
                >
                  <Plus /> Add option
                </Button>
              </div>
              {draft.decision.options.map((option, index) => (
                <div
                  key={index}
                  className="flex items-end gap-2 rounded-lg border p-2"
                >
                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      value={option.name}
                      disabled={disabled}
                      onChange={(event) => {
                        const options = draft.decision!.options.map(
                          (candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, name: event.target.value }
                              : candidate,
                        );
                        update({
                          decision: { ...draft.decision!, options },
                        });
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Description</FieldLabel>
                    <Input
                      value={option.description}
                      disabled={disabled}
                      onChange={(event) => {
                        const options = draft.decision!.options.map(
                          (candidate, candidateIndex) =>
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  description: event.target.value,
                                }
                              : candidate,
                        );
                        update({
                          decision: { ...draft.decision!, options },
                        });
                      }}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    onClick={() =>
                      update({
                        decision: {
                          ...draft.decision!,
                          options: draft.decision!.options.filter(
                            (_, candidateIndex) => candidateIndex !== index,
                          ),
                        },
                      })
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <FieldLabel>Results</FieldLabel>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                onClick={() =>
                  update({
                    decision: {
                      ...draft.decision!,
                      results: [
                        ...draft.decision!.results,
                        {
                          option: draft.decision!.options[0]?.name ?? null,
                          targetTaskId: null,
                          scoreThreshold:
                            draft.decision!.type === "score" ? 0.5 : null,
                          probabilityThreshold:
                            draft.decision!.type === "choice" ? 0.8 : null,
                          confidenceThreshold: null,
                        },
                      ],
                    },
                  })
                }
              >
                <Plus /> Add result
              </Button>
            </div>
            {draft.decision.results.map((result, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-lg border p-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  {draft.decision!.type !== "noul" ? (
                    <Field>
                      <FieldLabel>Option</FieldLabel>
                      <Select
                        value={result.option ?? ""}
                        disabled={disabled}
                        onValueChange={(value) =>
                          updateResult(index, { option: value ?? null })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {draft.decision!.options.map((option) => (
                              <SelectItem key={option.name} value={option.name}>
                                {option.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                  <Field>
                    <FieldLabel>Target task</FieldLabel>
                    <TaskTargetSelect
                      value={result.targetTaskId}
                      tasks={tasks}
                      disabled={disabled}
                      noneLabel="No target (create only)"
                      onChange={(targetTaskId) =>
                        updateResult(index, { targetTaskId })
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <ThresholdInput
                    label="Score ≥"
                    value={result.scoreThreshold}
                    disabled={disabled}
                    onChange={(scoreThreshold) =>
                      updateResult(index, { scoreThreshold })
                    }
                  />
                  <ThresholdInput
                    label="Probability ≥"
                    value={result.probabilityThreshold}
                    disabled={disabled}
                    onChange={(probabilityThreshold) =>
                      updateResult(index, { probabilityThreshold })
                    }
                  />
                  <ThresholdInput
                    label="Confidence ≥"
                    value={result.confidenceThreshold}
                    disabled={disabled}
                    onChange={(confidenceThreshold) =>
                      updateResult(index, { confidenceThreshold })
                    }
                  />
                </div>
                {result.targetTaskId == null
                  ? renderDecisionResultWiring?.({
                      index,
                      result,
                      draft,
                      onWired: (targetTaskId) =>
                        updateResult(index, { targetTaskId }),
                    })
                  : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {draft.type === "userDecision" && draft.userDecision ? (
        <>
          <Separator />
          <Field>
            <FieldLabel>Question</FieldLabel>
            <Textarea
              value={draft.userDecision.prompt}
              disabled={disabled}
              onChange={(event) =>
                update({
                  userDecision: {
                    ...draft.userDecision!,
                    prompt: event.target.value,
                  },
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel>Choice type</FieldLabel>
              <Select
                value={draft.userDecision.choiceType}
                disabled={disabled}
                onValueChange={(value) =>
                  update({
                    userDecision: {
                      ...draft.userDecision!,
                      choiceType:
                        value === "yesNo" || value === "dropdown"
                          ? value
                          : "list",
                    },
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="list">List</SelectItem>
                    <SelectItem value="dropdown">Dropdown</SelectItem>
                    <SelectItem value="yesNo">Yes / No</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Accept label</FieldLabel>
              <Input
                value={draft.userDecision.acceptLabel}
                disabled={disabled}
                onChange={(event) =>
                  update({
                    userDecision: {
                      ...draft.userDecision!,
                      acceptLabel: event.target.value,
                    },
                  })
                }
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <FieldLabel>Options</FieldLabel>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                onClick={() =>
                  update({
                    userDecision: {
                      ...draft.userDecision!,
                      options: [
                        ...draft.userDecision!.options,
                        {
                          label: "",
                          description: null,
                          value: "",
                          resultTaskId: null,
                        },
                      ],
                    },
                  })
                }
              >
                <Plus /> Add option
              </Button>
            </div>
            {draft.userDecision.options.map((option, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-lg border p-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <FieldLabel>Label</FieldLabel>
                    <Input
                      value={option.label}
                      disabled={disabled}
                      onChange={(event) => {
                        const options = draft.userDecision!.options.map(
                          (candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, label: event.target.value }
                              : candidate,
                        );
                        update({
                          userDecision: { ...draft.userDecision!, options },
                        });
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Machine value</FieldLabel>
                    <Input
                      value={option.value}
                      disabled={disabled}
                      onChange={(event) => {
                        const options = draft.userDecision!.options.map(
                          (candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, value: event.target.value }
                              : candidate,
                        );
                        update({
                          userDecision: { ...draft.userDecision!, options },
                        });
                      }}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Description</FieldLabel>
                  <Input
                    value={option.description ?? ""}
                    disabled={disabled}
                    onChange={(event) => {
                      const options = draft.userDecision!.options.map(
                        (candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                description: event.target.value || null,
                              }
                            : candidate,
                      );
                      update({
                        userDecision: { ...draft.userDecision!, options },
                      });
                    }}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Field>
                    <FieldLabel>Target task</FieldLabel>
                    <TaskTargetSelect
                      value={option.resultTaskId}
                      tasks={tasks}
                      disabled={disabled}
                      noneLabel="No target (end the run)"
                      onChange={(resultTaskId) =>
                        updateUserDecisionOption(index, { resultTaskId })
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    onClick={() =>
                      update({
                        userDecision: {
                          ...draft.userDecision!,
                          options: draft.userDecision!.options.filter(
                            (_, candidateIndex) => candidateIndex !== index,
                          ),
                        },
                      })
                    }
                  >
                    <X />
                  </Button>
                </div>
                {option.resultTaskId == null
                  ? renderUserDecisionOptionWiring?.({
                      index,
                      option,
                      draft,
                      onWired: (resultTaskId) =>
                        updateUserDecisionOption(index, { resultTaskId }),
                    })
                  : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
