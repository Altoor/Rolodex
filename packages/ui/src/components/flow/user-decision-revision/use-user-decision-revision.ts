"use client";

import { useMutation } from "@apollo/client/react";
import {
  CREATE_USER_DECISION_OPTIONS,
  REFRESH_USER_DECISION_OPTIONS,
  SUGGEST_USER_DECISION_OPTIONS,
} from "@repo/queries/flow/user-decision-revision";
import { useState } from "react";

export interface UserDecisionOptionDraft {
  label: string;
  description: string | null;
  value: string;
  resultTaskId: number | null;
  resultTaskName: string | null;
}

interface UseUserDecisionRevisionArgs {
  taskId: number;
  queuedTaskId: number;
  awaitingInput: boolean;
}

/**
 * Suggests, creates, and (when the step is still waiting) refreshes the static
 * options of a user-decision task.
 */
export function useUserDecisionRevision({
  taskId,
  queuedTaskId,
  awaitingInput,
}: UseUserDecisionRevisionArgs) {
  const [suggestMutation, { loading: suggesting, error: suggestError }] =
    useMutation(SUGGEST_USER_DECISION_OPTIONS);
  const [createMutation, { loading: creating, error: createError }] =
    useMutation(CREATE_USER_DECISION_OPTIONS);
  const [refreshMutation, { loading: refreshing, error: refreshError }] =
    useMutation(REFRESH_USER_DECISION_OPTIONS);
  const [refreshed, setRefreshed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const suggest = async (
    prompt: string,
    state: string | null,
  ): Promise<UserDecisionOptionDraft[]> => {
    const { data } = await suggestMutation({
      variables: { taskId, prompt, state },
    });

    return (data?.suggestUserDecisionOptions ?? []).flatMap((option) => {
      if (!option?.label) return [];
      return [
        {
          label: option.label,
          description: option.description ?? null,
          value: option.value ?? "",
          resultTaskId: option.resultTaskId ?? null,
          resultTaskName: option.resultTaskName ?? null,
        },
      ];
    });
  };

  const create = async (options: UserDecisionOptionDraft[]) => {
    const { data } = await createMutation({
      variables: {
        taskId,
        options: options.map((option) => ({
          label: option.label,
          description: option.description,
          value: option.value,
          resultTaskId: option.resultTaskId,
        })),
      },
    });

    if (awaitingInput) {
      await refreshMutation({ variables: { queuedTaskId } });
      setRefreshed(true);
      setNotice("The new options are now available in this run.");
    } else {
      setNotice("Added. The new options will be used by the next run.");
    }

    return data?.createUserDecisionOptions ?? [];
  };

  return {
    suggest,
    create,
    suggesting,
    creating,
    refreshing,
    error: suggestError ?? createError ?? refreshError,
    refreshed,
    notice,
  };
}
