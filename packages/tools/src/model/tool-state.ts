/**
 * One accumulated tool-state value. Entries are stored exactly as the tool
 * returned them; there is no surrounding tool/task metadata.
 */
export type ToolStateEntry = unknown;

/** What a tool appends; the processor stores it as-is. */
export type ToolStateEntryInput = unknown;
