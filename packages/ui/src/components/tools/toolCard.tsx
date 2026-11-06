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
import { Separator } from "#components/ui/separator";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { Input } from "#components/ui/input";
import { SubmitHandler, useForm } from "react-hook-form";

interface ToolInputProperty {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

interface ToolInputSchema {
  properties?: Record<string, ToolInputProperty>;
  required?: string[];
}

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

  const schema = (tool.inputSchema ?? {}) as ToolInputSchema;
  const properties = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);

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
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <span className="font-medium">Input mode:</span> {tool.inputMode}
          </p>
          <p>
            <span className="font-medium">Output:</span>{" "}
            {tool.outputDescription}
          </p>
        </div>

        {properties.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Input schema</p>
            <ul className="flex flex-col gap-2 text-sm">
              {properties.map(([name, property]) => (
                <li key={name} className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium">
                      {name}
                    </span>
                    <Badge variant="outline">
                      {property.type ?? "unknown"}
                    </Badge>
                    {required.has(name) ? (
                      <Badge variant="destructive">required</Badge>
                    ) : null}
                  </div>
                  {property.description ? (
                    <p className="mt-1 text-muted-foreground">
                      {property.description}
                    </p>
                  ) : null}
                  {property.enum ? (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      enum: {property.enum.join(", ")}
                    </p>
                  ) : null}
                  {property.default !== undefined ? (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      default: {JSON.stringify(property.default)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Example config</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
            {tool.exampleConfig
              ? JSON.stringify(tool.exampleConfig, null, 2)
              : "No example config"}
          </pre>
        </div>

        <Separator />

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
                Optional JSON object. The state above is also passed to the
                tool.
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
                Used by prompt-style tools. Leave blank to use your default
                generation model.
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
                Used by decision tasks and todo selection. Leave blank to use
                your default decision model.
              </FieldDescription>
            </Field>

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
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Result</p>
            <p className="text-sm text-muted-foreground">
              {data.testTool.summary}
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(data.testTool.output, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
