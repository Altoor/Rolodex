"use client";

import { useState, type DragEvent } from "react";

interface UseFileDropOptions {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onDirectory?: () => void;
}

function containsDirectory(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.items).some((item) => {
    const entry = item.webkitGetAsEntry?.();
    return entry?.isDirectory === true;
  });
}

/** Drag-and-drop state for a file drop target. */
export function useFileDrop({
  disabled = false,
  onFiles,
  onDirectory,
}: UseFileDropOptions) {
  const [dragging, setDragging] = useState(false);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;

    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    setDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);

    if (disabled) return;

    if (containsDirectory(event.dataTransfer)) {
      onDirectory?.();
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return { dragging, dropProps: { onDragOver, onDragLeave, onDrop } };
}
