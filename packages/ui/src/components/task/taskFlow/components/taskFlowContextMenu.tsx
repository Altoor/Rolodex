import { ClipboardPaste, Copy, Download, Plus, Trash2 } from "lucide-react";
import type { Edge, XYPosition } from "@xyflow/react";
import type { ReactNode } from "react";
import type { FlowContextMenu } from "../taskFlowTypes";

interface TaskFlowContextMenuProps {
  menu: FlowContextMenu;
  onClose: () => void;
  onInsertOnEdge: (edge: Edge) => void;
  onDeleteEdge: (edge: Edge) => void;
  onAddAtPosition: (position: XYPosition) => void;
  onCopyTasks: (taskIds: number[]) => void;
  onExportTasks: (taskIds: number[]) => void;
  onDeleteTasks: (taskIds: number[]) => void;
  onPasteTasks: (position: XYPosition) => void;
}

interface MenuItemProps {
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

const MenuItem = ({
  icon,
  children,
  onSelect,
  destructive = false,
}: MenuItemProps) => (
  <button
    type="button"
    role="menuitem"
    className={`flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-accent focus:bg-accent focus:text-accent-foreground ${
      destructive ? "text-destructive hover:bg-destructive/10" : ""
    }`}
    onClick={onSelect}
  >
    {icon}
    {children}
  </button>
);

const TaskFlowContextMenu = ({
  menu,
  onClose,
  onInsertOnEdge,
  onDeleteEdge,
  onAddAtPosition,
  onCopyTasks,
  onExportTasks,
  onDeleteTasks,
  onPasteTasks,
}: TaskFlowContextMenuProps) => {
  const taskCount = menu.kind === "nodes" ? menu.taskIds.length : 0;
  const taskLabel = taskCount === 1 ? "task" : `${taskCount} tasks`;

  return (
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
        {menu.kind === "nodes" ? (
          <>
            <MenuItem
              icon={<Copy className="size-4" />}
              onSelect={() => onCopyTasks(menu.taskIds)}
            >
              Copy {taskLabel}
            </MenuItem>
            <MenuItem
              icon={<Download className="size-4" />}
              onSelect={() => onExportTasks(menu.taskIds)}
            >
              Export {taskLabel}
            </MenuItem>
            <MenuItem
              icon={<Trash2 className="size-4" />}
              destructive
              onSelect={() => onDeleteTasks(menu.taskIds)}
            >
              Delete {taskLabel}
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem
              icon={<Plus className="size-4" />}
              onSelect={() => {
                if (menu.kind === "edge") {
                  onInsertOnEdge(menu.edge);
                } else {
                  onAddAtPosition(menu.position);
                }
              }}
            >
              {menu.kind === "edge" ? "Add task between" : "Add task here"}
            </MenuItem>
            {menu.kind === "edge" ? (
              <MenuItem
                icon={<Trash2 className="size-4" />}
                destructive
                onSelect={() => onDeleteEdge(menu.edge)}
              >
                Delete edge
              </MenuItem>
            ) : (
              <MenuItem
                icon={<ClipboardPaste className="size-4" />}
                onSelect={() => onPasteTasks(menu.position)}
              >
                Paste tasks
              </MenuItem>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default TaskFlowContextMenu;
