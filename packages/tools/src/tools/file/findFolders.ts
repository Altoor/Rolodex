import type { Tool, ToolDefinition } from "../../model";
import { ToolNoMatchError } from "../../model";
import { mergeToolInput, readBoolean } from "../../utils";
import {
  withoutScore,
  type FileEntryCandidate,
  type FileEntryRef,
} from "./services/dto";
import { findFileMatches } from "./services/search";

const definition: ToolDefinition = {
  key: "find_folders",
  name: "Find folders",
  description:
    "Find a list of folders by name/path/description using vector similarity, with lexical and decision-model fallbacks.",
  category: "file",
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
      limit: {
        type: "number",
        description: "Number of candidates to return. Defaults to 15.",
        default: 15,
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
      allowEmpty: {
        type: "boolean",
        description:
          "Return an empty list with `matched: false` instead of failing when nothing matches. Defaults to false.",
        default: false,
      },
    },
  },
  outputDescription:
    "The best matching folders and candidate folders. Appended to toolState as `{ folders: [...] }`; use filter_tool_state or a foreach output to act on individual folders.",
  outputTypes: ["normal", "foreach"],
  foreachOutputDescription:
    "Enqueue one queued task per matching folder, with only that folder in each child's toolState.",
  exampleConfig: {
    query: "archive",
    limit: 15,
  },
};

export const findFoldersTool: Tool = {
  definition,

  async execute(context) {
    const allowEmpty =
      readBoolean(mergeToolInput(context), "allowEmpty") ?? false;

    let folders: FileEntryRef[];
    let candidates: FileEntryCandidate[];

    try {
      ({ candidates } = await findFileMatches(context, {
        kind: "folder",
        limit: 15,
      }));
      folders = candidates.map(withoutScore);
    } catch (err) {
      if (!allowEmpty || !(err instanceof ToolNoMatchError)) throw err;

      const empty = {
        output: {
          folders: [],
          candidates: [],
          matched: false,
          warning: err.message,
        },
        summary: err.message,
        toolStateAppend: { folders: [], matched: false },
      };

      if (context.outputType === "foreach") {
        return { ...empty, foreach: { items: [] } };
      }

      return empty;
    }

    if (context.outputType === "foreach") {
      return {
        output: { folders, candidates, matched: true },
        summary: `Found ${folders.length} folders`,
        foreach: {
          items: folders.map((folder) => ({ folder })),
        },
      };
    }

    return {
      output: { folders, candidates, matched: true },
      summary: `Found ${folders.length} folders`,
      toolStateAppend: { folders, matched: true },
    };
  },
};
