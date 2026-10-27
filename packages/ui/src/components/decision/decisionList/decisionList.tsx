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
import { useQuery } from "@apollo/client/react";
import { DECISIONS } from "@repo/queries/decisions/decision-queries";
import { Pencil, X } from "lucide-react";

interface DecisionListProps {
  setSelectedDecisionId: (id: number | undefined) => void;
  selectedDecisionId: number | undefined;
}

const DecisionList = ({
  selectedDecisionId,
  setSelectedDecisionId,
}: DecisionListProps) => {
  const { loading, error, data } = useQuery(DECISIONS);

  return (
    <div className="flex flex-col">
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
                onClick={() =>
                  decision.id !== selectedDecisionId
                    ? setSelectedDecisionId(decision.id ?? undefined)
                    : setSelectedDecisionId(undefined)
                }
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
    </div>
  );
};

export default DecisionList;
