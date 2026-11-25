import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import { mergeToolInput, readBoolean } from "../../utils";

const definition: ToolDefinition = {
  key: "join",
  name: "Join",
  description:
    "Collect the results of every per-item branch of a foreach fan-out. Use this task as the foreach task's `joinTaskId` ('After all items'). The tool is read-only: it emits a deterministic list of branch outcomes and appends it to toolState by default, so a later end_flow can publish it.",
  category: "ui",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      includeResults: {
        type: "boolean",
        description:
          "Include each branch's last step result in the output. Defaults to true.",
        default: true,
      },
      includeToolState: {
        type: "boolean",
        description:
          "Include each branch's accumulated toolState in the output. Defaults to false.",
        default: false,
      },
      includeState: {
        type: "boolean",
        description:
          "Include each branch's final state string in the output. Defaults to false.",
        default: false,
      },
      appendState: {
        type: "boolean",
        description:
          "Append this join output to the next step's toolState. Defaults to true so a later end_flow can select it.",
        default: true,
      },
    },
  },
  outputDescription:
    "`{ kind: \"join\", groupId, count, completed, failed, branches: [{ index, queuedTaskId, taskId, taskName, status, result?, toolState?, state? }] }`. Appended to toolState by default.",
  exampleConfig: {
    includeResults: true,
    includeToolState: false,
    includeState: false,
    appendState: true,
  },
  outputTypes: ["normal"],
  trialSafe: true,
};

export const joinTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const fork = context.fork;

    if (!fork) {
      throw new ToolInputError(
        "join must run as the 'After all items' task of a foreach fan-out",
      );
    }

    const includeResults = readBoolean(input, "includeResults") ?? true;
    const includeToolState =
      readBoolean(input, "includeToolState") ?? false;
    const includeState = readBoolean(input, "includeState") ?? false;
    const appendState = readBoolean(input, "appendState") ?? true;

    const branches = fork.branches.map((branch) => ({
      index: branch.index,
      queuedTaskId: branch.queuedTaskId,
      taskId: branch.taskId,
      taskName: branch.taskName,
      status: branch.status,
      ...(includeResults ? { result: branch.result } : {}),
      ...(includeToolState ? { toolState: branch.toolState } : {}),
      ...(includeState ? { state: branch.state } : {}),
    }));

    const completed = branches.filter(
      (branch) => branch.status === "completed",
    ).length;
    const failed = branches.length - completed;

    return {
      output: {
        kind: "join",
        groupId: fork.groupId,
        count: branches.length,
        completed,
        failed,
        branches,
      },
      summary:
        branches.length === 0
          ? "Joined 0 branches"
          : `Joined ${branches.length} branch${branches.length === 1 ? "" : "es"} (${completed} completed, ${failed} failed)`,
      appendOutput: appendState,
    };
  },
};
