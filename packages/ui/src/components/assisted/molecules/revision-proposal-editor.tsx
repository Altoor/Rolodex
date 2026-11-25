"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Field, FieldLabel } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import type { RevisionProposal } from "../types";

interface RevisionProposalEditorProps {
  attemptId: number;
  busy: string | null;
  proposal: RevisionProposal;
  onApplyRevision: (attemptId: number, proposal: RevisionProposal) => void;
}

/** Editable JSON view of a model-proposed repair. */
export function RevisionProposalEditor({
  attemptId,
  busy,
  proposal,
  onApplyRevision,
}: RevisionProposalEditorProps) {
  const [draftProposal, setDraftProposal] = useState("");
  const busyApply = busy === `apply:${attemptId}`;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{proposal.kind}</Badge>
        <span className="text-sm">{proposal.explanation}</span>
      </div>
      <Field>
        <FieldLabel htmlFor={`proposal-${attemptId}`}>
          Editable proposal
        </FieldLabel>
        <Textarea
          id={`proposal-${attemptId}`}
          className="font-mono text-xs"
          value={draftProposal || JSON.stringify(proposal, null, 2)}
          onChange={(event) => setDraftProposal(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busyApply}
          onClick={() => {
            try {
              const parsed = JSON.parse(
                draftProposal || JSON.stringify(proposal),
              ) as RevisionProposal;
              onApplyRevision(attemptId, parsed);
            } catch {
              // Keep the text so the user can fix the JSON.
            }
          }}
        >
          {busyApply ? <Spinner /> : <Sparkles />}
          Try this
        </Button>
      </div>
    </div>
  );
}
