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
import { useMutation, useQuery } from "@apollo/client/react";
import { DELETE_SYSTEM_ONE_PROMPT } from "@repo/queries/decisions/decision-mutations";
import { DECISIONS } from "@repo/queries/decisions/decision-queries";
import { Pencil, Plus, X } from "lucide-react";

interface DecisionListProps {
  setSelectedDecisionId: (id: number | undefined) => void;
  selectedDecisionId: number | undefined;
}

const DecisionList = ({
  selectedDecisionId,
  setSelectedDecisionId,
}: DecisionListProps) => {
  const { loading, error, data } = useQuery(DECISIONS);
  const [deleteDecision, { client }] = useMutation(DELETE_SYSTEM_ONE_PROMPT);

  return (
    <div className="flex flex-col gap-2">
      {loading ? (
        <Spinner />
      ) : (
        data &&
        data.decisions?.map((decision) => (
          <Item variant={"outline"} key={decision.id}>
            <ItemContent>
              <ItemTitle>{decision.name}</ItemTitle>{" "}
              <ItemDescription className="truncate">
                {decision.instruction}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                onClick={() => {
                  if (decision.id !== selectedDecisionId) {
                    setSelectedDecisionId(decision.id ?? undefined);
                  } else {
                    deleteDecision({ variables: { id: selectedDecisionId } });
                    client.refetchQueries({
                      include: [DECISIONS],
                    });
                  }
                }}
              >
                {decision.id === selectedDecisionId ? (
                  <X className="text-red-400" />
                ) : (
                  <Pencil />
                )}
              </Button>
            </ItemActions>
          </Item>
        ))
      )}
      <Button
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
