import "dotenv/config";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  decisions,
  queuedTasks,
  runs,
  stepAttempts,
  taskResults,
  tasks,
  users,
} from "@repo/db";
import { acceptAttempt, overrideDecision } from "../assisted/application/accept-attempt";
import {
  addDecisionOption,
  optimizeDecision,
} from "../assisted/application/optimize-decision";
import { startAssistedRun } from "../assisted/application/start-run";
import { draftDecisionTargetTask } from "../assisted/application/next-task-draft";
import { createDecisionTargetTask } from "../assisted/application/wire-decision-target";

const marker = `assisted-decision-smoke-${Date.now()}`;
const DECISION_MODEL = process.env.SMOKE_DECISION_MODEL ?? "tev1:4b";
const extraTaskIds: number[] = [];

async function ensureUser(): Promise<number> {
  const [existing] = await db.select().from(users).limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      name: "Assisted Decision Smoke",
      email: `${marker}@example.test`,
      hashedPassword: "x",
    })
    .returning();
  if (!created) throw new Error("failed to create smoke user");
  return created.id;
}

async function waitForRunStatus(
  runId: string,
  statuses: string[],
  timeoutMs = 60_000,
) {
  const started = Date.now();
  for (;;) {
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    if (run && statuses.includes(run.status)) return run;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timed out waiting for run ${runId} status ${statuses.join("/")} (last ${run?.status})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function latestAttempt(stepId: number) {
  const [attempt] = await db
    .select()
    .from(stepAttempts)
    .where(eq(stepAttempts.queuedTaskId, stepId))
    .orderBy(desc(stepAttempts.attemptNumber))
    .limit(1);
  return attempt;
}

async function latestAwaitingStep(runId: string) {
  const rows = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, runId))
    .orderBy(desc(queuedTasks.id));
  return rows.find((row) => row.status === "awaiting_input");
}

async function decisionReview(runId: string) {
  await waitForRunStatus(runId, ["awaiting_decision_review"]);
  const step = await latestAwaitingStep(runId);
  if (!step) throw new Error("no awaiting decision step");
  const attempt = await latestAttempt(step.id);
  if (!attempt) throw new Error("no decision attempt");
  const pending = step.pendingChoice as {
    kind?: string;
    recommendedOptionId?: string | null;
    options?: { id: string; label: string }[];
  } | null;
  if (pending?.kind !== "assistedDecisionReview") {
    throw new Error(`unexpected pending kind ${pending?.kind}`);
  }
  const options = pending.options ?? [];
  const matchedResultId = Number(
    (attempt.result as { matchedResultId?: number } | null)?.matchedResultId,
  );
  return { step, attempt, pending, options, matchedResultId };
}

async function acceptTerminal(runId: string, terminalId: number) {
  await waitForRunStatus(runId, ["awaiting_step_review"]);
  const step = await latestAwaitingStep(runId);
  if (!step || step.taskId !== terminalId) {
    throw new Error("decision did not continue to the expected task");
  }
  const attempt = await latestAttempt(step.id);
  if (!attempt) throw new Error("no terminal attempt");
  await acceptAttempt(await currentUserId(), attempt.id);
  const completed = await waitForRunStatus(runId, ["completed"]);
  if (completed.status !== "completed") throw new Error("run did not complete");
}

let cachedUserId: number | null = null;
async function currentUserId(): Promise<number> {
  if (cachedUserId == null) cachedUserId = await ensureUser();
  return cachedUserId;
}

interface DecisionFixture {
  userId: number;
  taskId: number;
  invalidTaskId: number;
  decisionId: number;
  resultIds: { approve: number; reject: number };
  unwiredResultId: number;
  terminalId: number;
}

async function createFixture(userId: number): Promise<DecisionFixture> {
  const [terminal] = await db
    .insert(tasks)
    .values({
      name: `${marker} terminal`,
      type: "tool",
      toolKey: "set_state",
      toolConfig: { format: "text", clearToolState: true },
      toolOutputType: "normal",
      canRunInParallel: false,
    })
    .returning();
  if (!terminal) throw new Error("failed to create terminal task");

  const [decision] = await db
    .insert(decisions)
    .values({
      name: `${marker} decision`,
      authorId: userId,
      type: "choice",
      decisionPremise: "approval",
      instruction:
        "Approve invoices under 200 dollars from known vendors; reject everything else. Choose exactly one option.",
      options: ["approve", "reject", "needs-review"],
      optionDescriptions: [
        "The invoice is valid and should be paid.",
        "The invoice should not be paid.",
        "The invoice needs a human review before a decision.",
      ],
    })
    .returning();
  if (!decision) throw new Error("failed to create decision");

  const [task] = await db
    .insert(tasks)
    .values({
      name: `${marker} decision task`,
      type: "decision",
      decisionId: decision.id,
      decisionModel: DECISION_MODEL,
      fallbackTaskId: terminal.id,
      forceUserDecideIfNoMatch: true,
      canRunInParallel: false,
    })
    .returning();
  if (!task) throw new Error("failed to create decision task");

  const [approve] = await db
    .insert(taskResults)
    .values({
      taskId: task.id,
      type: "choice",
      option: "approve",
      resultTaskId: terminal.id,
      appendState: true,
    })
    .returning();
  const [reject] = await db
    .insert(taskResults)
    .values({
      taskId: task.id,
      type: "choice",
      option: "reject",
      resultTaskId: terminal.id,
      appendState: false,
    })
    .returning();
  if (!approve || !reject) throw new Error("failed to create results");

  const [unwired] = await db
    .insert(taskResults)
    .values({
      taskId: task.id,
      type: "choice",
      option: "needs-review",
      resultTaskId: null,
      appendState: false,
    })
    .returning();
  if (!unwired) throw new Error("failed to create unwired result");

  const [invalidTask] = await db
    .insert(tasks)
    .values({
      name: `${marker} decision task without a decision`,
      type: "decision",
      decisionId: null,
      canRunInParallel: false,
    })
    .returning();
  if (!invalidTask) throw new Error("failed to create invalid decision task");

  return {
    userId,
    taskId: task.id,
    invalidTaskId: invalidTask.id,
    decisionId: decision.id,
    resultIds: { approve: approve.id, reject: reject.id },
    unwiredResultId: unwired.id,
    terminalId: terminal.id,
  };
}

async function start(fixture: DecisionFixture, state: string): Promise<string> {
  const run = await startAssistedRun(fixture.userId, {
    taskId: fixture.taskId,
    state,
  });
  return run.id;
}

async function missingDecisionStrategy(fixture: DecisionFixture) {
  let message = "";
  try {
    await startAssistedRun(fixture.userId, {
      taskId: fixture.invalidTaskId,
      state: "Make a decision whether the prompt relates to files or folders.",
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  if (!message.includes("no decision attached")) {
    throw new Error(`expected an actionable missing-decision error, got: ${message}`);
  }

  const steps = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.taskId, fixture.invalidTaskId));
  if (steps.length > 0) {
    throw new Error("created steps for a decision task with no decision");
  }
  console.log("missing decision rejected before run creation");
}

async function snapshotStrategy(fixture: DecisionFixture) {
  // Mirrors a builder draft: only { id, type, options } for the decision, and
  // no premise/instruction. Starting the run must not blank those fields.
  const [before] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.id, fixture.decisionId));

  const run = await startAssistedRun(fixture.userId, {
    taskId: fixture.taskId,
    state: "Invoice 120 dollars from a known vendor needs approval.",
    taskSnapshot: {
      task: { decisionId: fixture.decisionId },
      decision: {
        id: fixture.decisionId,
        type: "choice",
        options: ["approve", "reject", "needs-review"],
      },
    },
  });

  const review = await decisionReview(run.id);
  const [after] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.id, fixture.decisionId));
  if (
    after?.decisionPremise !== before?.decisionPremise ||
    after?.instruction !== before?.instruction
  ) {
    throw new Error("builder snapshot blanked the saved decision wording");
  }

  await acceptAttempt(fixture.userId, review.attempt.id);
  await acceptTerminal(run.id, fixture.terminalId);
  console.log("builder snapshot decision preserved");
}

async function targetStrategy(fixture: DecisionFixture) {
  const runId = await start(
    fixture,
    "Invoice 250 dollars from a new vendor needs a second look.",
  );
  const first = await decisionReview(runId);

  // Choosing an option without a target must park the run on target wiring
  // instead of reporting a false "no match" or failing.
  await overrideDecision(fixture.userId, first.attempt.id, fixture.unwiredResultId);

  const step = await latestAwaitingStep(runId);
  if (!step) throw new Error("no step awaiting a target");
  const pending = step.pendingChoice as { kind?: string } | null;
  if (pending?.kind !== "assistedDecisionTarget") {
    throw new Error(`unexpected pending kind ${pending?.kind}`);
  }
  const attempt = await latestAttempt(step.id);
  if (!attempt) throw new Error("no attempt waiting for a target");

  const drafted = await draftDecisionTargetTask(fixture.userId, attempt.id);
  if (drafted.type !== "tool" || !drafted.toolKey.trim()) {
    throw new Error("drafted target is not a tool task");
  }
  console.log("decision target drafted", {
    toolKey: drafted.toolKey,
    name: drafted.name,
  });

  await createDecisionTargetTask(
    fixture.userId,
    attempt.id,
    fixture.unwiredResultId,
    {
      name: `${marker} follow-up`,
      explanation: "Run the first action for the chosen branch.",
      type: "tool",
      toolKey: "set_state",
      toolConfig: { format: "text", clearToolState: true },
      toolOutputType: "normal",
    },
  );

  await waitForRunStatus(runId, ["awaiting_step_review"]);
  const followUpStep = await latestAwaitingStep(runId);
  if (!followUpStep) throw new Error("no follow-up step after wiring");
  extraTaskIds.push(followUpStep.taskId);

  const [followUpTask] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, followUpStep.taskId));
  if (!followUpTask || followUpTask.isDraft) {
    throw new Error("created target task was not promoted");
  }

  const [persisted] = await db
    .select()
    .from(taskResults)
    .where(eq(taskResults.id, fixture.unwiredResultId));
  if (persisted?.resultTaskId !== followUpStep.taskId) {
    throw new Error("decision target was not persisted");
  }

  const followUpAttempt = await latestAttempt(followUpStep.id);
  if (!followUpAttempt) throw new Error("no follow-up attempt");
  await acceptAttempt(fixture.userId, followUpAttempt.id);
  await waitForRunStatus(runId, ["completed"]);

  // The remaining strategies expect a decision with only wired options, so
  // remove the temporary unwired branch now that this flow is verified.
  await db
    .delete(taskResults)
    .where(eq(taskResults.id, fixture.unwiredResultId));
  await db
    .update(decisions)
    .set({
      options: ["approve", "reject"],
      optionDescriptions: [
        "The invoice is valid and should be paid.",
        "The invoice should not be paid.",
      ],
    })
    .where(eq(decisions.id, fixture.decisionId));

  console.log("decision target created and wired", {
    targetTaskId: followUpStep.taskId,
  });
}

async function acceptStrategy(fixture: DecisionFixture) {
  const runId = await start(
    fixture,
    "Invoice 120 dollars from a known vendor needs approval.",
  );
  const review = await decisionReview(runId);
  if (!Number.isFinite(review.matchedResultId)) {
    throw new Error("model did not match a decision result");
  }
  await acceptAttempt(fixture.userId, review.attempt.id);
  console.log("accept decision", {
    matchedResultId: review.matchedResultId,
    recommended: review.pending.recommendedOptionId,
  });
  await acceptTerminal(runId, fixture.terminalId);
  console.log("accept decision completed");
}

async function overrideStrategy(fixture: DecisionFixture) {
  const runId = await start(
    fixture,
    "Invoice 420 dollars from an unknown vendor needs approval.",
  );
  const review = await decisionReview(runId);
  const chosen =
    review.matchedResultId === fixture.resultIds.approve
      ? fixture.resultIds.reject
      : fixture.resultIds.approve;

  await overrideDecision(fixture.userId, review.attempt.id, chosen);
  await acceptTerminal(runId, fixture.terminalId);

  const [decision] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.id, fixture.decisionId));
  console.log("override decision", {
    matchedResultId: review.matchedResultId,
    chosen,
    livePremise: decision?.decisionPremise,
  });
  console.log("override decision completed");
}

async function addOptionStrategy(fixture: DecisionFixture) {
  const runId = await start(
    fixture,
    "Invoice 90 dollars from a new vendor needs a second look.",
  );
  const first = await decisionReview(runId);

  await addDecisionOption(fixture.userId, first.attempt.id, {
    label: "escalate",
    description: "Route the invoice to a human reviewer.",
    value: "escalate",
    targetTaskId: fixture.terminalId,
  });

  const second = await decisionReview(runId);
  if (second.attempt.id === first.attempt.id) {
    throw new Error("addDecisionOption did not create a new attempt");
  }
  const labels = second.options.map((option) => option.label);
  if (!labels.includes("escalate")) {
    throw new Error(`new option missing from review: ${labels.join(", ")}`);
  }
  console.log("add option", {
    attempt: second.attempt.attemptNumber,
    cause: second.attempt.cause,
    labels,
  });

  // The re-run is below the 0.8 floor, so the user must explicitly pick the
  // new option. That override is what persists the added option.
  const escalate = second.options.find((option) => option.label === "escalate");
  if (!escalate) {
    throw new Error(`new option missing from pending choices: ${labels.join(", ")}`);
  }
  const escalateResultId = Number(escalate.id.replace("result:", ""));
  await overrideDecision(
    fixture.userId,
    second.attempt.id,
    escalateResultId,
  );
  await acceptTerminal(runId, fixture.terminalId);

  const [decision] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.id, fixture.decisionId));
  const persisted = await db
    .select()
    .from(taskResults)
    .where(eq(taskResults.taskId, fixture.taskId));
  if (!decision?.options?.includes("escalate")) {
    throw new Error("accepted option was not persisted to the decision");
  }
  if (!persisted.some((row) => row.option === "escalate")) {
    throw new Error("accepted option was not persisted as a task result");
  }
  console.log("add option completed", {
    options: decision.options,
    results: persisted.length,
  });
}

async function optimizeStrategy(fixture: DecisionFixture) {
  const runId = await start(
    fixture,
    "Invoice 150 dollars from a vendor not in the approved list needs a decision.",
  );
  const first = await decisionReview(runId);
  const expected =
    first.matchedResultId === fixture.resultIds.approve
      ? fixture.resultIds.reject
      : fixture.resultIds.approve;

  const [original] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.id, fixture.decisionId));
  const originalPremise = original?.decisionPremise;

  await optimizeDecision(
    fixture.userId,
    first.attempt.id,
    expected,
    "Prefer the opposite choice for this kind of invoice.",
  );

  const second = await decisionReview(runId);
  if (second.attempt.id === first.attempt.id) {
    throw new Error("optimizeDecision did not create a new attempt");
  }
  console.log("optimize decision", {
    attempt: second.attempt.attemptNumber,
    cause: second.attempt.cause,
  });

  const snapshotPremise = (
    second.attempt.taskSnapshot as { decision?: { decisionPremise?: string } }
  ).decision?.decisionPremise;
  const snapshotOptions = (
    second.attempt.taskSnapshot as { decision?: { options?: string[] } }
  ).decision?.options;

  const [beforeAccept] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.id, fixture.decisionId));
  if (beforeAccept?.decisionPremise !== originalPremise) {
    throw new Error("optimization reached production before acceptance");
  }
  if (
    JSON.stringify(snapshotOptions) !== JSON.stringify(beforeAccept?.options)
  ) {
    throw new Error("optimization renamed or added decision options");
  }

  // The optimized re-run is still under the 0.8 floor, so the user confirms
  // the choice explicitly. That override is what persists the wording.
  await overrideDecision(fixture.userId, second.attempt.id, expected);
  await acceptTerminal(runId, fixture.terminalId);

  const [afterAccept] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.id, fixture.decisionId));
  if (afterAccept?.decisionPremise !== snapshotPremise) {
    throw new Error("accepted optimization was not persisted");
  }
  console.log("optimize decision completed", {
    premise: afterAccept?.decisionPremise,
  });
}

async function main() {
  const userId = await ensureUser();
  cachedUserId = userId;
  const fixture = await createFixture(userId);

  try {
    await missingDecisionStrategy(fixture);
    await snapshotStrategy(fixture);
    await targetStrategy(fixture);
    await acceptStrategy(fixture);
    await overrideStrategy(fixture);
    await addOptionStrategy(fixture);
    await optimizeStrategy(fixture);
    console.log("assisted decision smoke passed");
  } finally {
    // Never leave an active run pointing at a task this script is about to
    // delete: that would show up as a permanently "running" assisted run.
    const steps = await db
      .select()
      .from(queuedTasks)
      .where(
        inArray(queuedTasks.taskId, [
          fixture.taskId,
          fixture.terminalId,
          ...extraTaskIds,
        ]),
      );
    const runIds = [...new Set(steps.map((step) => step.runId))];
    if (runIds.length > 0) {
      await db
        .update(runs)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(inArray(runs.id, runIds));
    }

    await db.delete(taskResults).where(eq(taskResults.taskId, fixture.taskId));
    for (const taskId of extraTaskIds) {
      await db.delete(taskResults).where(eq(taskResults.taskId, taskId));
      await db.delete(tasks).where(eq(tasks.id, taskId));
    }
    await db.delete(tasks).where(eq(tasks.id, fixture.taskId));
    await db.delete(tasks).where(eq(tasks.id, fixture.invalidTaskId));
    await db.delete(tasks).where(eq(tasks.id, fixture.terminalId));
    await db.delete(decisions).where(eq(decisions.id, fixture.decisionId));
  }
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
