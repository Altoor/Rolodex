"use client";

import { useQuery, useSubscription } from "@apollo/client/react";

import { PULL_MODEL } from "@repo/queries/model/model-subscriptions";
import { MODELS } from "@repo/queries/model/model-queries";
import ModelCard from "#components/models/modelCard";

export default function ModelsPage() {
  const { data } = useQuery(MODELS);

  return (
    <div className="flex h-full w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {data ? (
          data.models?.map((model) => {
            if (model.name && model.size) {
              return (
                <ModelCard
                  name={model.name}
                  size={model.size as bigint}
                  key={model.name}
                ></ModelCard>
              );
            }
          })
        ) : (
          <div>No models</div>
        )}
      </div>
    </div>
  );
}
