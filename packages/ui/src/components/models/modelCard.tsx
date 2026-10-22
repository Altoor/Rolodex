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
import { useSubscription } from "@apollo/client/react";

import { PULL_MODEL } from "@repo/queries/model/model-subscriptions";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

interface ModelCardProps {
  name: string;
  size: bigint;
}

export default function ModelCard({ name, size }: ModelCardProps) {
  const [_, refresh] = useState("");

  console.log(name);

  const { data, error, loading } = useSubscription(PULL_MODEL, {
    variables: { name: "tev1:4b" },
  });

  return (
    <Item>
      <ItemContent>
        <ItemTitle className="line-clamp-1">
          {name} -{" "}
          <span className="text-muted-foreground">
            {data?.installModel?.status}
          </span>
        </ItemTitle>
        <ItemDescription>
          {error ? error.message : "size: " + { size }}
        </ItemDescription>
      </ItemContent>

      <ItemActions>
        <Button onClick={() => refresh("")}>
          {loading ? <Spinner /> : <RotateCcw />}
        </Button>
      </ItemActions>
    </Item>
  );
}
