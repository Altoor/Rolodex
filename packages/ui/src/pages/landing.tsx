"use client";

import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { CREATE_QUEUED_TASK } from "@repo/queries/tasks/task-mutations";
import { QUEUED_TASK_EVENT } from "@repo/queries/tasks/task-subscriptions";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useAuth } from "../components/auth/auth-provider";
import { EmptyState } from "#components/feedback/empty-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import { Circle, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";

import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  type StepStatus,
} from "#components/ui/chain-of-thought";
import { Field, FieldLabel } from "#components/ui/field";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";

type Inputs = {
  taskId: string;
  state: string;
};

/** The executor stores this on each step's `result` column. */
interface StepResult {
  branch?: "result" | "fallback" | "none";
  nextTaskId?: number | null;
  summary?: string;
  note?: string;
}

interface QueuedTaskStep {
  id: number;
  taskId: number | null;
  status: "queued" | "running" | "completed" | "failed";
  runId: string;
  result: StepResult | null;
  task: { id: number | null; name: string | null; type: string | null } | null;
}

export default function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const loggedIn = !!user;

  const { data: tasksData, loading: tasksLoading } = useQuery(TASKS, {
    skip: !loggedIn,
  });
  const tasks = useMemo(() => tasksData?.tasks ?? [], [tasksData]);

  const [createQueuedTask] = useMutation(CREATE_QUEUED_TASK);

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const setActiveRun = (runId: string | null) => {
    activeRunIdRef.current = runId;
    setActiveRunId(runId);
  };
  const [steps, setSteps] = useState<QueuedTaskStep[]>([]);
  const [cotOpen, setCotOpen] = useState(true);

  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { isSubmitting },
  } = useForm<Inputs>({
    defaultValues: { taskId: "-1", state: "" },
  });

  const defaultTaskId = user?.settings?.defaultTaskId ?? null;

  useEffect(() => {
    if (tasksLoading || tasks.length === 0) return;

    const currentTaskId = getValues("taskId");
    if (tasks.some((task) => String(task.id) === currentTaskId)) return;

    const preferredTaskId =
      defaultTaskId != null && tasks.some((task) => task.id === defaultTaskId)
        ? defaultTaskId
        : tasks[0]?.id;

    if (preferredTaskId != null) {
      reset({ ...getValues(), taskId: String(preferredTaskId) });
    }
  }, [tasksLoading, tasks, defaultTaskId, getValues, reset]);

  useSubscription(QUEUED_TASK_EVENT, {
    skip: !loggedIn,
    onData: ({ data }) => {
      const event = data.data?.queuedTaskEvent?.queuedTask;
      if (!event || !event.runId) return;
      if (event.runId !== activeRunIdRef.current) return;

      const step: QueuedTaskStep = {
        id: event.id ?? -1,
        taskId: event.taskId ?? null,
        status: event.status ?? "queued",
        runId: event.runId,
        result: (event.result as StepResult | null) ?? null,
        task: event.task ?? null,
      };

      setSteps((prev) => {
        const index = prev.findIndex((s) => s.id === step.id);
        if (index === -1) return [...prev, step].sort((a, b) => a.id - b.id);
        const next = [...prev];
        next[index] = step;
        return next;
      });
    },
  });

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    const { data } = await createQueuedTask({
      variables: {
        taskId: parseInt(inputs.taskId, 10),
        state: inputs.state.trim(),
      },
    });

    const runId = data?.createQueuedTask?.runId;
    if (!runId) return;

    setActiveRun(runId);
    setSteps([]);
    setCotOpen(true);
    reset({ state: "", taskId: inputs.taskId });
  };

  const submit = () => {
    void handleSubmit(onSubmit)();
  };

  // Enter submits, Shift+Enter inserts a newline.
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  if (authLoading) {
    return (
      <PageContainer>
        <LoadingState label="Checking your session…" />
      </PageContainer>
    );
  }

  if (!loggedIn) {
    return (
      <PageContainer>
        <PageHeader
          title="What do you want to do today?"
          description="Rolodex runs decision-driven tasks with a local model."
        />
        <EmptyState
          title="Sign in to queue a run"
          description="Your tasks, decisions, and queue defaults are tied to your account."
          actionHref="/user"
          actionLabel="Go to account"
        />
      </PageContainer>
    );
  }

  const anyPending = steps.some(
    (s) => s.status === "queued" || s.status === "running",
  );
  const anyFailed = steps.some((s) => s.status === "failed");
  const headerStatus = anyFailed
    ? ("error" as const)
    : anyPending
      ? ("running" as const)
      : undefined;

  const taskName = (id: number | null | undefined) =>
    id != null ? (tasks.find((t) => t.id === id)?.name ?? `task ${id}`) : null;

  return (
    <PageContainer>
      <Card>
        <CardHeader>
          <CardTitle>What do you want to do today?</CardTitle>
          <CardDescription>
            Pick a starting task, describe the situation, and hit enter.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-32">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field>
              <FieldLabel>Starting task</FieldLabel>
              <SelectController
                name="taskId"
                control={control}
                rules={{ required: "select a starting task" }}
              >
                {(value, onChange) => (
                  <Select
                    value={value}
                    onValueChange={onChange}
                    disabled={!loggedIn || isSubmitting}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a starting task" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {tasks.map((task) => (
                          <SelectItem key={task.id} value={String(task.id)}>
                            {task.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </SelectController>
            </Field>
            <Field>
              <FieldLabel htmlFor="state">State</FieldLabel>
              <Textarea
                id="state"
                placeholder="Describe the situation…"
                onKeyDown={onKeyDown}
                disabled={!loggedIn || isSubmitting}
                {...register("state", { required: "describe the situation" })}
              />
            </Field>
            <Button type="submit" disabled={!loggedIn || isSubmitting}>
              {isSubmitting ? <Spinner /> : "Submit"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          {activeRunId ? (
            <ChainOfThought
              open={anyPending ? true : cotOpen}
              onOpenChange={setCotOpen}
            >
              <ChainOfThoughtHeader
                status={headerStatus}
                icon={
                  headerStatus === "error" ? (
                    <CircleAlert />
                  ) : headerStatus === "running" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CircleCheck />
                  )
                }
                title={
                  anyFailed
                    ? "Run failed"
                    : anyPending
                      ? "Working"
                      : `Finished in ${steps.length} step${
                          steps.length === 1 ? "" : "s"
                        }`
                }
              />
              <ChainOfThoughtContent>
                {steps.map((step) => {
                  const status: StepStatus =
                    step.status === "running"
                      ? "active"
                      : step.status === "queued"
                        ? "pending"
                        : step.status === "failed"
                          ? "error"
                          : "complete";

                  const branch =
                    step.result?.branch === "result"
                      ? `next: ${taskName(step.result.nextTaskId)}`
                      : step.result?.branch === "fallback"
                        ? `fallback: ${taskName(step.result.nextTaskId)}`
                        : undefined;

                  const detail =
                    [step.result?.summary, step.result?.note]
                      .filter((part): part is string => !!part)
                      .join(" — ") || undefined;

                  return (
                    <div
                      key={step.id}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <ChainOfThoughtStep
                        status={status}
                        icon={
                          status === "active" ? (
                            <LoaderCircle className="animate-spin" />
                          ) : status === "error" ? (
                            <CircleAlert />
                          ) : status === "complete" ? (
                            <CircleCheck />
                          ) : (
                            <Circle />
                          )
                        }
                        title={
                          step.task?.name ?? `task ${step.taskId ?? step.id}`
                        }
                        description={branch}
                      />
                      {detail ? (
                        <p className="ml-6 text-xs text-muted-foreground">
                          {detail}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </ChainOfThoughtContent>
            </ChainOfThought>
          ) : (
            <p className="text-sm text-muted-foreground">
              No run yet. Submit a state above to start one.
            </p>
          )}
        </CardFooter>
      </Card>
    </PageContainer>
  );
}
