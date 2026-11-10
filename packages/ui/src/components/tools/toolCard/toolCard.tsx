"use client";

import { Card, CardContent } from "#components/ui/card";
import { FormProvider, useForm } from "react-hook-form";
import type { ToolView } from "./tool-test-service";
import {
  buildTestToolVariables,
  ToolTestInputError,
  type ToolTestInputs,
} from "./tool-test-service";
import ToolCardHeader from "./components/toolCardHeader";
import ToolTestForm from "./components/toolTestForm";
import ToolTestResult from "./components/toolTestResult";
import { useToolTest } from "./hooks/useToolTest";

interface ToolCardProps {
  tool: ToolView;
}

export default function ToolCard({ tool }: ToolCardProps) {
  const { testTool, data, error, loading } = useToolTest();

  const methods = useForm<ToolTestInputs>({
    defaultValues: {
      state: "",
      toolConfig: tool.exampleConfig
        ? JSON.stringify(tool.exampleConfig, null, 2)
        : "",
      toolState: "[]",
      outputType: "normal",
      model: "",
      decisionModel: "",
    },
  });

  const onSubmit = methods.handleSubmit(async (inputs) => {
    try {
      await testTool({ variables: buildTestToolVariables(tool, inputs) });
    } catch (err) {
      if (err instanceof ToolTestInputError) {
        methods.setError(err.field, { message: err.message });
        return;
      }

      methods.setError("root", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return (
    <Card>
      <ToolCardHeader tool={tool} />

      <CardContent className="flex flex-col gap-4">
        <FormProvider {...methods}>
          <ToolTestForm
            tool={tool}
            onSubmit={onSubmit}
            loading={loading}
            error={error}
          />
        </FormProvider>

        <ToolTestResult tool={tool} result={data?.testTool} />
      </CardContent>
    </Card>
  );
}
