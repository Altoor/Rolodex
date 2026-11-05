"use client";

import { Button } from "#components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "#components/ui/item";
import { Spinner } from "#components/ui/spinner";
import { EmptyState } from "#components/feedback/empty-state";
import { ErrorState } from "#components/feedback/error-state";
import { ConfirmButton } from "#components/feedback/confirm-button";
import { useMutation, useQuery } from "@apollo/client/react";
import { DELETE_SYSTEM_ONE_PROMPT } from "@repo/queries/decisions/decision-mutations";
import { DECISIONS } from "@repo/queries/decisions/decision-queries";
import { Pencil, Plus, Trash2 } from "lucide-react";

interface DecisionListProps {
  setSelectedDecisionId: (id: number | undefined) => void;
  selectedDecisionId: number | undefined;
}

const DecisionList = ({
  selectedDecisionId,
  setSelectedDecisionId,
}: DecisionListProps) => {
  const { loading, error, data } = useQuery(DECISIONS);
  const [deleteDecision, { loading: deleting }] = useMutation(
    DELETE_SYSTEM_ONE_PROMPT,
    {
      refetchQueries: [DECISIONS],
      awaitRefetchQueries: true,
    },
  );

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return <ErrorState title="Could not load decisions" error={error} />;
  }

  const decisions = data?.decisions ?? [];

  return (
    <div className="flex flex-col gap-2">
      {decisions.length === 0 ? (
        <EmptyState
          title="No decisions yet"
          description="Create a decision to describe how a task should choose its next step."
        />
      ) : (
        decisions.map((decision) => {
          const isSelected = decision.id === selectedDecisionId;

          return (
            <Item variant="outline" key={decision.id}>
              <ItemContent>
                <ItemTitle>{decision.name}</ItemTitle>
                <ItemDescription className="truncate">
                  {decision.instruction}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="flex-wrap">
                {isSelected && decision.id != null ? (
                  <ConfirmButton
                    title="Delete decision"
                    onConfirm={() => {
                      void deleteDecision({
                        variables: { id: decision.id as number },
                      }).then(({ error: deleteError }) => {
                        if (!deleteError) setSelectedDecisionId(undefined);
                      });
                    }}
                    disabled={deleting}
                  >
                    <Trash2 />
                  </ConfirmButton>
                ) : null}
                <Button
                  type="button"
                  variant={isSelected ? "secondary" : "ghost"}
                  size="icon-sm"
                  title={isSelected ? "Selected decision" : "Edit decision"}
                  aria-label={
                    isSelected ? "Selected decision" : "Edit decision"
                  }
                  onClick={() =>
                    setSelectedDecisionId(decision.id ?? undefined)
                  }
                >
                  <Pencil />
                </Button>
              </ItemActions>
            </Item>
          );
        })
      )}
      <Button
        type="button"
        onClick={() => {
          setSelectedDecisionId(undefined);
        }}
      >
        Create new decision <Plus />
      </Button>
    </div>
  );
};

export default DecisionList;
