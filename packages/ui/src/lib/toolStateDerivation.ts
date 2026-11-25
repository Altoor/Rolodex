import {
  FILE_FIELDS,
  SCAN_CHANGE_FIELDS,
  SCAN_COUNT_FIELDS,
  TODO_FIELDS,
  addArrayPaths,
  addDecisionPaths,
  addFields,
  addObjectPaths,
  addPath,
  addTodoPaths,
  asRecord,
  asString,
  promptFieldNames,
  type FlowTask,
  type TaskState,
} from "./toolStateFields";

export type { FlowTask, TaskState } from "./toolStateFields";
export {
  asRecord,
  asString,
  promptFieldNames,
  promptFieldNamesFromText,
} from "./toolStateFields";

export interface ToolStatePathSuggestion {
  /** Dot path that can be dropped into a path/config field. */
  path: string;
  /** Task that contributes this value to toolState. */
  sourceTaskId: number;
  sourceTaskName: string;
}

export function taskStateEffect(task: FlowTask, incoming: TaskState): TaskState {
  const state = new Map(incoming);
  const taskName = task.name ?? `Task ${task.id}`;
  const config = asRecord(task.toolConfig);

  if (task.type === "tool") {
    switch (task.toolKey) {
      case "find_todos":
        addPath(state, "matched", task, taskName);
        if (task.toolOutputType === "foreach") {
          addTodoPaths(state, "todo", task, taskName);
        } else {
          addArrayPaths(state, "todos", TODO_FIELDS, task, taskName);
        }
        break;

      case "find_todo":
        addPath(state, "matched", task, taskName);
        addTodoPaths(state, "todo", task, taskName);
        break;

      case "create_todo":
      case "update_todo":
      case "mark_todo_done":
      case "archive_todo":
        if (config?.appendState === true) {
          addTodoPaths(state, "todo", task, taskName);
        }
        break;

      case "delete_todo":
        if (config?.appendState === true) {
          addFields(state, ["id", "name"], task, taskName);
        }
        break;

      case "delete_todos_older_than":
        if (config?.appendState === true) {
          addFields(
            state,
            [
              "cutoff",
              "basis",
              "allowNotDone",
              "allowNotArchived",
              "dryRun",
              "matched",
              "deleted",
              "note",
            ],
            task,
            taskName,
          );
        }
        break;

      case "find_file":
        addPath(state, "matched", task, taskName);
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        break;

      case "find_files":
        addPath(state, "matched", task, taskName);
        if (task.toolOutputType === "foreach") {
          addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        } else {
          addArrayPaths(state, "files", FILE_FIELDS, task, taskName);
        }
        break;

      case "find_folder":
        addPath(state, "matched", task, taskName);
        addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        break;

      case "find_folders":
        addPath(state, "matched", task, taskName);
        if (task.toolOutputType === "foreach") {
          addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        } else {
          addArrayPaths(state, "folders", FILE_FIELDS, task, taskName);
        }
        break;

      case "scan_files":
        if (task.toolOutputType === "foreach") {
          addObjectPaths(state, "entry", SCAN_CHANGE_FIELDS, task, taskName);
        } else {
          addArrayPaths(state, "changes", SCAN_CHANGE_FIELDS, task, taskName);
          addObjectPaths(state, "counts", SCAN_COUNT_FIELDS, task, taskName);
        }
        break;

      case "update_file_metadata":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        break;

      case "move_files":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        addArrayPaths(state, "files", FILE_FIELDS, task, taskName);
        addArrayPaths(state, "folders", FILE_FIELDS, task, taskName);
        break;

      case "detect_file_type":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        break;

      case "read_plaintext_file":
      case "read_text_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addPath(state, "content", task, taskName);
        break;

      case "read_image_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(
          state,
          "image",
          ["mimeType", "width", "height", "base64"],
          task,
          taskName,
        );
        addPath(state, "url", task, taskName);
        if (
          config?.describe === true ||
          (config?.ocr !== true && asString(config?.prompt) !== undefined)
        ) {
          addPath(state, "description", task, taskName);
        }
        if (config?.ocr === true) {
          addPath(state, "ocr", task, taskName);
        }
        break;

      case "read_audio_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(
          state,
          "audio",
          ["mimeType", "duration", "url"],
          task,
          taskName,
        );
        addPath(state, "url", task, taskName);
        break;

      case "read_video_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(
          state,
          "video",
          ["mimeType", "duration", "url"],
          task,
          taskName,
        );
        addPath(state, "url", task, taskName);
        break;

      case "read_other_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addFields(state, ["url", "base64"], task, taskName);
        break;

      case "create_folder":
        addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        break;

      case "create_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        break;

      case "prompt":
        addFields(state, ["text"], task, taskName);
        for (const field of promptFieldNames(config)) {
          addPath(state, field, task, taskName);
        }
        break;

      case "model_selector":
        if (config?.appendState === true) {
          addFields(state, ["kind", "model"], task, taskName);
        }
        break;

      case "set_state":
      case "append_state":
        if (config?.clearToolState !== false) state.clear();
        break;

      // if / filter_tool_state / display_block never change toolState.
      default:
        break;
    }
  }

  if (task.type === "decision") {
    const appendsDecision = (task.taskResults ?? []).some(
      (result) => result?.appendState === true,
    );
    if (appendsDecision) addDecisionPaths(state, task, taskName);
  }

  if (task.type === "userDecision") {
    for (const option of task.userDecisionOptions ?? []) {
      if (option?.kind !== "dynamic") continue;

      const selector = asRecord(option.selector);
      const selectorPath = asString(selector?.path);
      if (!selectorPath) continue;

      // The selected array item/object is appended directly as a new
      // tool-state entry, so its child paths become the entry's own paths.
      const indexedPrefix = `${selectorPath}.0.`;
      const prefix = `${selectorPath}.`;
      for (const statePath of [...state.keys()]) {
        let relative: string | undefined;

        if (statePath.startsWith(indexedPrefix)) {
          relative = statePath.slice(indexedPrefix.length);
        } else if (statePath.startsWith(prefix)) {
          const rest = statePath.slice(prefix.length);
          // Skip the array index itself; item fields are handled above.
          if (rest === "0" || /^\d+($|\.)/.test(rest)) continue;
          relative = rest;
        }

        if (relative) addPath(state, relative, task, taskName);
      }
    }
  }

  return state;
}

export function mergeState(target: TaskState, source: TaskState): void {
  for (const [path, origin] of source) {
    if (!target.has(path)) target.set(path, origin);
  }
}
