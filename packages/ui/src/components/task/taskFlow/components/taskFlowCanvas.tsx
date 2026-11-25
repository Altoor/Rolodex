import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  SelectionMode,
  type Connection,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import type { RefObject } from "react";
import type { FlowContextMenu, TaskFlowNode } from "../taskFlowTypes";
import { isValidConnection } from "../services/connection";
import TaskFlowContextMenu from "./taskFlowContextMenu";

interface TaskFlowCanvasProps {
  nodes: TaskFlowNode[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  onNodesChange: OnNodesChange<TaskFlowNode>;
  onConnect: (connection: Connection) => void;
  onReconnect: (oldEdge: Edge, connection: Connection) => void;
  onEdgesDelete: (edges: Edge[]) => void;
  onDelete: (args: { nodes: TaskFlowNode[]; edges: Edge[] }) => void;
  onNodeClick: (event: React.MouseEvent, node: TaskFlowNode) => void;
  onNodeContextMenu: (event: React.MouseEvent, node: TaskFlowNode) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent) => void;
  onInit: (instance: ReactFlowInstance<TaskFlowNode, Edge>) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  contextMenu: FlowContextMenu | null;
  onCloseContextMenu: () => void;
  onInsertOnEdge: (edge: Edge) => void;
  onDeleteEdge: (edge: Edge) => void;
  onAddAtPosition: (position: XYPosition) => void;
  onCopyTasks: (taskIds: number[]) => void;
  onExportTasks: (taskIds: number[]) => void;
  onDeleteTasks: (taskIds: number[]) => void;
  onPasteTasks: (position: XYPosition) => void;
}

const TaskFlowCanvas = ({
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  onConnect,
  onReconnect,
  onEdgesDelete,
  onDelete,
  onNodeClick,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
  onInit,
  containerRef,
  contextMenu,
  onCloseContextMenu,
  onInsertOnEdge,
  onDeleteEdge,
  onAddAtPosition,
  onCopyTasks,
  onExportTasks,
  onDeleteTasks,
  onPasteTasks,
}: TaskFlowCanvasProps) => (
  <div
    ref={containerRef}
    className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-background"
  >
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onConnect={onConnect}
      onReconnect={onReconnect}
      onEdgesDelete={onEdgesDelete}
      onDelete={onDelete}
      onNodeClick={onNodeClick}
      onNodeContextMenu={onNodeContextMenu}
      onEdgeContextMenu={onEdgeContextMenu}
      onPaneContextMenu={onPaneContextMenu}
      onPaneClick={onCloseContextMenu}
      onMoveStart={onCloseContextMenu}
      onInit={onInit}
      isValidConnection={isValidConnection}
      deleteKeyCode={["Backspace", "Delete"]}
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      panOnDrag={[1]}
      multiSelectionKeyCode={["Meta", "Control", "Shift"]}
      minZoom={0.1}
      fitView
      fitViewOptions={{ padding: 0.2 }}
    >
      <Background variant={BackgroundVariant.Dots} />
      <Controls />
    </ReactFlow>

    {contextMenu ? (
      <TaskFlowContextMenu
        menu={contextMenu}
        onClose={onCloseContextMenu}
        onInsertOnEdge={onInsertOnEdge}
        onDeleteEdge={onDeleteEdge}
        onAddAtPosition={onAddAtPosition}
        onCopyTasks={onCopyTasks}
        onExportTasks={onExportTasks}
        onDeleteTasks={onDeleteTasks}
        onPasteTasks={onPasteTasks}
      />
    ) : null}
  </div>
);

export default TaskFlowCanvas;
