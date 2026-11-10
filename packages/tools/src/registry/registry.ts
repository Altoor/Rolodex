import type { Tool, ToolDefinition } from "../model";
import { promptTool } from "../tools/prompt/prompt";
import { findTodoTool } from "../tools/todo/findTodo";
import { modelSelectorTool } from "../tools/modelSelector/modelSelector";
import {
  createTodoTool,
  deleteTodoTool,
  markTodoDoneTool,
  updateTodoTool,
} from "../tools/todo/todos";
import { findTodosTool } from "../tools/todo/findTodos";
import { archiveTodoTool } from "../tools/todo/archiveTodo";
import { deleteTodosOlderThanTool } from "../tools/todo/deleteOlderThan";
import { filterToolStateTool } from "../tools/toolState/filterToolState";
import { appendStateTool } from "../tools/toolState/appendState";
import { setStateTool } from "../tools/toolState/setState";
import { ifTool } from "../tools/if/ifTool";

export const tools: Tool[] = [
  promptTool,
  findTodoTool,
  findTodosTool,
  modelSelectorTool,
  createTodoTool,
  updateTodoTool,
  markTodoDoneTool,
  deleteTodoTool,
  archiveTodoTool,
  deleteTodosOlderThanTool,
  filterToolStateTool,
  appendStateTool,
  setStateTool,
  ifTool,
];

const toolsByKey = new Map<string, Tool>(
  tools.map((tool) => [tool.definition.key, tool]),
);

export function listToolDefinitions(): ToolDefinition[] {
  return tools.map((tool) => tool.definition);
}

export function getToolDefinition(key: string): ToolDefinition | undefined {
  return toolsByKey.get(key)?.definition;
}

export function getTool(key: string): Tool | undefined {
  return toolsByKey.get(key);
}

export function requireTool(key: string): Tool {
  const tool = getTool(key);
  if (!tool) {
    throw new Error(`Unknown tool "${key}"`);
  }
  return tool;
}
