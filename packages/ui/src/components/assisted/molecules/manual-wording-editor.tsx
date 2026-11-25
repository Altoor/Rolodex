"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import type { AssistedAttempt } from "../types";

interface ManualWordingEditorProps {
  decision: NonNullable<NonNullable<AssistedAttempt["taskSnapshot"]>["decision"]>;
  busy: boolean;
  onSubmit: (input: {
    decisionPremise: string;
    instruction: string;
    optionDescriptions?: string[];
  }) => void;
}

/** Manual wording fallback after the optimizer's attempt limit. */
export function ManualWordingEditor({
  decision,
  busy,
  onSubmit,
}: ManualWordingEditorProps) {
  const options = decision.options ?? [];
  const [premise, setPremise] = useState(decision.decisionPremise ?? "");
  const [instruction, setInstruction] = useState(decision.instruction ?? "");
  const [descriptions, setDescriptions] = useState<string[]>(
    options.map((_, index) => decision.optionDescriptions?.[index] ?? ""),
  );
  const premiseWords = premise.trim().split(/\s+/).filter(Boolean);
  const premiseValid = premiseWords.length > 0 && premiseWords.length <= 2;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <FieldDescription className="text-xs">
        Edit the wording yourself. Option names stay unchanged so the existing
        result wiring still matches.
      </FieldDescription>
      <Field>
        <FieldLabel htmlFor="manual-premise">Premise (one or two words)</FieldLabel>
        <Input
          id="manual-premise"
          value={premise}
          aria-invalid={!premiseValid}
          onChange={(event) => setPremise(event.target.value)}
        />
        {premiseValid ? null : (
          <FieldDescription className="text-xs text-destructive">
            Use one word, or at most two.
          </FieldDescription>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="manual-instruction">Instruction</FieldLabel>
        <Textarea
          id="manual-instruction"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
      </Field>
      {options.map((option, index) => (
        <Field key={`${option}-${index}`}>
          <FieldLabel htmlFor={`manual-option-${index}`}>
            {option} description
          </FieldLabel>
          <Input
            id={`manual-option-${index}`}
            value={descriptions[index] ?? ""}
            onChange={(event) =>
              setDescriptions((previous) =>
                previous.map((entry, entryIndex) =>
                  entryIndex === index ? event.target.value : entry,
                ),
              )
            }
          />
        </Field>
      ))}
      <div>
        <Button
          type="button"
          size="sm"
          disabled={busy || !premiseValid || !instruction.trim()}
          onClick={() =>
            onSubmit({
              decisionPremise: premise,
              instruction,
              optionDescriptions: descriptions,
            })
          }
        >
          {busy ? <Spinner /> : <Wand2 />}
          Apply wording and re-run
        </Button>
      </div>
    </div>
  );
}
