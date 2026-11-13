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
import { switchTool } from "../tools/switch/switchTool";
import { displayBlockTool } from "../tools/display/displayBlock";
import { findFileTool } from "../tools/file/findFile";
import { findFilesTool } from "../tools/file/findFiles";
import { findFolderTool } from "../tools/file/findFolder";
import { findFoldersTool } from "../tools/file/findFolders";
import { scanFilesTool } from "../tools/file/scanFiles";
import { updateFileMetadataTool } from "../tools/file/updateFileMetadata";
import { detectFileTypeTool } from "../tools/file/detectFileType";
import { readPlaintextFileTool } from "../tools/file/readPlaintextFile";
import { readTextFileTool } from "../tools/file/readTextFile";
import { readImageFileTool } from "../tools/file/readImageFile";
import { readAudioFileTool } from "../tools/file/readAudioFile";
import { readVideoFileTool } from "../tools/file/readVideoFile";
import { readOtherFileTool } from "../tools/file/readOtherFile";
import { createFolderTool } from "../tools/file/createFolder";
import { createFileTool } from "../tools/file/createFile";
import { deleteFileEntryTool } from "../tools/file/deleteFileEntry";

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
  switchTool,
  displayBlockTool,
  findFileTool,
  findFilesTool,
  findFolderTool,
  findFoldersTool,
  scanFilesTool,
  updateFileMetadataTool,
  detectFileTypeTool,
  readPlaintextFileTool,
  readTextFileTool,
  readImageFileTool,
  readAudioFileTool,
  readVideoFileTool,
  readOtherFileTool,
  createFolderTool,
  createFileTool,
  deleteFileEntryTool,
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
