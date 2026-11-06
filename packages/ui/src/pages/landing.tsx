"use client";

import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { CREATE_QUEUED_TASK } from "@repo/queries/tasks/task-mutations";
import { QUEUED_TASK_EVENT } from "@repo/queries/tasks/task-subscriptions";
import { ACTIVE_QUEUED_TASKS, TASKS } from "@repo/queries/tasks/task-queries";
import { useAuth } from "../components/auth/auth-provider";
import { EmptyState } from "#components/feedback/empty-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import { Circle, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  branch?: "result" | "fallback" | "tool" | "none";
  nextTaskId?: number | null;
  summary?: string;
  note?: string;
  output?: unknown;
}

interface QueuedTaskStep {
  id: number;
  taskId: number | null;
  status: "queued" | "running" | "completed" | "failed";
  runId: string;
  result: StepResult | null;
  model: string | null;
  decisionModel: string | null;
  task: { id: number | null; name: string | null; type: string | null } | null;
}

interface QueuedTaskRow {
  id: number | null;
  taskId: number | null;
  status: "queued" | "running" | "completed" | "failed" | null;
  runId: string | null;
  result: unknown;
  model: string | null;
  decisionModel: string | null;
  task: { id: number | null; name: string | null; type: string | null } | null;
}

function toStep(row: QueuedTaskRow): QueuedTaskStep | null {
  if (row.id == null || !row.runId) return null;

  return {
    id: row.id,
    taskId: row.taskId ?? null,
    status: row.status ?? "queued",
    runId: row.runId,
    result: (row.result as StepResult | null) ?? null,
    model: row.model ?? null,
    decisionModel: row.decisionModel ?? null,
    task: row.task ?? null,
  };
}

function upsertStep(
  steps: QueuedTaskStep[],
  step: QueuedTaskStep,
): QueuedTaskStep[] {
  const index = steps.findIndex((s) => s.id === step.id);
  if (index === -1) return [...steps, step].sort((a, b) => a.id - b.id);

  const next = [...steps];
  next[index] = step;
  return next;
}

export default function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const loggedIn = !!user;

  const { data: tasksData, loading: tasksLoading } = useQuery(TASKS, {
    skip: !loggedIn,
  });
  const tasks = useMemo(() => tasksData?.tasks ?? [], [tasksData]);

  const [createQueuedTask] = useMutation(CREATE_QUEUED_TASK);

  // Live steps for every run the current user has in flight. Completed steps of
  // an active run stay here so each chain-of-thought keeps its history.
  const [liveRunState, setLiveRunState] = useState<{
    userId: number | null;
    steps: QueuedTaskStep[];
  }>({ userId: null, steps: [] });
  const [openRuns, setOpenRuns] = useState<Record<string, boolean>>({});
  const userId = user?.id ?? null;

  const addLiveStep = (step: QueuedTaskStep) => {
    setLiveRunState((prev) => ({
      userId,
      // Never mix steps from a previous session/user.
      steps: upsertStep(prev.userId === userId ? prev.steps : [], step),
    }));
  };

  // Active runs may already exist when the page loads (another tab, a refresh,
  // or a run queued before this page mounted). Seed them from the backend;
  // live updates arrive through the subscription below.
  const { data: activeData } = useQuery(ACTIVE_QUEUED_TASKS, {
    skip: !loggedIn,
    fetchPolicy: "network-only",
  });

  const steps = useMemo(() => {
    const byId = new Map<number, QueuedTaskStep>();

    for (const row of activeData?.activeQueuedTasks ?? []) {
      const step = toStep(row);
      if (step) byId.set(step.id, step);
    }

    // Live events are always fresher than the query snapshot.
    if (liveRunState.userId === userId) {
      for (const step of liveRunState.steps) byId.set(step.id, step);
    }

    return [...byId.values()].sort((a, b) => a.id - b.id);
  }, [activeData, liveRunState, userId]);

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
      if (!event) return;
      // The backend already filters per user; keep the guard for safety.
      if (event.queued_by != null && event.queued_by !== user?.id) return;

      const step = toStep(event);
      if (!step) return;

      addLiveStep(step);
    },
  });

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    const { data } = await createQueuedTask({
      variables: {
        taskId: parseInt(inputs.taskId, 10),
        state: inputs.state.trim(),
      },
    });

    const step = data?.createQueuedTask ? toStep(data.createQueuedTask) : null;
    if (!step) return;

    // Show the new run immediately, before the processor emits its first event.
    addLiveStep(step);
    setOpenRuns((prev) => ({ ...prev, [step.runId]: true }));
    reset({ state: "", taskId: inputs.taskId });
  };

  const submit = (event?: React.FormEvent<HTMLFormElement>) => {
    void handleSubmit(onSubmit)(event);
  };

  // Enter submits, Shift+Enter inserts a newline.
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const taskName = (id: number | null | undefined) =>
    id != null ? (tasks.find((t) => t.id === id)?.name ?? `task ${id}`) : null;

  const runs = useMemo(() => {
    const byRun = new Map<string, QueuedTaskStep[]>();

    for (const step of steps) {
      const runSteps = byRun.get(step.runId);
      if (runSteps) runSteps.push(step);
      else byRun.set(step.runId, [step]);
    }

    return [...byRun.entries()]
      .map(([runId, runSteps]) => {
        const ordered = [...runSteps].sort((a, b) => a.id - b.id);

        return {
          runId,
          steps: ordered,
          startTaskId: ordered[0]?.taskId ?? null,
          pending: ordered.some(
            (step) => step.status === "queued" || step.status === "running",
          ),
          failed: ordered.some((step) => step.status === "failed"),
        };
      })
      .sort((a, b) => (a.steps[0]?.id ?? 0) - (b.steps[0]?.id ?? 0));
  }, [steps]);

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
        <CardFooter className="flex-col items-stretch gap-3">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No runs yet. Submit a state above to start one.
            </p>
          ) : (
            runs.map((run) => {
              const startName = taskName(run.startTaskId);
              const headerStatus = run.failed
                ? ("error" as const)
                : run.pending
                  ? ("running" as const)
                  : undefined;

              return (
                <ChainOfThought
                  key={run.runId}
                  open={run.pending ? true : (openRuns[run.runId] ?? true)}
                  onOpenChange={(open) =>
                    setOpenRuns((prev) => ({ ...prev, [run.runId]: open }))
                  }
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
                      run.failed
                        ? `Run failed${startName ? ` — ${startName}` : ""}`
                        : run.pending
                          ? `Working${startName ? ` on ${startName}` : ""}`
                          : `Finished in ${run.steps.length} step${
                              run.steps.length === 1 ? "" : "s"
                            }${startName ? ` — ${startName}` : ""}`
                    }
                  />
                  <ChainOfThoughtContent>
                    {run.steps.map((step) => {
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
                            : step.result?.branch === "tool"
                              ? step.result.nextTaskId != null
                                ? `next: ${taskName(step.result.nextTaskId)}`
                                : "tool result"
                              : undefined;

                      const detail =
                        [
                          step.result?.summary,
                          step.result?.note,
                          step.model ? `generation: ${step.model}` : null,
                          step.decisionModel
                            ? `decision: ${step.decisionModel}`
                            : null,
                        ]
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
                              step.task?.name ??
                              `task ${step.taskId ?? step.id}`
                            }
                            description={branch}
                          />
                          {detail ? (
                            <p className="ml-6 text-xs text-muted-foreground">
                              {detail}
                            </p>
                          ) : null}
                          {step.result?.output != null ? (
                            <details className="ml-6 text-xs text-muted-foreground">
                              <summary className="cursor-pointer select-none">
                                Tool output
                              </summary>
                              <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-muted p-2 text-xs">
                                {JSON.stringify(step.result.output, null, 2)}
                              </pre>
                            </details>
                          ) : null}
                        </div>
                      );
                    })}
                  </ChainOfThoughtContent>
                </ChainOfThought>
              );
            })
          )}
        </CardFooter>
      </Card>
    </PageContainer>
  );
}
