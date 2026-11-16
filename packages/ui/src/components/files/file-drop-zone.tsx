import { useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "cn";

interface FileDropZoneProps {
  busy: boolean;
  onFiles: (files: File[]) => void;
  onDirectory: () => void;
}

function containsDirectory(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.items).some((item) => {
    const entry = item.webkitGetAsEntry?.();
    return entry?.isDirectory === true;
  });
}

export function FileDropZone({
  busy,
  onFiles,
  onDirectory,
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);

    if (busy) return;

    if (containsDirectory(event.dataTransfer)) {
      onDirectory();
      return;
    }

    onFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors",
        dragging && "border-primary bg-primary/5",
        busy && "opacity-60",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <Upload className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">
        {dragging ? "Drop to upload and run" : "Drop files here"}
      </p>
      <p className="text-xs text-muted-foreground">
        Folder upload is not supported yet. Multiple files are allowed.
      </p>
    </div>
  );
}
