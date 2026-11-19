import { Plus, Trash2 } from "lucide-react";
import type { Edge, XYPosition } from "@xyflow/react";
import type { FlowContextMenu } from "../taskFlowTypes";

interface TaskFlowContextMenuProps {
  menu: FlowContextMenu;
  onClose: () => void;
  onInsertOnEdge: (edge: Edge) => void;
  onDeleteEdge: (edge: Edge) => void;
  onAddAtPosition: (position: XYPosition) => void;
}

const TaskFlowContextMenu = ({
  menu,
  onClose,
  onInsertOnEdge,
  onDeleteEdge,
  onAddAtPosition,
}: TaskFlowContextMenuProps) => (
  <>
    <div
      className="fixed inset-0 z-40"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    />
    <div
      role="menu"
      className="fixed z-50 min-w-44 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-accent focus:bg-accent focus:text-accent-foreground"
        onClick={() => {
          if (menu.kind === "edge") {
            onInsertOnEdge(menu.edge);
          } else {
            onAddAtPosition(menu.position);
          }
        }}
      >
        <Plus className="size-4" />
        {menu.kind === "edge" ? "Add task between" : "Add task here"}
      </button>
      {menu.kind === "edge" ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-destructive outline-hidden select-none hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive"
          onClick={() => onDeleteEdge(menu.edge)}
        >
          <Trash2 className="size-4" />
          Delete edge
        </button>
      ) : null}
    </div>
  </>
);

export default TaskFlowContextMenu;
