import type { Tool, ToolDefinition } from "../../model";
import { ToolNoMatchError } from "../../model";
import { mergeToolInput, readBoolean } from "../../utils";
import { findTodoMatches } from "./services/search";

const definition: ToolDefinition = {
  key: "find_todo",
  name: "Find todo",
  description:
    "Find one of the user's todos by name/description using vector similarity, with lexical and decision-model fallbacks.",
  category: "todo",
  usesModel: true,
  modelRoles: ["decision", "embedding"],
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search text. Defaults to the queued task's state.",
      },
      id: {
        type: "number",
        description: "Optional direct todo id.",
      },
      limit: {
        type: "number",
        description: "Number of candidates to return. Defaults to 5.",
        default: 5,
      },
      minimumScore: {
        type: "number",
        description:
          "Minimum vector similarity score (0..1) accepted without asking the decision model. Defaults to 0.",
        default: 0,
      },
      minimumConfidence: {
        type: "number",
        description:
          "Minimum decision-model confidence (0..1) required for a fallback match. Defaults to 0.",
        default: 0,
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used by the fallback selector. Defaults to the task/inherited decision model, then the user's default decision model.",
      },
      includeArchived: {
        type: "boolean",
        description: "Include archived todos. Defaults to false.",
        default: false,
      },
      allowEmpty: {
        type: "boolean",
        description:
          "Return an empty result with `matched: false` instead of failing when nothing matches. Defaults to false.",
        default: false,
      },
    },
  },
  outputDescription:
    "The best matching todo, its similarity score, and the candidate todos. Appended to toolState as `{ todo }`; use `todo.done` in filter_tool_state or if conditions.",
  exampleConfig: {
    limit: 5,
  },
};

export const findTodoTool: Tool = {
  definition,

  async execute(context) {
    const allowEmpty =
      readBoolean(mergeToolInput(context), "allowEmpty") ?? false;

    try {
      const { todo, candidates } = await findTodoMatches(context);

      return {
        output: {
          todo: {
            id: todo.id,
            name: todo.name,
            description: todo.description,
            done: todo.done,
            doByDate: todo.doByDate,
            createdAt: todo.createdAt,
            archivedAt: todo.archivedAt,
            authorId: todo.authorId,
            actorId: todo.actorId,
          },
          score: todo.score,
          candidates,
          matched: true,
        },
        summary: `Found todo "${todo.name}"`,
        toolStateAppend: { todo, matched: true },
      };
    } catch (err) {
      if (!allowEmpty || !(err instanceof ToolNoMatchError)) throw err;

      return {
        output: {
          todo: null,
          score: null,
          candidates: [],
          matched: false,
          warning: err.message,
        },
        summary: err.message,
        toolStateAppend: { todo: null, matched: false },
      };
    }
  },
};
