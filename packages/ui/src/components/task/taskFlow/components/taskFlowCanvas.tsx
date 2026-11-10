import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import type { FlowContextMenu, TaskFlowNode } from "../taskFlowTypes";
import { isValidConnection } from "../services/connection";
import TaskFlowContextMenu from "./taskFlowContextMenu";

interface TaskFlowCanvasProps {
  nodes: TaskFlowNode[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  onNodesChange: OnNodesChange<TaskFlowNode>;
  onConnect: (connection: Connection) => void;
  onEdgesDelete: (edges: Edge[]) => void;
  onDelete: (args: { nodes: TaskFlowNode[]; edges: Edge[] }) => void;
  onNodeClick: (event: React.MouseEvent, node: TaskFlowNode) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent) => void;
  onInit: (instance: ReactFlowInstance<TaskFlowNode, Edge>) => void;
  contextMenu: FlowContextMenu | null;
  onCloseContextMenu: () => void;
  onInsertOnEdge: (edge: Edge) => void;
  onAddAtPosition: (position: XYPosition) => void;
}

const TaskFlowCanvas = ({
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  onConnect,
  onEdgesDelete,
  onDelete,
  onNodeClick,
  onEdgeContextMenu,
  onPaneContextMenu,
  onInit,
  contextMenu,
  onCloseContextMenu,
  onInsertOnEdge,
  onAddAtPosition,
}: TaskFlowCanvasProps) => (
  <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onConnect={onConnect}
      onEdgesDelete={onEdgesDelete}
      onDelete={onDelete}
      onNodeClick={onNodeClick}
      onEdgeContextMenu={onEdgeContextMenu}
      onPaneContextMenu={onPaneContextMenu}
      onPaneClick={onCloseContextMenu}
      onMoveStart={onCloseContextMenu}
      onInit={onInit}
      isValidConnection={isValidConnection}
      deleteKeyCode={["Backspace", "Delete"]}
      fitView
    >
      <Background variant={BackgroundVariant.Dots} />
      <Controls />
    </ReactFlow>

    {contextMenu ? (
      <TaskFlowContextMenu
        menu={contextMenu}
        onClose={onCloseContextMenu}
        onInsertOnEdge={onInsertOnEdge}
        onAddAtPosition={onAddAtPosition}
      />
    ) : null}
  </div>
);

export default TaskFlowCanvas;
