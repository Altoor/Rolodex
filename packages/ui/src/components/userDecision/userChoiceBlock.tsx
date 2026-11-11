"use client";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";

export type PendingChoiceType = "yesNo" | "list" | "dropdown";

export interface PendingChoiceOption {
  id: string;
  label: string;
  description?: string;
  value?: unknown;
  resultTaskId?: number | null;
  appendState?: boolean;
  source?: "static" | "dynamic" | "decisionResult";
}

export interface PendingChoice {
  kind: "userDecision" | "decisionOutput";
  taskId: number;
  prompt: string;
  choiceType: PendingChoiceType;
  acceptLabel: string;
  recommendedOptionId?: string | null;
  options: PendingChoiceOption[];
}

interface UserChoiceBlockProps {
  choice: PendingChoice;
  onAnswer: (optionId: string) => void | Promise<void>;
  answering?: boolean;
  error?: string | null;
}

const OptionButton = ({
  option,
  recommended,
  disabled,
  onClick,
}: {
  option: PendingChoiceOption;
  recommended: boolean;
  disabled: boolean;
  onClick: () => void;
}) => (
  <Button
    type="button"
    variant={recommended ? "default" : "outline"}
    className="h-auto w-full flex-col items-start gap-1 px-3 py-2 text-left"
    disabled={disabled}
    onClick={onClick}
  >
    <span className="flex w-full items-center justify-between gap-2">
      <span>{option.label}</span>
      {recommended ? (
        <Badge variant="secondary" className="shrink-0">
          Recommended
        </Badge>
      ) : null}
    </span>
    {option.description ? (
      <span className="text-xs font-normal text-muted-foreground">
        {option.description}
      </span>
    ) : null}
  </Button>
);

const UserChoiceBlock = ({
  choice,
  onAnswer,
  answering = false,
  error,
}: UserChoiceBlockProps) => {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    choice.recommendedOptionId ?? choice.options[0]?.id,
  );

  const answer = (optionId: string | undefined) => {
    if (!optionId || answering) return;
    void onAnswer(optionId);
  };

  return (
    <div className="ml-6 mt-2 flex w-full max-w-md flex-col gap-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-medium">{choice.prompt}</p>

      {choice.choiceType === "dropdown" ? (
        <div className="flex gap-2">
          <Select
            value={selectedId}
            onValueChange={(value) => setSelectedId(value ?? undefined)}
            disabled={answering}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {choice.options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                    {option.id === choice.recommendedOptionId
                      ? " · recommended"
                      : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={answering || !selectedId}
            onClick={() => answer(selectedId)}
          >
            {answering ? <LoaderCircle className="animate-spin" /> : <Check />}
            {choice.acceptLabel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {choice.options.map((option) => (
            <OptionButton
              key={option.id}
              option={option}
              recommended={option.id === choice.recommendedOptionId}
              disabled={answering}
              onClick={() => answer(option.id)}
            />
          ))}
        </div>
      )}

      {answering ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" />
          Saving your choice…
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
};

export default UserChoiceBlock;
