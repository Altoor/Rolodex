import { Upload } from "lucide-react";
import { cn } from "cn";
import { useFileDrop } from "./use-file-drop";

interface FileDropZoneProps {
  busy: boolean;
  onFiles: (files: File[]) => void;
  onDirectory: () => void;
}

export function FileDropZone({
  busy,
  onFiles,
  onDirectory,
}: FileDropZoneProps) {
  const { dragging, dropProps } = useFileDrop({
    disabled: busy,
    onFiles,
    onDirectory,
  });

  return (
    <div
      {...dropProps}
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors",
        dragging && "border-primary bg-primary/5",
        busy && "opacity-60",
      )}
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
