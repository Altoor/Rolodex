"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "#components/ui/button";
import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";

interface ToolReviewProps {
  attemptId: number;
  busy: string | null;
  onRequestRevision: (attemptId: number, feedback: string) => void;
  onAccept: (attemptId: number) => void;
}

/** Review controls for a tool attempt: describe the expected outcome or accept. */
export function ToolReview({
  attemptId,
  busy,
  onRequestRevision,
  onAccept,
}: ToolReviewProps) {
  const [feedback, setFeedback] = useState("");
  const busyAccept = busy === `accept:${attemptId}`;
  const busyRevise = busy === `revise:${attemptId}`;

  return (
    <div className="flex flex-col gap-2">
      <FieldDescription className="text-xs">
        Describe the outcome you expected. The model proposes a concrete
        repair and re-runs this step from the checkpoint.
      </FieldDescription>
      <Textarea
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder="For example: the folder should be called alphabet, not abc"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busyRevise || !feedback.trim()}
          onClick={() => onRequestRevision(attemptId, feedback)}
        >
          {busyRevise ? <Spinner /> : <RotateCcw />}
          Propose a repair
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busyAccept}
          onClick={() => onAccept(attemptId)}
        >
          {busyAccept ? <Spinner /> : <Check />}
          Accept step
        </Button>
      </div>
    </div>
  );
}
