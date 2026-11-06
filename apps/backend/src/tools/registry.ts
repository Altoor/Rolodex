import type { Tool, ToolDefinition } from "./types";
import { promptTool } from "./prompt/prompt";
import { findTodoTool } from "./todo/findTodo";
import { modelSelectorTool } from "./modelSelector/modelSelector";
import {
  createTodoTool,
  deleteTodoTool,
  markTodoDoneTool,
  updateTodoTool,
} from "./todo/todos";

export const tools: Tool[] = [
  promptTool,
  findTodoTool,
  modelSelectorTool,
  createTodoTool,
  updateTodoTool,
  markTodoDoneTool,
  deleteTodoTool,
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
