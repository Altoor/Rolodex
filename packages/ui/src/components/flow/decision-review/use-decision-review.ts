"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  DECISION_REVIEW,
  REVIEW_DECISION_STEP,
} from "@repo/queries/flow/decision-review";
import type { DecisionReviewQuery } from "@repo/queries/__generated__/graphql";
import { useState } from "react";

export type DecisionReviewContext = NonNullable<
  DecisionReviewQuery["decisionReview"]
>;

interface UseDecisionReviewArgs {
  queuedTaskId: number;
  enabled: boolean;
}

/**
 * Loads the review context for one completed decision step and submits the
 * user's correction. Biases are applied by the backend.
 */
export function useDecisionReview({
  queuedTaskId,
  enabled,
}: UseDecisionReviewArgs) {
  const { data, loading, error, refetch } = useQuery(DECISION_REVIEW, {
    variables: { queuedTaskId },
    skip: !enabled,
    fetchPolicy: "network-only",
  });
  const [reviewDecision, { loading: saving, error: saveError }] = useMutation(
    REVIEW_DECISION_STEP,
  );
  const [reviewed, setReviewed] = useState(false);

  const submit = async (correct: boolean, actualResultId: number | null) => {
    const { data: result } = await reviewDecision({
      variables: {
        queuedTaskId,
        correct,
        actualResultId,
      },
    });
    setReviewed(true);
    return result?.reviewDecisionStep?.review ?? null;
  };

  return {
    context: (data?.decisionReview ?? null) as DecisionReviewContext | null,
    loading,
    error,
    saving,
    saveError,
    reviewed,
    submit,
    refetch,
  };
}
