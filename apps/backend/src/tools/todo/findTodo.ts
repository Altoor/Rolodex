import { and, cosineDistance, eq, ilike, isNotNull, or } from "drizzle-orm";
import { db } from "../../schema/builder";
import { todos } from "../../db";
import { tryEmbedText } from "../../ai/embeddings";
import { getDecisionModelForUser } from "../../ai/model";
import {
  mergeToolInput,
  readNumber,
  readString,
  serializeToolOutput,
} from "../input";
import { ToolInputError, type Tool, type ToolDefinition } from "../types";
import { listUserTodos, loadUserTodo } from "./todos";
import { selectTodoWithDecision } from "./selection";

interface TodoCandidate {
  id: number;
  name: string;
  description: string;
  done: boolean;
  score: number;
}

const definition: ToolDefinition = {
  key: "find_todo",
  name: "Find todo",
  description:
    "Find one of the user's todos by name/description using vector similarity, with lexical and decision-model fallbacks.",
  category: "todo",
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
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used by the fallback selector. Defaults to the task/inherited decision model, then the user's default decision model.",
      },
    },
  },
  outputDescription:
    "The best matching todo, its similarity score, and the candidate todos.",
  exampleConfig: {
    query: "pick up Johnny",
    limit: 5,
  },
};

export const findTodoTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const explicitId = readNumber(input, "id") ?? readNumber(input, "todoId");

    if (explicitId !== undefined) {
      const todo = await loadUserTodo(context.userId, explicitId);
      return {
        output: {
          todo: {
            id: todo.id,
            name: todo.name,
            description: todo.description,
            done: todo.done,
          },
          score: 1,
          candidates: [],
        },
        summary: `Found todo "${todo.name}"`,
        stateAppend: serializeToolOutput({
          todoId: todo.id,
          todoName: todo.name,
        }),
        appendState: true,
      };
    }

    const queryText = readString(input, "query") ?? context.state;
    if (!queryText || !queryText.trim()) {
      throw new ToolInputError("find_todo requires a query or state");
    }

    const limit = Math.max(1, Math.floor(readNumber(input, "limit") ?? 5));

    const ownership = or(
      eq(todos.authorId, context.userId),
      eq(todos.actorId, context.userId),
    );

    const queryEmbedding = await tryEmbedText(queryText);
    let candidates: TodoCandidate[] = [];

    if (queryEmbedding) {
      const distance = cosineDistance(
        todos.descriptionEmbedding,
        queryEmbedding,
      );

      const rows = await db
        .select({
          id: todos.id,
          name: todos.name,
          description: todos.description,
          done: todos.done,
          distance,
        })
        .from(todos)
        .where(and(ownership, isNotNull(todos.descriptionEmbedding)))
        .orderBy(distance)
        .limit(limit);

      candidates = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        done: row.done,
        score: 1 - Number(row.distance),
      }));
    }

    if (candidates.length === 0) {
      const pattern = `%${queryText}%`;
      const rows = await db
        .select({
          id: todos.id,
          name: todos.name,
          description: todos.description,
          done: todos.done,
        })
        .from(todos)
        .where(
          and(
            ownership,
            or(ilike(todos.name, pattern), ilike(todos.description, pattern)),
          ),
        )
        .limit(limit);

      candidates = rows.map((row) => ({
        ...row,
        score: 1,
      }));
    }

    if (candidates.length === 0) {
      const model =
        readString(input, "decisionModel") ??
        readString(input, "model") ??
        context.decisionModel ??
        (await getDecisionModelForUser(context.userId));

      const userTodos = await listUserTodos(context.userId);
      if (userTodos.length === 0) {
        throw new ToolInputError("no matching todo found");
      }

      const selected = await selectTodoWithDecision(
        userTodos,
        queryText,
        model,
      );

      candidates = [
        {
          id: selected.id,
          name: selected.name,
          description: selected.description,
          done: selected.done,
          score: 1,
        },
      ];
    }

    let best = candidates[0];
    if (!best) {
      throw new ToolInputError("no matching todo found");
    }

    for (const candidate of candidates.slice(1)) {
      if (candidate.score > best.score) {
        best = candidate;
      }
    }

    return {
      output: {
        todo: {
          id: best.id,
          name: best.name,
          description: best.description,
          done: best.done,
        },
        score: best.score,
        candidates,
      },
      summary: `Found todo "${best.name}"`,
      // Feed the selected todo into update_todo/delete_todo. Use the
      // delimited form so existing plain-text state is preserved.
      stateAppend: serializeToolOutput({
        todoId: best.id,
        todoName: best.name,
      }),
      appendState: true,
    };
  },
};
