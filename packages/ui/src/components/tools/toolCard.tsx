"use client";

import { useMutation } from "@apollo/client/react";
import type { GetToolsQuery } from "@repo/queries/__generated__/graphql";
import { TEST_TOOL } from "@repo/queries/tools/tool-mutations";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { Input } from "#components/ui/input";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "#components/ui/accordion";
import { Block } from "#components/blocks/block";
import { ToolDetails } from "#components/tools/toolDetails";
import { SubmitHandler, useForm } from "react-hook-form";

interface ToolCardProps {
  tool: NonNullable<GetToolsQuery["tools"]>[number];
}

type Inputs = {
  state: string;
  toolConfig: string;
  model: string;
  decisionModel: string;
};

const parseToolConfig = (value: string): Record<string, unknown> | null => {
  if (!value.trim()) return null;

  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("toolConfig must be a JSON object");
  }

  return parsed as Record<string, unknown>;
};

export default function ToolCard({ tool }: ToolCardProps) {
  const [testTool, { data, error, loading }] = useMutation(TEST_TOOL);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Inputs>({
    defaultValues: {
      state: "",
      toolConfig: tool.exampleConfig
        ? JSON.stringify(tool.exampleConfig, null, 2)
        : "",
      model: "",
      decisionModel: "",
    },
  });

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    let toolConfig: Record<string, unknown> | null;

    try {
      toolConfig = parseToolConfig(inputs.toolConfig);
    } catch (err) {
      setError("toolConfig", {
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (!tool.key) {
      setError("root", { message: "Tool has no key" });
      return;
    }

    await testTool({
      variables: {
        key: tool.key,
        state: inputs.state,
        toolConfig,
        model: inputs.model.trim() || null,
        decisionModel: inputs.decisionModel.trim() || null,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{tool.name ?? "Unnamed tool"}</CardTitle>
          <Badge variant="secondary">{tool.key}</Badge>
          <Badge variant="outline">{tool.category}</Badge>
        </div>
        <CardDescription>{tool.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`tool-${tool.key}-state`}>State</FieldLabel>
              <Textarea
                id={`tool-${tool.key}-state`}
                placeholder="The input passed to the tool."
                {...register("state", { required: "state is required" })}
              />
              <FieldError errors={[errors.state]} />
            </Field>

            <Accordion keepMounted>
              <AccordionItem value="details">
                <AccordionTrigger>Tool details</AccordionTrigger>
                <AccordionPanel className="pb-3">
                  <ToolDetails tool={tool} showDescription={false} />
                </AccordionPanel>
              </AccordionItem>

              <AccordionItem value="options">
                <AccordionTrigger>Advanced options</AccordionTrigger>
                <AccordionPanel className="pb-3">
                  <FieldGroup className="gap-4">
                    <Field>
                      <FieldLabel htmlFor={`tool-${tool.key}-config`}>
                        Tool config (JSON)
                      </FieldLabel>
                      <Textarea
                        id={`tool-${tool.key}-config`}
                        placeholder="Optional JSON object."
                        {...register("toolConfig")}
                      />
                      <FieldDescription>
                        Optional JSON object. The state above is also passed to
                        the tool.
                      </FieldDescription>
                      <FieldError errors={[errors.toolConfig]} />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`tool-${tool.key}-model`}>
                        Generation model (optional)
                      </FieldLabel>
                      <Input
                        id={`tool-${tool.key}-model`}
                        placeholder="Use your default generation model"
                        {...register("model")}
                      />
                      <FieldDescription>
                        Used by prompt-style tools. Leave blank to use your
                        default generation model.
                      </FieldDescription>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`tool-${tool.key}-decision-model`}>
                        Decision model (optional)
                      </FieldLabel>
                      <Input
                        id={`tool-${tool.key}-decision-model`}
                        placeholder="Use your default decision model"
                        {...register("decisionModel")}
                      />
                      <FieldDescription>
                        Used by decision tasks and todo selection. Leave blank
                        to use your default decision model.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>

            <Field>
              <FieldDescription>
                Running a tool can create, update, or delete real data.
              </FieldDescription>
              <Button type="submit" disabled={loading} className="w-fit">
                {loading ? <Spinner /> : "Run tool"}
              </Button>
              <FieldError
                errors={[
                  errors.root,
                  error ? { message: error.message } : undefined,
                ]}
              />
            </Field>
          </FieldGroup>
        </form>

        {data?.testTool ? (
          <Accordion
            key={`${data.testTool.summary}:${JSON.stringify(data.testTool.output)}`}
            defaultValue={["result"]}
          >
            <AccordionItem value="result">
              <AccordionTrigger>Result</AccordionTrigger>
              <AccordionPanel className="flex flex-col gap-2 pb-3">
                <p className="text-sm text-muted-foreground">
                  {data.testTool.summary}
                </p>
                <Block toolKey={tool.key} output={data.testTool.output} />
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        ) : null}
      </CardContent>
    </Card>
  );
}
