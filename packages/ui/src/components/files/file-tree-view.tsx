"use client";

import { useMemo } from "react";
import {
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
} from "lucide-react";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "#components/ui/file-tree";
import type { FileEntry, FileTreeNode } from "./types";

interface FileTreeViewProps {
  nodes: FileTreeNode[];
  selectedId: number | null;
  expandedIds: ReadonlySet<number>;
  onSelect: (entry: FileTreeNode) => void;
  onToggle: (id: number, open: boolean) => void;
}

function FileEntryIcon({ entry }: { entry: FileEntry }) {
  if (entry.kind === "folder") {
    return <Folder className="size-4" />;
  }

  switch (entry.fileType) {
    case "image":
      return <FileImage className="size-4" />;
    case "audio":
      return <FileAudio className="size-4" />;
    case "video":
      return <FileVideo className="size-4" />;
    case "plaintext":
    case "text":
      return <FileText className="size-4" />;
    default:
      return <File className="size-4" />;
  }
}

function flattenNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

export function FileTreeView({
  nodes,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: FileTreeViewProps) {
  const entriesById = useMemo(() => {
    const map = new Map<number, FileTreeNode>();
    for (const node of flattenNodes(nodes)) map.set(node.id, node);
    return map;
  }, [nodes]);

  const renderNode = (node: FileTreeNode) => {
    const icon = <FileEntryIcon entry={node} />;
    const value = String(node.id);

    if (node.kind === "folder") {
      return (
        <FileTreeFolder
          key={node.id}
          name={node.name}
          value={value}
          icon={icon}
          open={expandedIds.has(node.id)}
          onOpenChange={(open) => onToggle(node.id, open)}
        >
          {node.children.map(renderNode)}
        </FileTreeFolder>
      );
    }

    return (
      <FileTreeFile key={node.id} name={node.name} value={value} icon={icon} />
    );
  };

  return (
    <FileTree
      selectedValue={selectedId === null ? undefined : String(selectedId)}
      onSelect={(value) => {
        const entry = entriesById.get(Number(value));
        if (entry) onSelect(entry);
      }}
      aria-label="Files"
    >
      {nodes.map(renderNode)}
    </FileTree>
  );
}
