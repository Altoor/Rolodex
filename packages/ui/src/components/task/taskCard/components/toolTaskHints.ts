const FILE_PATH_AWARE_TOOLS = [
  "find_file",
  "find_files",
  "find_folder",
  "find_folders",
  "scan_files",
  "update_file_metadata",
  "move_files",
  "detect_file_type",
  "read_plaintext_file",
  "read_text_file",
  "read_image_file",
  "read_audio_file",
  "read_video_file",
  "read_other_file",
  "create_folder",
  "create_file",
  "delete_file_entry",
] as const;

const FILE_TOOL_HINT =
  "Use these in `id`, `path`, or `parentPath` where that field is available. Any config string can interpolate earlier output with `{{path}}`.";

export const PATH_AWARE_TOOLS = new Set<string>([
  "if",
  "switch",
  "filter_tool_state",
  "display_block",
  "end_flow",
  "prompt",
  ...FILE_PATH_AWARE_TOOLS,
]);

export const FILE_CONTEXT_TOOLS = new Set<string>([
  "if",
  "switch",
  "filter_tool_state",
  "display_block",
  "end_flow",
  "prompt",
  ...FILE_PATH_AWARE_TOOLS,
]);

export const PATH_TOOL_HINTS: Record<string, string> = {
  if: "Use these in `path` or in any `where` path.",
  switch:
    "Use these in `path` or in any case condition path. Cases run in order; the first match wins.",
  filter_tool_state: "Use these in `path` or in any `where` path.",
  display_block:
    "Use these in `path` or `where`. The `select` setting chooses all matches or only the first.",
  end_flow:
    "Use these in `path` or `where`; the selected items become the API result and the landing block. `message` is returned as the result summary, and `includeState`/`includeToolState` add the full flow data.",
  prompt:
    "Reference earlier outputs with `{{path}}` in any config string, for example `{{content}}` or `{{file.name}}`. Set `useToolState: true` to append the whole toolState. Add `fields` to publish named outputs downstream.",
  ...Object.fromEntries(
    FILE_PATH_AWARE_TOOLS.map((key) => [key, FILE_TOOL_HINT]),
  ),
  scan_files:
    "Use `path` to limit the scan. Foreach processes files only by default; add `includeUnchanged: false` for changes only, or filter with `kind`/`fileType` (for example `plaintext`).",
  find_file: `${FILE_TOOL_HINT} Set \`allowEmpty: true\` to return \`matched: false\` instead of failing when nothing matches.`,
  find_files: `${FILE_TOOL_HINT} Set \`allowEmpty: true\` to return \`matched: false\` instead of failing when nothing matches.`,
  find_folder: `${FILE_TOOL_HINT} Set \`allowEmpty: true\` to return \`matched: false\` instead of failing when nothing matches.`,
  find_folders: `${FILE_TOOL_HINT} Set \`allowEmpty: true\` to return \`matched: false\` instead of failing when nothing matches.`,
  find_todo:
    "Set `allowEmpty: true` to return `matched: false` instead of failing when nothing matches.",
  find_todos:
    "Set `allowEmpty: true` to return `matched: false` instead of failing when nothing matches.",
  move_files:
    "Pass sources in `files`, `ids`, or `paths`. Use `parentId`/`parentPath` for an existing destination, or `folderName` to create/reuse a folder; `folderDescription` is used when it is created.",
};
