// The tool registry lives in @repo/tools. This shim keeps the backend's
// GraphQL schema and queue code pointed at one composition module.
export {
  getTool,
  getToolDefinition,
  listToolDefinitions,
  requireTool,
} from "@repo/tools";
