const TaskFlowHelpText = () => (
  <p className="text-xs text-muted-foreground">
    Click a task to edit it, drag a result output onto another task's input to
    link them, or drag on empty canvas to box-select several tasks. Add to the
    selection with Shift/Cmd/Ctrl-click, then press Delete to remove them,
    right-click for copy/export/delete, or use Ctrl/Cmd+C and Ctrl/Cmd+V to copy
    and paste. Right-click an edge to insert a task or delete the link, and
    right-click empty canvas space to add or paste tasks there.
  </p>
);

export default TaskFlowHelpText;
