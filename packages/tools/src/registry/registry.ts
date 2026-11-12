import type { Tool, ToolDefinition } from "../model";
import { promptTool } from "../tools/prompt/prompt";
import { findTodoTool } from "../tools/todo/findTodo";
import { modelSelectorTool } from "../tools/modelSelector/modelSelector";
import { createTodoTool } from "../tools/todo/createTodo";
import { updateTodoTool } from "../tools/todo/updateTodo";
import { markTodoDoneTool } from "../tools/todo/markTodoDone";
import { deleteTodoTool } from "../tools/todo/deleteTodo";
import { findTodosTool } from "../tools/todo/findTodos";
import { archiveTodoTool } from "../tools/todo/archiveTodo";
import { deleteTodosOlderThanTool } from "../tools/todo/deleteOlderThan";
import { filterToolStateTool } from "../tools/toolState/filterToolState";
import { appendStateTool } from "../tools/toolState/appendState";
import { setStateTool } from "../tools/toolState/setState";
import { ifTool } from "../tools/if/ifTool";
import { displayBlockTool } from "../tools/display/displayBlock";

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
  displayBlockTool,
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
